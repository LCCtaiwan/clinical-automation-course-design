const TRANSLATION_TEXT_FIELDS = ['title_zh', 'background', 'methods', 'results', 'conclusion'];

function translatePendingArticles_(spreadsheet, startedAt, providerOverride) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return {
      processedCount: 0,
      attemptedCount: 0,
      failedCount: 0,
      warningCount: 0,
      errorMessages: [],
      warningMessages: [],
      message: '已有其他翻譯流程正在執行，本次略過'
    };
  }

  try {
    const provider = normalizeTranslationProvider_(providerOverride || getTranslationProvider_());
    const apiKey = getTranslationApiKey_(provider);
    if (!apiKey) {
      throw new Error('缺少 Script Properties：' + getTranslationApiKeyProperty_(provider) + '。請先在 GAS 專案設定中加入。');
    }

    const selectedSheet = spreadsheet.getSheetByName(SHEET_NAMES.selected);
    const rows = readObjects_(selectedSheet);
    const now = new Date();
    const targetRows = rows.filter(function(row) {
      if (row.selection_reason !== 'OK') {
        return false;
      }
      if (row.translate_status === TRANSLATE_STATUS.pending) {
        return true;
      }
      if (row.translate_status === TRANSLATE_STATUS.translating) {
        return isStaleTranslating_(row.updated_at, now);
      }
      if (row.translate_status === TRANSLATE_STATUS.failed) {
        return isRetryableTranslationError_(row.error_message);
      }
      return false;
    }).slice(0, CONFIG.batchTranslateSize);

    let processedCount = 0;
    let attemptedCount = 0;
    let failedCount = 0;
    let warningCount = 0;
    const errorMessages = [];
    const warningMessages = [];

    for (let i = 0; i < targetRows.length; i++) {
      if (shouldStop_(startedAt)) {
        break;
      }

      const target = targetRows[i];
      attemptedCount++;
      updateSelectedStatus_(spreadsheet, target.pmid, TRANSLATE_STATUS.translating, '', '', new Date().toISOString());
      SpreadsheetApp.flush();

      try {
        const translationResult = callTranslationProviderForArticle_(target, provider, apiKey);
        const translated = translationResult.translation;
        const rowWarnings = translationResult.warnings;
        const warningMessage = rowWarnings.length
          ? 'WARNING：' + rowWarnings.join('；')
          : '';
        updateSelectedStatus_(
          spreadsheet,
          target.pmid,
          TRANSLATE_STATUS.translated,
          JSON.stringify(translated),
          warningMessage,
          new Date().toISOString()
        );
        upsertNewsletterRow_(spreadsheet, target, translated);
        processedCount++;
        if (rowWarnings.length) {
          warningCount++;
          warningMessages.push('PMID ' + target.pmid + '：' + rowWarnings.join('；'));
        }
        Utilities.sleep(getTranslationDelayMs_(provider));
      } catch (error) {
        const errorMessage = error && error.message ? error.message : String(error);
        updateSelectedStatus_(
          spreadsheet,
          target.pmid,
          TRANSLATE_STATUS.failed,
          '',
          errorMessage,
          new Date().toISOString()
        );
        failedCount++;
        errorMessages.push('PMID ' + target.pmid + '：' + errorMessage);
      }
    }

    if (failedCount > 0) {
      syncFailedTranslationsToNewsletter_(spreadsheet);
    }

    const message = attemptedCount === 0
      ? '沒有可處理的待翻譯文獻'
      : processedCount + ' 篇翻譯成功，'
        + failedCount + ' 篇翻譯失敗，'
        + warningCount + ' 篇需人工抽查';

    return {
      processedCount: processedCount,
      attemptedCount: attemptedCount,
      failedCount: failedCount,
      warningCount: warningCount,
      errorMessages: errorMessages,
      warningMessages: warningMessages,
      message: message
    };
  } finally {
    lock.releaseLock();
  }
}

