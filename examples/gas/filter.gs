function selectArticlesForNewsletter_(spreadsheet) {
  const rawSheet = spreadsheet.getSheetByName(SHEET_NAMES.raw);
  const selectedSheet = spreadsheet.getSheetByName(SHEET_NAMES.selected);
  const existingByPmid = selectedSheet ? indexByPmid_(readObjects_(selectedSheet)) : {};
  const rawRows = rawSheet ? readObjects_(rawSheet) : [];
  const now = new Date().toISOString();

  const selectedRows = rawRows.map(function(row) {
    const reason = getSelectionReason_(row);
    const existing = existingByPmid[String(row.pmid)] || {};
    const status = reason === 'OK'
      ? (existing.translate_status || TRANSLATE_STATUS.pending)
      : TRANSLATE_STATUS.skipped;

    return {
      pmid: row.pmid,
      title: row.title,
      journal: row.journal,
      pub_date: row.pub_date,
      publication_type: row.publication_type,
      abstract: row.abstract,
      selection_reason: reason,
      translate_status: status,
      translation_json: existing.translation_json || '',
      error_message: existing.error_message || '',
      updated_at: now
    };
  });

  writeSelectedArticles_(spreadsheet, selectedRows);

  return selectedRows.filter(function(row) {
    return row.selection_reason === 'OK';
  }).length;
}

function getSelectionReason_(row) {
  if (CONFIG.requireAbstract && String(row.has_abstract) !== 'true' && row.has_abstract !== true) {
    return 'SKIPPED_NO_ABSTRACT';
  }

  const publicationTypes = String(row.publication_type || '').split(';').map(function(type) {
    return type.trim();
  });

  const excluded = publicationTypes.some(function(type) {
    return CONFIG.excludeArticleTypes.indexOf(type) !== -1;
  });

  if (excluded) {
    return 'SKIPPED_PUBLICATION_TYPE';
  }

  return 'OK';
}

function indexByPmid_(rows) {
  const index = {};
  rows.forEach(function(row) {
    index[String(row.pmid)] = row;
  });
  return index;
}
