const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';

function getLineSetupStatus_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    hasLineChannelAccessToken: Boolean(String(properties.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '').trim()),
    hasLineUserId: Boolean(String(properties.getProperty('LINE_USER_ID') || '').trim())
  };
}

function runLinePushTest() {
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);
  const file = getLatestNewsletterFile_();

  if (!file) {
    const result = {
      status: 'LINE_NO_NEWSLETTER',
      message: '找不到今天的 HTML 電子報，請先完成正式流程。'
    };
    appendRunLog_(spreadsheet, 'line_test', result.status, result.message, 0, '');
    return result;
  }

  const result = pushNewsletterLine_(spreadsheet, getNewsletterViewUrl_() || file.getUrl());
  appendRunLog_(
    spreadsheet,
    'line_test',
    result.status,
    result.message,
    result.articleCount || 0,
    result.errorMessage || ''
  );
  return result;
}

function pushNewsletterLine_(spreadsheet, newsletterUrl) {
  const lineStatus = getLineSetupStatus_();
  if (!lineStatus.hasLineChannelAccessToken || !lineStatus.hasLineUserId) {
    return {
      status: 'LINE_NOT_CONFIGURED',
      message: 'LINE 尚未完成設定，請確認 LINE_CHANNEL_ACCESS_TOKEN 與 LINE_USER_ID。'
    };
  }

  const rows = getReadyNewsletterRowsForLine_(spreadsheet);
  if (!rows.length) {
    return {
      status: 'LINE_NO_NEWSLETTER',
      message: 'newsletter 分頁沒有可推播的 READY 文章。'
    };
  }

  const properties = PropertiesService.getScriptProperties();
  const token = String(properties.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '').trim();
  const userId = String(properties.getProperty('LINE_USER_ID') || '').trim();
  const payload = {
    to: userId,
    messages: [{
      type: 'text',
      text: buildLineNotificationText_(rows, newsletterUrl)
    }]
  };

  try {
    const response = UrlFetchApp.fetch(LINE_PUSH_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload)
    });
    const responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
      return {
        status: 'LINE_FAILED',
        articleCount: rows.length,
        message: 'LINE 推播失敗，請檢查 token、LINE_USER_ID 與好友狀態。',
        errorMessage: 'LINE API HTTP ' + responseCode
      };
    }

    return {
      status: 'LINE_SENT',
      articleCount: rows.length,
      message: 'LINE 通知已傳送。'
    };
  } catch (error) {
    return {
      status: 'LINE_FAILED',
      articleCount: rows.length,
      message: 'LINE 推播失敗，請檢查網路與 LINE 設定。',
      errorMessage: String(error && error.message || error)
    };
  }
}

function getReadyNewsletterRowsForLine_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.newsletter);
  const rows = sheet ? readObjects_(sheet) : [];
  return rows.filter(function(row) {
    return String(row.html_status || '').toUpperCase() === 'READY';
  });
}

function buildLineNotificationText_(rows, newsletterUrl) {
  const counts = {};
  const order = [];
  rows.forEach(function(row) {
    const label = getStudyTypeLabel_(row.publication_type) || '其他研究';
    if (!counts[label]) {
      counts[label] = 0;
      order.push(label);
    }
    counts[label]++;
  });

  const categoryLines = order.map(function(label) {
    return label + '：' + counts[label] + ' 篇';
  });

  return [
    'PubMed 電子報已完成',
    '文章數：' + rows.length + ' 篇',
    '研究類型：',
    categoryLines.join('\n'),
    '直接閱讀電子報：',
    newsletterUrl
  ].join('\n');
}

function getNewsletterViewUrl_() {
  const webAppUrl = String(ScriptApp.getService().getUrl() || '').trim();
  return webAppUrl ? webAppUrl + '?page=newsletter' : '';
}

function getLatestNewsletterFile_() {
  const folder = getOrCreateOutputFolder_();
  const files = folder.getFilesByName(getNewsletterFileName_(false));
  let latest = null;
  while (files.hasNext()) {
    const file = files.next();
    if (!latest || file.getLastUpdated().getTime() > latest.getLastUpdated().getTime()) {
      latest = file;
    }
  }
  return latest;
}