function callTranslationProviderForArticle_(article, provider, apiKey) {
  const protectedData = protectArticleTerms_(article);
  const promptArticle = protectedData.article;
  const draft = callTranslationJson_(
    [
      {
        role: 'system',
        content: '你是協助台灣醫院藥師閱讀 PubMed 文獻的翻譯編輯。請只根據輸入內容，以自然、精準的台灣繁體中文整理，並只輸出符合指定 schema 的 JSON。'
      },
      {
        role: 'user',
        content: buildTranslationPrompt_(promptArticle)
      }
    ],
    provider,
    apiKey
  );

  ensureTranslationPmid_(article, draft);

  let reviewed;
  if (provider === 'gemini') {
    reviewed = draft;
  } else {
    Utilities.sleep(getTranslationDelayMs_(provider));
    try {
      reviewed = callTranslationJson_(
        [
          {
            role: 'system',
            content: '你是臨床文獻的證據校對編輯。你的任務是把草稿修正成可逐句由來源 title 或 abstract 支持、自然易讀的台灣繁體中文 JSON；藥物名、trial name、來源縮寫、基因、受體、biomarker、量表及無可靠中文譯名的專有名詞保留 exact English spelling，其餘一般醫學與研究敘述翻成繁中。不得使用外部知識、猜測或臨床常識補內容。如果草稿與來源不一致，直接刪除或改成來源可支持的內容與方向。只輸出符合指定 schema 的 JSON。'
          },
          {
            role: 'user',
            content: buildTranslationReviewPrompt_(promptArticle, draft)
          }
        ],
        provider,
        apiKey
      );
    } catch (error) {
      if (!isTranslationQuotaError_(provider, error)) {
        throw error;
      }
      reviewed = draft;
    }
  }

  ensureTranslationPmid_(article, reviewed);
  let finalTranslation = restoreProtectedTerms_(reviewed, protectedData.termMap);
  finalTranslation = normalizeSourceAbbreviationCase_(article, finalTranslation);
  ensureRequiredTranslationFields_(finalTranslation);

  return {
    translation: finalTranslation,
    warnings: getTranslationQualityWarnings_(article, finalTranslation)
  };
}

function normalizeTranslationProvider_(provider) {
  const normalized = String(provider || '').toLowerCase();
  if (normalized !== 'groq' && normalized !== 'gemini') {
    throw new Error('不支援的 TRANSLATION_PROVIDER：' + provider + '。請使用 groq 或 gemini。');
  }
  return normalized;
}

function getTranslationApiKeyProperty_(provider) {
  return provider === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY';
}

function getTranslationApiKey_(provider) {
  return provider === 'gemini' ? getGeminiApiKey_() : getGroqApiKey_();
}

function getTranslationDelayMs_(provider) {
  return provider === 'gemini'
    ? CONFIG.geminiDelayBetweenCallsMs
    : CONFIG.groqDelayBetweenCallsMs;
}

function callTranslationJson_(messages, provider, apiKey) {
  return provider === 'gemini'
    ? callGeminiJson_(messages, apiKey)
    : callGroqJson_(messages, apiKey);
}

function callGroqJson_(messages, apiKey) {
  const payload = {
    model: getGroqModel_(),
    messages: messages,
    temperature: 0,
    max_completion_tokens: CONFIG.groqMaxCompletionTokens,
    reasoning_effort: CONFIG.groqReasoningEffort,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'pubmed_newsletter_translation',
        strict: true,
        schema: getTranslationJsonSchema_(true)
      }
    }
  };

  let response;
  let code;
  let text;

  for (let attempt = 0; attempt <= CONFIG.groqMaxRetries; attempt++) {
    response = UrlFetchApp.fetch(CONFIG.groqEndpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    code = response.getResponseCode();
    text = response.getContentText();

    if (!isRetryableGroqResponse_(code, text)) {
      break;
    }

    if (attempt < CONFIG.groqMaxRetries) {
      Utilities.sleep(getGroqRetryDelay_(text, attempt));
    }
  }

  if (code >= 300) {
    throw new Error('Groq API 失敗：HTTP ' + code + ' ' + text.slice(0, 300));
  }

  const data = JSON.parse(text);
  const content = data.choices[0].message.content;
  const parsed = parseJsonObject_(content);

  return parsed;
}

