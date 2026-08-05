function runNewsletterPipeline() {
  const startedAt = new Date();
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);

  appendRunLog_(spreadsheet, 'start', 'OK', '開始 PubMed 電子報流程', 0, '');

  const rawRows = fetchPubMedArticles_();
  writeRawArticles_(spreadsheet, rawRows);
  appendRunLog_(spreadsheet, 'fetch', 'OK', 'PubMed 抓取完成', rawRows.length, '');

  const selectedCount = selectArticlesForNewsletter_(spreadsheet);
  appendRunLog_(spreadsheet, 'select', 'OK', '文獻篩選完成', selectedCount, '');

  return translateAndComposeNewsletter_(spreadsheet, startedAt);
}

function continueNewsletterTranslationPipeline_() {
  const startedAt = new Date();
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);

  appendRunLog_(spreadsheet, 'continue', 'OK', '繼續處理待翻譯文獻', 0, '');
  return translateAndComposeNewsletter_(spreadsheet, startedAt);
}

function translateAndComposeNewsletter_(spreadsheet, startedAt) {
  const translateResult = translatePendingArticles_(spreadsheet, startedAt);
  const translateStatus = translateResult.failedCount > 0 || translateResult.warningCount > 0
    ? 'WARNING'
    : 'OK';
  appendRunLog_(
    spreadsheet,
    'translate',
    translateStatus,
    translateResult.message,
    translateResult.processedCount,
    translateResult.errorMessages.concat(translateResult.warningMessages).join('\n')
  );

  if (countPendingTranslations_(spreadsheet) > 0) {
    scheduleContinuation_();
    appendRunLog_(spreadsheet, 'compose', 'WAITING', '仍有文獻待翻譯，已自動排程續跑', 0, '');
    return {
      status: 'WAITING_FOR_TRANSLATION',
      spreadsheetUrl: spreadsheet.getUrl(),
      message: '仍有文獻待翻譯，系統已自動排程續跑。'
    };
  }

  removeContinuationTriggers_();
  syncFailedTranslationsToNewsletter_(spreadsheet);
  const summary = getTranslationSummary_(spreadsheet);
  const file = composeNewsletterHtml_(spreadsheet, false);
  const composeStatus = summary.failed > 0 ? 'WARNING' : 'OK';
  const composeMessage = summary.failed > 0
    ? 'HTML 電子報已產生：' + summary.translated + ' 篇翻譯成功，' + summary.failed + ' 篇翻譯失敗並保留英文摘要'
    : 'HTML 電子報已產生：' + summary.translated + ' 篇翻譯成功';
  appendRunLog_(spreadsheet, 'compose', composeStatus, composeMessage, 1, '');

  const newsletterUrl = getNewsletterViewUrl_() || file.getUrl();
  const lineResult = pushNewsletterLine_(spreadsheet, newsletterUrl);
  appendRunLog_(
    spreadsheet,
    'line',
    lineResult.status,
    lineResult.message,
    lineResult.articleCount || 0,
    lineResult.errorMessage || ''
  );

  const pipelineStatus = lineResult.status === 'LINE_SENT'
    ? (summary.failed > 0 ? 'DONE_WITH_WARNINGS' : 'DONE')
    : 'DONE_WITH_LINE_WARNING';

  return {
    status: pipelineStatus,
    translatedCount: summary.translated,
    failedCount: summary.failed,
    lineStatus: lineResult.status,
    lineMessage: lineResult.message,
    spreadsheetUrl: spreadsheet.getUrl(),
    newsletterUrl: newsletterUrl
  };
}

function runDemoNewsletter() {
  const spreadsheet = getOrCreateWeeklySpreadsheet_('DEMO');
  ensureWorkbook_(spreadsheet);
  writeRawArticles_(spreadsheet, getDemoArticles_());
  selectArticlesForNewsletter_(spreadsheet);
  writeDemoTranslations_(spreadsheet);
  const file = composeNewsletterHtml_(spreadsheet, true);

  appendRunLog_(spreadsheet, 'demo', 'OK', 'Demo HTML 電子報已產生', 1, '');

  return {
    status: 'DONE',
    spreadsheetUrl: spreadsheet.getUrl(),
    newsletterUrl: file.getUrl()
  };
}

