const CONFIG = {
  journals: [
    'JAMA',
    'N Engl J Med',
    'Lancet',
    'BMJ'
  ],
  // 助教可依課程主題調整藥物相關 MeSH／關鍵字；這些條件會與期刊及日期 AND 合併。
  keywords: [
    'drug therapy[MeSH Terms]',
    'pharmacotherapy',
    'pharmacology[MeSH Terms]'
  ],
  daysBack: 7,
  batchSize: 100,
  batchTranslateSize: 1,
  maxRunMinutes: 5,
  translatingTimeoutMinutes: 10,
  continuationDelayMinutes: 2,
  groqMaxRetries: 2,
  groqRetryBaseDelayMs: 10000,
  groqDelayBetweenCallsMs: 12000,
  groqMaxCompletionTokens: 3000,
  groqReasoningEffort: 'low',
  geminiMaxOutputTokens: 3000,
  geminiMaxRetries: 2,
  geminiRetryBaseDelayMs: 10000,
  geminiDelayBetweenCallsMs: 5000,
  requireAbstract: true,
  excludeArticleTypes: [
    'Letter',
    'Editorial',
    'Comment',
    'News',
    'Erratum',
    'Correction',
    'Reply'
  ],
  driveFolderName: 'PubMed 四大期刊電子報',
  weeklySpreadsheetNamePrefix: '四大期刊電子報工作表',
  newsletterFileNameSuffix: '四大期刊電子報.html',
  groqDefaultModel: 'openai/gpt-oss-20b',
  groqEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
  geminiDefaultModel: 'gemini-3.1-flash-lite',
  geminiEndpointBase: 'https://generativelanguage.googleapis.com/v1beta/models/'
};

const SHEET_NAMES = {
  raw: 'raw_articles',
  selected: 'selected_articles',
  newsletter: 'newsletter',
  runLog: 'run_log',
  config: 'config'
};

const HEADERS = {
  raw: [
    'pmid',
    'title',
    'journal',
    'pub_date',
    'publication_type',
    'has_abstract',
    'abstract',
    'pubmed_url',
    'raw_status',
    'created_at'
  ],
  selected: [
    'pmid',
    'title',
    'journal',
    'pub_date',
    'publication_type',
    'abstract',
    'selection_reason',
    'translate_status',
    'translation_json',
    'error_message',
    'updated_at'
  ],
  newsletter: [
    'pmid',
    'title',
    'journal',
    'pub_date',
    'background',
    'methods',
    'results',
    'conclusion',
    'pubmed_url',
    'html_status',
    'updated_at',
    'title_zh',
    'publication_type'
  ],
  runLog: [
    'run_at',
    'step',
    'status',
    'message',
    'processed_count',
    'error_message'
  ],
  config: [
    'key',
    'value'
  ]
};

const TRANSLATE_STATUS = {
  pending: 'PENDING_TRANSLATION',
  translating: 'TRANSLATING',
  translated: 'TRANSLATED',
  failed: 'TRANSLATE_FAILED',
  skipped: 'SKIPPED'
};

function getScriptSetting_(key, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value || fallback;
}

function getDriveFolderId_() {
  return getScriptSetting_('DRIVE_FOLDER_ID', '');
}

function getPubMedApiKey_() {
  return getScriptSetting_('PUBMED_API_KEY', '');
}

function requirePubMedApiKey_() {
  const apiKey = getPubMedApiKey_();

  if (!apiKey) {
    throw new Error('缺少 Script Property：PUBMED_API_KEY');
  }

  return apiKey;
}

function getGroqApiKey_() {
  return getScriptSetting_('GROQ_API_KEY', '');
}

function getGroqModel_() {
  return getScriptSetting_('GROQ_MODEL', CONFIG.groqDefaultModel);
}

function getGeminiApiKey_() {
  return getScriptSetting_('GEMINI_API_KEY', '');
}

function getGeminiModel_() {
  return getScriptSetting_('GEMINI_MODEL', CONFIG.geminiDefaultModel);
}

function getTranslationProvider_() {
  return getScriptSetting_('TRANSLATION_PROVIDER', 'gemini').toLowerCase();
}