function callGeminiJson_(messages, apiKey) {
  const systemText = messages.filter(function(message) {
    return message.role === 'system';
  }).map(function(message) {
    return message.content;
  }).join('\n\n');
  const userText = messages.filter(function(message) {
    return message.role !== 'system';
  }).map(function(message) {
    return message.content;
  }).join('\n\n');
  const payload = {
    systemInstruction: {
      parts: [
        { text: systemText }
      ]
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: userText }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: CONFIG.geminiMaxOutputTokens,
      thinkingConfig: {
        thinkingLevel: 'minimal'
      },
      responseMimeType: 'application/json',
      responseSchema: getTranslationJsonSchema_(false)
    }
  };
  const url = CONFIG.geminiEndpointBase
    + encodeURIComponent(getGeminiModel_())
    + ':generateContent';
  let response;
  let code;
  let text;

  for (let attempt = 0; attempt <= CONFIG.geminiMaxRetries; attempt++) {
    response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-goog-api-key': apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    code = response.getResponseCode();
    text = response.getContentText();

    if (!isRetryableGeminiResponse_(code)) {
      break;
    }

    if (attempt < CONFIG.geminiMaxRetries) {
      Utilities.sleep(CONFIG.geminiRetryBaseDelayMs * (attempt + 1));
    }
  }

  if (code >= 300) {
    throw new Error('Gemini API 失敗：HTTP ' + code + ' ' + text.slice(0, 300));
  }

  const data = JSON.parse(text);
  const candidates = data.candidates || [];
  const candidate = candidates.length ? candidates[0] : {};
  const parts = candidate.content
    ? candidate.content.parts || []
    : [];
  const content = parts.filter(function(part) {
    return !part.thought;
  }).map(function(part) {
    return part.text || '';
  }).join('');

  if (!content) {
    throw new Error(
      'Gemini API 未回傳最終文字內容；finishReason=' + (candidate.finishReason || 'UNKNOWN')
    );
  }

  try {
    return parseJsonObject_(content);
  } catch (error) {
    throw new Error(
      'Gemini API 回傳無法解析為 JSON；finishReason='
      + (candidate.finishReason || 'UNKNOWN')
      + '；內容=' + content.slice(0, 300)
    );
  }
}

function getTranslationJsonSchema_(strict) {
  const schema = {
    type: 'object',
    properties: {
      pmid: {
        type: 'string'
      },
      title_zh: {
        type: 'string'
      },
      background: {
        type: 'string'
      },
      methods: {
        type: 'string'
      },
      results: {
        type: 'string'
      },
      conclusion: {
        type: 'string'
      }
    },
    required: [
      'pmid',
      'title_zh',
      'background',
      'methods',
      'results',
      'conclusion'
    ]
  };

  if (strict) {
    schema.additionalProperties = false;
  }

  return schema;
}

function ensureTranslationPmid_(article, translated) {
  if (String(translated.pmid) !== String(article.pmid)) {
    throw new Error('AI 回傳 PMID 與輸入不一致');
  }
}

function ensureRequiredTranslationFields_(translated) {
  TRANSLATION_TEXT_FIELDS.forEach(function(name) {
    if (!String(translated[name] || '').trim()) {
      throw new Error('AI 回傳必要欄位為空白：' + name);
    }
  });
}

function protectArticleTerms_(article) {
  const protectedArticle = Object.assign({}, article);
  const sourceText = [article.title || '', article.abstract || ''].join('\n');
  const terms = getRequiredEnglishTerms_(article).slice().sort(function(a, b) {
    return b.length - a.length;
  });
  const termMap = [];

  terms.forEach(function(term, index) {
    const sourceMatch = sourceText.match(new RegExp(escapeRegExp_(term), 'i'));
    if (!sourceMatch) {
      return;
    }
    const token = '__TERM_' + String(index + 1).padStart(3, '0') + '__';
    const exactTerm = sourceMatch[0];
    const pattern = new RegExp(escapeRegExp_(term), 'gi');
    protectedArticle.title = String(protectedArticle.title || '').replace(pattern, token);
    protectedArticle.abstract = String(protectedArticle.abstract || '').replace(pattern, token);
    termMap.push({
      token: token,
      term: exactTerm
    });
  });

  protectedArticle._termMap = termMap;
  return {
    article: protectedArticle,
    termMap: termMap
  };
}