function runNewsletterEnglishOnly() {
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);
  removeContinuationTriggers_();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('目前仍有翻譯流程執行中，請稍後再執行英文摘要電子報。');
  }

  try {
    const articleCount = syncSelectedArticlesToEnglishNewsletter_(spreadsheet);
    if (!articleCount) {
      throw new Error('沒有可輸出的已選文獻，請先執行 PubMed 抓取與篩選。');
    }

    const file = composeNewsletterHtml_(spreadsheet, false, {
      mode: 'english',
      title: '四大期刊 PubMed 英文摘要電子報',
      fileName: getEnglishNewsletterFileName_()
    });
    appendRunLog_(
      spreadsheet,
      'compose_english',
      'OK',
      '英文摘要電子報已產生：' + articleCount + ' 篇；未呼叫 AI 翻譯',
      articleCount,
      ''
    );

    return {
      status: 'DONE_ENGLISH_ONLY',
      articleCount: articleCount,
      spreadsheetUrl: spreadsheet.getUrl(),
      newsletterUrl: file.getUrl()
    };
  } finally {
    lock.releaseLock();
  }
}

function runPubMedFetchTest() {
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);
  appendRunLog_(spreadsheet, 'pubmed_test', 'START', '開始測試 PubMed 抓取與篩選', 0, '');

  const rawRows = fetchPubMedArticles_();
  writeRawArticles_(spreadsheet, rawRows);
  const selectedCount = selectArticlesForNewsletter_(spreadsheet);

  appendRunLog_(spreadsheet, 'pubmed_test', 'OK', 'PubMed 測試完成', selectedCount, '');
  return {
    status: 'DONE',
    rawCount: rawRows.length,
    selectedCount: selectedCount,
    spreadsheetUrl: spreadsheet.getUrl()
  };
}

function runPubMedTranslationTest() {
  const startedAt = new Date();
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);

  const result = translatePendingArticles_(spreadsheet, startedAt);
  const status = result.failedCount > 0 || result.warningCount > 0
    ? 'WARNING'
    : (result.processedCount > 0 ? 'OK' : 'CHECK');
  appendRunLog_(spreadsheet, 'translate_test', status, result.message, result.processedCount, result.errorMessages.concat(result.warningMessages).join('\n'));

  return {
    status: status,
    processedCount: result.processedCount,
    failedCount: result.failedCount,
    warningCount: result.warningCount,
    spreadsheetUrl: spreadsheet.getUrl()
  };
}

function runGeminiTranslationTest() {
  const startedAt = new Date();
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);

  const result = translatePendingArticles_(spreadsheet, startedAt, 'gemini');
  const status = result.failedCount > 0 || result.warningCount > 0
    ? 'WARNING'
    : (result.processedCount > 0 ? 'OK' : 'CHECK');
  appendRunLog_(spreadsheet, 'translate_gemini_test', status, result.message, result.processedCount, result.errorMessages.concat(result.warningMessages).join('\n'));

  return {
    status: status,
    provider: 'gemini',
    model: getGeminiModel_(),
    processedCount: result.processedCount,
    failedCount: result.failedCount,
    warningCount: result.warningCount,
    spreadsheetUrl: spreadsheet.getUrl()
  };
}

function runNewsletterComposeTest() {
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);
  syncFailedTranslationsToNewsletter_(spreadsheet);
  const summary = getTranslationSummary_(spreadsheet);
  const file = composeNewsletterHtml_(spreadsheet, false);

  const status = summary.failed > 0 ? 'WARNING' : 'OK';
  const message = summary.failed > 0
    ? 'HTML 電子報測試完成：' + summary.failed + ' 篇翻譯失敗並保留英文摘要'
    : 'HTML 電子報測試完成';
  appendRunLog_(spreadsheet, 'compose_test', status, message, 1, '');
  return {
    status: summary.failed > 0 ? 'DONE_WITH_WARNINGS' : 'DONE',
    translatedCount: summary.translated,
    failedCount: summary.failed,
    spreadsheetUrl: spreadsheet.getUrl(),
    newsletterUrl: file.getUrl()
  };
}

function resetFailedTranslationsForRetry() {
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);
  const resetCount = resetFailedTranslations_(spreadsheet);

  appendRunLog_(
    spreadsheet,
    'translate_reset',
    resetCount > 0 ? 'OK' : 'CHECK',
    resetCount + ' 篇翻譯失敗文獻已重設為待翻譯',
    resetCount,
    ''
  );

  return {
    status: resetCount > 0 ? 'READY_TO_RETRY' : 'NOTHING_TO_RESET',
    resetCount: resetCount,
    spreadsheetUrl: spreadsheet.getUrl()
  };
}

