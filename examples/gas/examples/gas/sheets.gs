function getOrCreateWeeklySpreadsheet_(label) {
  const name = getWeeklySpreadsheetName_(label);
  const folder = getOrCreateOutputFolder_();
  const files = folder.getFilesByName(name);

  if (files.hasNext()) {
    return SpreadsheetApp.openById(files.next().getId());
  }

  const spreadsheet = SpreadsheetApp.create(name);
  const file = DriveApp.getFileById(spreadsheet.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return spreadsheet;
}

function getWeeklySpreadsheetName_(label) {
  const date = formatDate_(new Date());
  const prefix = label ? label + '_' : '';
  return prefix + date + '_' + CONFIG.weeklySpreadsheetNamePrefix;
}

function ensureWorkbook_(spreadsheet) {
  ensureSheet_(spreadsheet, SHEET_NAMES.raw, HEADERS.raw);
  ensureSheet_(spreadsheet, SHEET_NAMES.selected, HEADERS.selected);
  ensureSheet_(spreadsheet, SHEET_NAMES.newsletter, HEADERS.newsletter);
  ensureSheet_(spreadsheet, SHEET_NAMES.runLog, HEADERS.runLog);
  ensureSheet_(spreadsheet, SHEET_NAMES.config, HEADERS.config);
  removeDefaultBlankSheet_(spreadsheet);
  writeConfigSheet_(spreadsheet);
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const existingHeaders = headerRange.getValues()[0];

  if (existingHeaders.join('') !== headers.join('')) {
    headerRange.setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function writeConfigSheet_(spreadsheet) {
  const sheet = ensureSheet_(spreadsheet, SHEET_NAMES.config, HEADERS.config);
  const rows = [
    ['journals', CONFIG.journals.join(', ')],
    ['daysBack', CONFIG.daysBack],
    ['batchSize', CONFIG.batchSize],
    ['batchTranslateSize', CONFIG.batchTranslateSize],
    ['translationProvider', getTranslationProvider_()],
    ['groqMaxCompletionTokens', CONFIG.groqMaxCompletionTokens],
    ['groqReasoningEffort', CONFIG.groqReasoningEffort],
    ['groqModel', getGroqModel_()],
    ['geminiMaxOutputTokens', CONFIG.geminiMaxOutputTokens],
    ['geminiModel', getGeminiModel_()],
    ['driveFolderId', getDriveFolderId_() || '(auto-created folder)']
  ];
  replaceRows_(sheet, HEADERS.config, rows);
}

function writeRawArticles_(spreadsheet, articles) {
  const sheet = ensureSheet_(spreadsheet, SHEET_NAMES.raw, HEADERS.raw);
  const rows = articles.map(function(article) {
    return [
      article.pmid,
      article.title,
      article.journal,
      article.pub_date,
      Array.isArray(article.publication_type) ? article.publication_type.join('; ') : article.publication_type,
      article.has_abstract,
      article.abstract,
      article.pubmed_url,
      article.raw_status,
      article.created_at
    ];
  });

  replaceRows_(sheet, HEADERS.raw, rows);
}

function writeSelectedArticles_(spreadsheet, selectedRows) {
  const sheet = ensureSheet_(spreadsheet, SHEET_NAMES.selected, HEADERS.selected);
  const rows = selectedRows.map(function(article) {
    return [
      article.pmid,
      article.title,
      article.journal,
      article.pub_date,
      article.publication_type,
      article.abstract,
      article.selection_reason,
      article.translate_status,
      article.translation_json || '',
      article.error_message || '',
      article.updated_at
    ];
  });

  replaceRows_(sheet, HEADERS.selected, rows);
}

function writeNewsletterRows_(spreadsheet, newsletterRows) {
  const sheet = ensureSheet_(spreadsheet, SHEET_NAMES.newsletter, HEADERS.newsletter);
  const rows = newsletterRows.map(function(item) {
    return [
      item.pmid,
      item.title,
      item.journal,
      item.pub_date,
      item.background,
      item.methods,
      item.results,
      item.conclusion,
      item.pubmed_url,
      item.html_status,
      item.updated_at,
      item.title_zh || '',
      Array.isArray(item.publication_type) ? item.publication_type.join('; ') : (item.publication_type || '')
    ];
  });

  replaceRows_(sheet, HEADERS.newsletter, rows);
}

function appendRunLog_(spreadsheet, step, status, message, processedCount, errorMessage) {
  const sheet = ensureSheet_(spreadsheet, SHEET_NAMES.runLog, HEADERS.runLog);
  sheet.appendRow([
    new Date().toISOString(),
    step,
    status,
    message,
    processedCount,
    errorMessage
  ]);
}

function replaceRows_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  sheet.autoResizeColumns(1, headers.length);
}

function readObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  return values.slice(1).filter(function(row) {
    return row.join('') !== '';
  }).map(function(row) {
    const object = {};
    headers.forEach(function(header, index) {
      object[header] = row[index];
    });
    return object;
  });
}

function getOrCreateOutputFolder_() {
  const folderId = getDriveFolderId_();
  if (folderId) {
    return DriveApp.getFolderById(folderId);
  }

  const folders = DriveApp.getFoldersByName(CONFIG.driveFolderName);
  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(CONFIG.driveFolderName);
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function removeDefaultBlankSheet_(spreadsheet) {
  const defaultSheet = spreadsheet.getSheetByName('工作表1') || spreadsheet.getSheetByName('Sheet1');
  if (!defaultSheet || spreadsheet.getSheets().length <= 1) {
    return;
  }

  const values = defaultSheet.getDataRange().getValues();
  const hasContent = values.some(function(row) {
    return row.some(function(cell) {
      return String(cell || '').trim() !== '';
    });
  });

  if (!hasContent) {
    spreadsheet.deleteSheet(defaultSheet);
  }
}