function restoreProtectedTerms_(translated, termMap) {
  const restored = Object.assign({}, translated);
  TRANSLATION_TEXT_FIELDS.forEach(function(name) {
    let value = String(restored[name] || '');
    termMap.forEach(function(item) {
      value = value.split(item.token).join(item.term);
    });
    restored[name] = value;
  });
  return restored;
}

function escapeRegExp_(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTranslationReviewPrompt_(article, draft) {
  const protectedTermMap = article._termMap || [];
  return [
    '請依原始文獻資料逐句校對並重寫草稿。',
    '',
    '必查項目：',
    '- title_zh 必須是自然的台灣繁中標題；藥名、trial name 與來源縮寫可保留英文，不得整行照抄英文原標題。',
    '- 每個事實、限制、建議與判斷都必須能指向原文句子；原文沒有的「尚缺乏證據」、「安全性符合預期」、「長期資料不足」或未來研究建議一律刪除。',
    '- 不得自行推斷 multicenter、analysis method、intention-to-treat、follow-up duration、safety similarity 或 tolerability。',
    '- 劑量、頻率、療程、樣本數、分母、時間、單位、正負號與小數必須逐字對照。',
    '- higher、lower、more、fewer、increase、decrease、no difference 與 not significant 等方向語句必須與原文數字和結論一致。',
    '- 不得把 treatment duration 改寫為 follow-up duration，也不得把 completers 改寫成結果分析的唯一族群。',
    '- 藥物名、trial name、來源縮寫、基因／受體、biomarker、量表及無可靠中文譯名的專有名詞必須使用原文 exact English spelling。',
    '- 常見疾病、解剖、研究設計、終點、統計全名與敘述句必須翻譯成台灣繁體中文；不得為了保留術語而整句或整段照抄英文。',
    '- 原文未使用的縮寫不得出現；例如原文只寫 disease-free survival，不得自行寫 DFS。',
    '- adverse events of grade 3 or higher 不等於 serious adverse events；除非原文明寫，不得互換。',
    '- 原文因 multiplicity 而停止後續推論時，不得將未推論的次要終點寫成「無差異」。',
    '- 下列保護碼必須逐字保留在輸出中，系統會在完成後還原英文術語：' + JSON.stringify(protectedTermMap),
    '',
    '原始文獻資料：',
    JSON.stringify({
      pmid: article.pmid,
      title: article.title,
      journal: article.journal,
      pub_date: article.pub_date,
      publication_type: article.publication_type,
      abstract: article.abstract
    }),
    '',
    '待校對草稿：',
    JSON.stringify(draft),
    '',
    '只輸出修正後的單一 JSON 物件。'
  ].join('\n');
}

function getTranslationQualityWarnings_(article, translated) {
  const sourceText = [article.title || '', article.abstract || ''].join('\n');
  const contentFieldNames = ['background', 'methods', 'results', 'conclusion'];
  const outputFields = contentFieldNames.map(function(name) {
    return translated[name] || '';
  });
  const titleZh = String(translated.title_zh || '');
  const outputText = [titleZh].concat(outputFields).join('\n');
  const sourceAbbreviations = indexStrings_(extractAbbreviationTokens_(sourceText));
  const outputAbbreviations = extractAbbreviationTokens_(outputText);
  const inventedAbbreviations = outputAbbreviations.filter(function(token) {
    return !sourceAbbreviations[token];
  });
  const errors = [];
  const missingEnglishTerms = getRequiredEnglishTerms_(article).filter(function(term) {
    return outputText.toLowerCase().indexOf(term.toLowerCase()) === -1;
  });

  const titleCjkCount = (titleZh.match(/[\u3400-\u9fff]/g) || []).length;
  if (titleCjkCount < 4 || titleZh.trim().toLowerCase() === String(article.title || '').trim().toLowerCase()) {
    errors.push('title_zh 缺少可讀的繁體中文標題');
  }

  outputFields.forEach(function(field, index) {
    const cjkCount = (String(field).match(/[\u3400-\u9fff]/g) || []).length;
    if (cjkCount < 8) {
      errors.push(contentFieldNames[index] + ' 缺少可讀的繁體中文內容');
    }
  });

  if (inventedAbbreviations.length) {
    errors.push('來源未出現的縮寫：' + inventedAbbreviations.join(', '));
  }

  if (missingEnglishTerms.length) {
    errors.push('未逐字保留來源英文術語：' + missingEnglishTerms.join(', '));
  }

  const narrativeArtifacts = extractNarrativeLabelArtifacts_(outputText);
  if (narrativeArtifacts.length) {
    errors.push('含有未翻譯的摘要標籤或一般英文大寫詞：' + narrativeArtifacts.join(', '));
  }

  const repeatedAbbreviationExpansions = getRepeatedAbbreviationExpansions_(article, outputText);
  if (repeatedAbbreviationExpansions.length) {
    errors.push('縮寫被重複展開：' + repeatedAbbreviationExpansions.join(', '));
  }

  if (
    sourceText.toLowerCase().indexOf('carbon monoxide') !== -1
    && /(carbon dioxide|CO\s*2|CO₂)/i.test(outputText)
  ) {
    errors.push('carbon monoxide 不得改成 carbon dioxide 或 CO₂');
  }

  if (
    /(尚未明確|證據不足|仍待確認|仍需.{0,8}研究|長期.{0,8}不足)/.test(outputText)
    && !/(unknown|uncertain|insufficient|additional data|further research|immature)/i.test(sourceText)
  ) {
    errors.push('不得新增原文未支持的證據缺口或未來研究判斷');
  }

  if (
    /(追蹤|評估期間).{0,12}(?:2|兩)\s*年/.test(outputText)
    && !/(follow-up|follow up|over a period of 2 years|at 2 years|24 months)/i.test(sourceText)
  ) {
    errors.push('不得把 2 年療程改寫成追蹤或評估期間');
  }

  return errors;
}

function extractAbbreviationTokens_(text) {
  const matches = String(text || '').match(/\b[A-Z][A-Z0-9-]{1,12}\b/g) || [];
  const seen = {};
  return matches.filter(function(token) {
    if (seen[token]) {
      return false;
    }
    seen[token] = true;
    return true;
  });
}

function extractNarrativeLabelArtifacts_(text) {
  const matches = String(text || '').match(/\b(?:BACKGROUND|IMPORTANCE|OBJECTIVE|METHODS|DESIGN|SETTING|PARTICIPANTS|INTERVENTIONS|EXPOSURE|OUTCOMES|RESULTS|CONCLUSIONS|TRIAL)\b/g) || [];
  return Object.keys(indexStrings_(matches));
}

function getRepeatedAbbreviationExpansions_(article, outputText) {
  const sourceText = [article.title || '', article.abstract || ''].join('\n');
  return extractDefinedAbbreviations_(sourceText).filter(function(abbreviation) {
    const expansion = findSourceExpansionForAbbreviation_(sourceText, abbreviation);
    if (!expansion) {
      return false;
    }
    const pattern = new RegExp('[（(\\[]\\s*' + escapeRegExp_(expansion) + '\\s*[）)\\]]', 'i');
    return pattern.test(outputText);
  });
}

function normalizeSourceAbbreviationCase_(article, translated) {
  const sourceText = [article.title || '', article.abstract || ''].join('\n');
  const sourceAbbreviations = extractAbbreviationTokens_(sourceText);
  const normalized = Object.assign({}, translated);

  TRANSLATION_TEXT_FIELDS.forEach(function(name) {
    let value = String(normalized[name] || '');
    sourceAbbreviations.forEach(function(token) {
      value = value.replace(
        new RegExp('\\b' + escapeRegExp_(token) + '\\b', 'gi'),
        token
      );
    });
    normalized[name] = value;
  });

  return normalized;
}

function findSourceExpansionForAbbreviation_(sourceText, abbreviation) {
  if (!/^[A-Z]{2,8}$/.test(abbreviation)) {
    return '';
  }

  const preferredExpansions = {
    HR: 'hazard ratio',
    DFS: 'disease-free survival',
    OS: 'overall survival'
  };
  const preferred = preferredExpansions[abbreviation];
  if (preferred) {
    const preferredPattern = new RegExp('\\b' + preferred.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    const preferredMatch = sourceText.match(preferredPattern);
    if (preferredMatch) {
      return preferredMatch[0];
    }
  }

  const words = [];
  const wordPattern = /[A-Za-z]+/g;
  let match;
  while ((match = wordPattern.exec(sourceText)) !== null) {
    words.push({
      value: match[0],
      start: match.index,
      end: wordPattern.lastIndex
    });
  }

  for (let i = 0; i <= words.length - abbreviation.length; i++) {
    const window = words.slice(i, i + abbreviation.length);
    const initials = window.map(function(word) {
      return word.value.charAt(0).toUpperCase();
    }).join('');
    if (initials !== abbreviation) {
      continue;
    }
    const phrase = sourceText.slice(window[0].start, window[window.length - 1].end);
    if (/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/.test(phrase)) {
      return phrase;
    }
  }

  return '';
}

function indexStrings_(items) {
  return items.reduce(function(index, item) {
    index[item] = true;
    return index;
  }, {});
}

function isRetryableGroqResponse_(code, responseText) {
  if (code === 429) {
    return true;
  }

  if (code !== 400) {
    return false;
  }

  const text = String(responseText || '');
  return text.indexOf('json_validate_failed') !== -1
    || text.indexOf('Failed to validate JSON') !== -1;
}

function isGroqDailyQuotaError_(error) {
  const text = error && error.message ? error.message : String(error || '');
  return text.indexOf('HTTP 429') !== -1
    && text.indexOf('tokens per day (TPD)') !== -1;
}

function isRetryableGeminiResponse_(code) {
  return code === 429 || code === 500 || code === 503;
}

function isTranslationQuotaError_(provider, error) {
  if (provider === 'groq') {
    return isGroqDailyQuotaError_(error);
  }

  const text = error && error.message ? error.message : String(error || '');
  return text.indexOf('HTTP 429') !== -1
    || text.indexOf('RESOURCE_EXHAUSTED') !== -1;
}

function getGroqRetryDelay_(responseText, attempt) {
  const match = String(responseText || '').match(/try again in ([0-9.]+)s/i);
  if (match) {
    return Math.ceil(Number(match[1]) * 1000) + 1000;
  }

  return CONFIG.groqRetryBaseDelayMs * (attempt + 1);
}

function buildTranslationPrompt_(article) {
  const protectedTermMap = article._termMap || [];

  return [
    '請只根據以下單篇 PubMed 文獻的 title 與 abstract，翻譯成適合台灣醫院藥師閱讀的繁體中文摘要。不可查找或補入其他資料。',
    '',
    '只輸出單一 JSON 物件，不要 Markdown 或額外說明：',
    '{"pmid":"12345678","title_zh":"...","background":"...","methods":"...","results":"...","conclusion":"..."}',
    '',
    '規則：',
    '- 使用自然、精簡、臨床導向的台灣繁體中文，語氣像院內藥訊。',
    '- title_zh 翻譯標題；background、methods、results、conclusion 依原摘要內容整理。',
    '- 藥名、trial name、基因、biomarker、量表、期刊名及必要縮寫保留英文；一般研究設計、疾病名稱、臨床概念與統計描述翻成自然繁中。',
    '- 保留原文的重要樣本數、劑量、時間、百分比、效果量、信賴區間、P 值、安全性結果與比較方向。',
    '- 不可新增原文沒有的事實、限制、建議或結論；資料不足時寫「摘要未提供」。',
    '- conclusion 忠實整理作者結論，不新增治療建議。',
    protectedTermMap.length
      ? '- 下列保護碼已放入原文，請原樣保留，系統稍後會還原英文術語：' + JSON.stringify(protectedTermMap)
      : '- 本篇沒有受保護術語代碼。',
    '',
    '文獻資料：',
    JSON.stringify({
      pmid: article.pmid,
      title: article.title,
      journal: article.journal,
      pub_date: article.pub_date,
      publication_type: article.publication_type,
      abstract: article.abstract,
      pubmed_url: article.pubmed_url || ('https://pubmed.ncbi.nlm.nih.gov/' + article.pmid + '/')
    })
  ].join('\n');
}

function getRequiredEnglishTerms_(article) {
  const sourceText = [article.title || '', article.abstract || ''].join('\n');
  const terms = [];
  const seen = {};
  const addTerm = function(term) {
    const value = String(term || '').trim();
    const key = value.toLowerCase();
    if (value && !seen[key] && sourceText.toLowerCase().indexOf(key) !== -1) {
      seen[key] = true;
      terms.push(value);
    }
  };

  extractDefinedAbbreviations_(sourceText).forEach(function(abbreviation) {
    addTerm(abbreviation);
  });

  [
    'parathyroid hormone analogue',
    'melanocortin-4 receptor agonist',
    'serum procollagen type 1 N-terminal propeptide',
    'C-terminal telopeptide of type 1 collagen',
    'type 1 collagen genes',
    'diffusing capacity of the lungs for carbon monoxide'
  ].forEach(addTerm);

  return terms.slice(0, 30);
}

function extractDefinedAbbreviations_(sourceText) {
  const matches = String(sourceText || '').match(/[\[(][A-Z][A-Z0-9-]{1,12}[\])]/g) || [];
  const seen = {};
  return matches.map(function(value) {
    return value.slice(1, -1);
  }).filter(function(value) {
    if (seen[value]) {
      return false;
    }
    seen[value] = true;
    return true;
  });
}

function parseJsonObject_(text) {
  const cleaned = String(text).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1) {
    throw new Error('AI 回傳不是 JSON 物件');
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function updateSelectedStatus_(spreadsheet, pmid, status, translationJson, errorMessage, updatedAt) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.selected);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const pmidIndex = headers.indexOf('pmid');
  const statusIndex = headers.indexOf('translate_status');
  const translationIndex = headers.indexOf('translation_json');
  const errorIndex = headers.indexOf('error_message');
  const updatedIndex = headers.indexOf('updated_at');

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][pmidIndex]) === String(pmid)) {
      sheet.getRange(rowIndex + 1, statusIndex + 1).setValue(status);
      sheet.getRange(rowIndex + 1, translationIndex + 1).setValue(translationJson);
      sheet.getRange(rowIndex + 1, errorIndex + 1).setValue(errorMessage);
      sheet.getRange(rowIndex + 1, updatedIndex + 1).setValue(updatedAt);
      return;
    }
  }
}

