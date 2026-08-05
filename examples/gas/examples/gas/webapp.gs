function doGet(e) {
  const page = String(e && e.parameter && e.parameter.page || '').trim().toLowerCase();
  if (page === 'newsletter') {
    return renderLatestNewsletter_();
  }

  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('PubMed 四大期刊電子報')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function renderLatestNewsletter_() {
  const file = getLatestNewsletterFile_();
  if (!file) {
    return HtmlService
      .createHtmlOutput('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>找不到電子報</title><p>找不到今天的 HTML 電子報，請先完成正式流程。</p>')
      .setTitle('找不到電子報');
  }

  return HtmlService
    .createHtmlOutput(file.getBlob().getDataAsString('UTF-8'))
    .setTitle('PubMed 四大期刊電子報');
}

function runDemoFromUi() {
  return runDemoNewsletter();
}

function runPipelineFromUi() {
  return runNewsletterPipeline();
}

function runLinePushTestFromUi() {
  return runLinePushTest();
}

function getSetupStatusFromUi() {
  const pubMedApiKey = getPubMedApiKey_();
  const groqApiKey = getGroqApiKey_();
  const geminiApiKey = getGeminiApiKey_();
  const driveFolderId = getDriveFolderId_();
  const lineStatus = getLineSetupStatus_();

  return {
    scriptId: ScriptApp.getScriptId(),
    hasPubMedApiKey: Boolean(pubMedApiKey),
    hasGroqApiKey: Boolean(groqApiKey),
    groqModel: getGroqModel_(),
    hasGeminiApiKey: Boolean(geminiApiKey),
    geminiModel: getGeminiModel_(),
    translationProvider: getTranslationProvider_(),
    hasDriveFolderId: Boolean(driveFolderId),
    hasLineChannelAccessToken: lineStatus.hasLineChannelAccessToken,
    hasLineUserId: lineStatus.hasLineUserId,
    driveTarget: driveFolderId ? 'Script Properties: DRIVE_FOLDER_ID' : 'Auto-created folder: ' + CONFIG.driveFolderName,
    webAppUrl: ScriptApp.getService().getUrl() || ''
  };
}

function saveGroqSettingsFromUi(groqApiKey, groqModel) {
  const cleanedKey = String(groqApiKey || '').trim();
  const cleanedModel = String(groqModel || '').trim();

  if (!cleanedKey) {
    throw new Error('請輸入 Groq API key');
  }

  if (!/^gsk_/.test(cleanedKey)) {
    throw new Error('Groq API key 通常會以 gsk_ 開頭，請確認貼上的 key 是否正確');
  }

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('GROQ_API_KEY', cleanedKey);

  if (cleanedModel) {
    properties.setProperty('GROQ_MODEL', cleanedModel);
  }

  return getSetupStatusFromUi();
}

function saveGeminiSettingsFromUi(geminiApiKey, geminiModel) {
  const cleanedKey = String(geminiApiKey || '').trim();
  const cleanedModel = String(geminiModel || '').trim();

  if (!cleanedKey) {
    throw new Error('請輸入 Gemini API key');
  }

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('GEMINI_API_KEY', cleanedKey);
  properties.setProperty('TRANSLATION_PROVIDER', 'gemini');

  if (cleanedModel) {
    properties.setProperty('GEMINI_MODEL', cleanedModel);
  }

  return getSetupStatusFromUi();
}

function installWeeklyTriggerFromUi() {
  return installWeeklyNewsletterTrigger();
}

function removeWeeklyTriggerFromUi() {
  return removeWeeklyNewsletterTriggers();
}