function resetAllTranslationsForRetry() {
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  ensureWorkbook_(spreadsheet);
  const resetCount = resetAllTranslations_(spreadsheet);

  appendRunLog_(
    spreadsheet,
    'translate_reset_all',
    resetCount > 0 ? 'OK' : 'CHECK',
    resetCount + ' 篇文獻已全部重設為待翻譯，舊 newsletter 已清除',
    resetCount,
    ''
  );

  return {
    status: resetCount > 0 ? 'READY_TO_RETRY' : 'NOTHING_TO_RESET',
    resetCount: resetCount,
    spreadsheetUrl: spreadsheet.getUrl()
  };
}

function getDemoArticles_() {
  const now = new Date();
  return [
    {
      pmid: '99900001',
      title: 'Demo randomized trial of a cardiovascular medicine',
      journal: 'N Engl J Med',
      pub_date: formatDate_(now),
      publication_type: ['Journal Article', 'Randomized Controlled Trial'],
      has_abstract: true,
      abstract: 'This demo abstract describes a randomized, double-blind trial in adults with high cardiovascular risk. The intervention reduced the primary composite endpoint compared with placebo, with HR 0.82 and 95% CI 0.74-0.91. Adverse events were similar between groups.',
      pubmed_url: 'https://pubmed.ncbi.nlm.nih.gov/99900001/',
      raw_status: 'DEMO',
      created_at: now.toISOString()
    },
    {
      pmid: '99900002',
      title: 'Demo safety study of an antimicrobial regimen',
      journal: 'JAMA',
      pub_date: formatDate_(now),
      publication_type: ['Journal Article'],
      has_abstract: true,
      abstract: 'This demo abstract summarizes a multicentre observational study evaluating an antimicrobial regimen. The main outcome was treatment discontinuation due to adverse events. Kidney function monitoring was emphasized in the study population.',
      pubmed_url: 'https://pubmed.ncbi.nlm.nih.gov/99900002/',
      raw_status: 'DEMO',
      created_at: now.toISOString()
    }
  ];
}

function writeDemoTranslations_(spreadsheet) {
  const rows = [
    {
      pmid: '99900001',
      title: 'Demo randomized trial of a cardiovascular medicine',
      title_zh: '心血管藥物的示範隨機試驗',
      journal: 'N Engl J Med',
      pub_date: formatDate_(new Date()),
      publication_type: ['Journal Article', 'Randomized Controlled Trial'],
      background: '研究背景：此示範文獻聚焦於高心血管風險成人的藥物治療，臨床問題是介入治療是否能降低主要複合心血管事件。',
      methods: '研究方法：研究為隨機、雙盲試驗，比較介入治療與安慰劑；主要評估指標為複合心血管終點。',
      results: '主要結果：介入治療相較安慰劑可降低主要複合終點風險，風險比（HR）0.82，95% 信賴區間（CI）0.74-0.91；兩組不良事件相近。',
      conclusion: '作者結論：介入治療可降低高心血管風險成人的主要複合終點，且兩組不良事件相近。',
      pubmed_url: 'https://pubmed.ncbi.nlm.nih.gov/99900001/',
      html_status: 'READY',
      updated_at: new Date().toISOString()
    },
    {
      pmid: '99900002',
      title: 'Demo safety study of an antimicrobial regimen',
      title_zh: '抗微生物治療方案的示範安全性研究',
      journal: 'JAMA',
      pub_date: formatDate_(new Date()),
      publication_type: ['Journal Article', 'Observational Study'],
      background: '研究背景：此示範文獻關注抗微生物治療方案的安全性，重點是治療過程中因不良事件停藥的風險。',
      methods: '研究方法：研究為多中心觀察性研究，評估特定抗微生物治療方案與不良事件停藥的關聯。',
      results: '主要結果：摘要強調因不良事件停藥與腎功能監測的重要性，但未提供可進一步量化比較的完整數據。',
      conclusion: '作者結論：研究結果支持在使用此抗微生物治療方案時監測腎功能與不良事件。',
      pubmed_url: 'https://pubmed.ncbi.nlm.nih.gov/99900002/',
      html_status: 'READY',
      updated_at: new Date().toISOString()
    }
  ];

  writeNewsletterRows_(spreadsheet, rows);
}