function upsertNewsletterRow_(spreadsheet, source, translated) {
  const sheet = ensureSheet_(spreadsheet, SHEET_NAMES.newsletter, HEADERS.newsletter);
  const rows = readObjects_(sheet).filter(function(row) {
    return String(row.pmid) !== String(source.pmid);
  });

  rows.push({
    pmid: source.pmid,
    title: source.title,
    title_zh: translated.title_zh,
    journal: source.journal,
    pub_date: source.pub_date,
    publication_type: source.publication_type,
    background: translated.background,
    methods: translated.methods,
    results: translated.results,
    conclusion: translated.conclusion,
    pubmed_url: source.pubmed_url || ('https://pubmed.ncbi.nlm.nih.gov/' + source.pmid + '/'),
    html_status: 'READY',
    updated_at: new Date().toISOString()
  });

  writeNewsletterRows_(spreadsheet, rows);
}

function syncFailedTranslationsToNewsletter_(spreadsheet) {
  const selectedSheet = spreadsheet.getSheetByName(SHEET_NAMES.selected);
  const newsletterSheet = ensureSheet_(spreadsheet, SHEET_NAMES.newsletter, HEADERS.newsletter);
  const selectedRows = selectedSheet ? readObjects_(selectedSheet) : [];
  const failedRows = selectedRows.filter(function(row) {
    return row.selection_reason === 'OK'
      && row.translate_status === TRANSLATE_STATUS.failed;
  });

  if (!failedRows.length) {
    return 0;
  }

  const failedByPmid = indexByPmid_(failedRows);
  const newsletterRows = readObjects_(newsletterSheet).filter(function(row) {
    return !failedByPmid[String(row.pmid)];
  });

  failedRows.forEach(function(row) {
    newsletterRows.push(buildFailedNewsletterRow_(row));
  });

  writeNewsletterRows_(spreadsheet, newsletterRows);
  return failedRows.length;
}

function buildFailedNewsletterRow_(source) {
  return {
    pmid: source.pmid,
    title: source.title,
    title_zh: '',
    journal: source.journal,
    pub_date: source.pub_date,
    publication_type: source.publication_type,
    background: '翻譯失敗，請查閱 PubMed 原文。',
    methods: 'AI 未能完成本篇文獻的繁體中文結構化摘要。',
    results: '以下保留英文摘要供人工查閱：\n' + String(source.abstract || '摘要未提供'),
    conclusion: '翻譯失敗，請查閱原文；不可依本段內容直接作成臨床決策。',
    pubmed_url: 'https://pubmed.ncbi.nlm.nih.gov/' + source.pmid + '/',
    html_status: 'READY',
    updated_at: new Date().toISOString()
  };
}

function getTranslationSummary_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.selected);
  const rows = sheet ? readObjects_(sheet).filter(function(row) {
    return row.selection_reason === 'OK';
  }) : [];

  return rows.reduce(function(summary, row) {
    if (row.translate_status === TRANSLATE_STATUS.translated) {
      summary.translated++;
    } else if (row.translate_status === TRANSLATE_STATUS.failed) {
      summary.failed++;
    } else if (
      row.translate_status === TRANSLATE_STATUS.pending
      || row.translate_status === TRANSLATE_STATUS.translating
    ) {
      summary.pending++;
    }
    return summary;
  }, {
    total: rows.length,
    translated: 0,
    failed: 0,
    pending: 0
  });
}

function resetFailedTranslations_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.selected);
  if (!sheet) {
    return 0;
  }

  const failedRows = readObjects_(sheet).filter(function(row) {
    return row.selection_reason === 'OK'
      && row.translate_status === TRANSLATE_STATUS.failed;
  });

  failedRows.forEach(function(row) {
    updateSelectedStatus_(
      spreadsheet,
      row.pmid,
      TRANSLATE_STATUS.pending,
      '',
      '',
      new Date().toISOString()
    );
  });

  return failedRows.length;
}

function resetAllTranslations_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.selected);
  if (!sheet) {
    return 0;
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return 0;
  }

  const headers = values[0];
  const selectionIndex = headers.indexOf('selection_reason');
  const statusIndex = headers.indexOf('translate_status');
  const translationIndex = headers.indexOf('translation_json');
  const errorIndex = headers.indexOf('error_message');
  const updatedIndex = headers.indexOf('updated_at');
  const now = new Date().toISOString();
  let resetCount = 0;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (values[rowIndex][selectionIndex] !== 'OK') {
      continue;
    }

    values[rowIndex][statusIndex] = TRANSLATE_STATUS.pending;
    values[rowIndex][translationIndex] = '';
    values[rowIndex][errorIndex] = '';
    values[rowIndex][updatedIndex] = now;
    resetCount++;
  }

  if (resetCount > 0) {
    sheet.getRange(2, 1, values.length - 1, headers.length).setValues(values.slice(1));
    writeNewsletterRows_(spreadsheet, []);
  }

  return resetCount;
}

function countPendingTranslations_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.selected);
  if (!sheet) {
    return 0;
  }

  return readObjects_(sheet).filter(function(row) {
    return row.selection_reason === 'OK'
      && (
        row.translate_status === TRANSLATE_STATUS.pending
        || row.translate_status === TRANSLATE_STATUS.translating
        || isRetryableTranslationError_(row.error_message)
      );
  }).length;
}

function isRetryableTranslationError_(errorMessage) {
  const text = String(errorMessage || '');
  return text.indexOf('HTTP 429') !== -1 || text.indexOf('Rate limit') !== -1;
}

function isStaleTranslating_(updatedAt, now) {
  if (!updatedAt) {
    return true;
  }

  const updated = new Date(updatedAt);
  const diffMinutes = (now.getTime() - updated.getTime()) / 1000 / 60;
  return diffMinutes > CONFIG.translatingTimeoutMinutes;
}

function shouldStop_(startedAt) {
  const diffMinutes = (new Date().getTime() - startedAt.getTime()) / 1000 / 60;
  return diffMinutes > CONFIG.maxRunMinutes - 0.5;
}
