function composeNewsletterHtml_(spreadsheet, isDemo, composeOptions) {
  const options = composeOptions || {};
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.newsletter);
  const rows = sheet ? readObjects_(sheet) : [];
  const readyRows = rows.filter(function(row) {
    return row.html_status === 'READY';
  });

  if (!readyRows.length) {
    throw new Error('沒有可輸出的 newsletter 內容');
  }

  const html = buildNewsletterHtml_(readyRows, isDemo, options);
  const folder = getOrCreateOutputFolder_();
  const fileName = options.fileName || getNewsletterFileName_(isDemo);
  const existing = folder.getFilesByName(fileName);

  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  return folder.createFile(fileName, html, MimeType.HTML);
}

function buildNewsletterHtml_(rows, isDemo, composeOptions) {
  const options = composeOptions || {};
  const isEnglishOnly = options.mode === 'english';
  const title = options.title || ((isDemo ? 'DEMO ' : '') + '四大期刊 PubMed 中文電子報');
  const date = formatDate_(new Date());
  const groups = getJournalGroups_(rows);
  const stats = groups.map(function(group) {
    return { journal: group.journal, count: group.rows.length };
  });
  const statsHtml = stats.map(function(item) {
    return '<span class="stat"><span class="dot ' + getJournalClass_(item.journal) + '"></span>' + escapeHtml_(item.journal) + ' ' + item.count + ' 篇</span>';
  }).join('');
  const navHtml = groups.map(function(group) {
    return '<a href="#' + getJournalSectionId_(group.journal) + '">' + escapeHtml_(group.journal) + '<span>' + group.rows.length + '</span></a>';
  }).join('');
  const cards = groups.map(function(group) {
    const articles = group.rows.map(function(row) {
      const translatedTitle = normalizeNewsletterText_(row.title_zh);
      const originalTitle = normalizeNewsletterText_(row.title);
      const primaryTitle = !isEnglishOnly && translatedTitle ? translatedTitle : originalTitle;
      const originalTitleHtml = primaryTitle !== originalTitle
        ? '<p class="original-title" lang="en">' + escapeHtml_(originalTitle) + '</p>'
        : '';
      const studyType = getStudyTypeLabel_(row.publication_type);
      const articleBodyHtml = isEnglishOnly
        ? buildSectionHtml_('PubMed English Abstract', row.results)
        : [
          buildSectionHtml_('研究背景', row.background),
          buildSectionHtml_('研究方法', row.methods),
          buildSectionHtml_('主要結果', row.results)
        ].join('\n');
      return [
        '<article class="article" id="' + getArticleId_(row) + '">',
        '<div class="article-top">',
        '<span>' + escapeHtml_(formatDisplayDate_(row.pub_date)) + '</span>',
        '<span>PMID ' + escapeHtml_(row.pmid) + '</span>',
        studyType ? '<span class="study-badge">' + escapeHtml_(studyType) + '</span>' : '',
        '</div>',
        '<div class="article-heading"><span class="article-no">' + row.displayIndex + '</span><div>',
        '<h2>' + escapeHtml_(primaryTitle) + '</h2>',
        originalTitleHtml,
        '</div></div>',
        '<section class="conclusion">',
        '<h3>' + (isEnglishOnly ? '閱讀提醒' : '作者結論') + '</h3>',
        '<p>' + escapeHtml_(normalizeNewsletterText_(row.conclusion)) + '</p>',
        '</section>',
        '<div class="article-body">',
        articleBodyHtml,
        '</div>',
        '<div class="article-actions"><a href="' + escapeHtml_(row.pubmed_url) + '" target="_blank" rel="noopener">查看 PubMed 原文</a><a href="#top">回到頁首</a></div>',
        '</article>'
      ].join('\n');
    }).join('\n');

    return [
      '<section class="journal-section" aria-labelledby="' + getJournalSectionId_(group.journal) + '">',
      '<div class="journal-heading ' + getJournalClass_(group.journal) + '" id="' + getJournalSectionId_(group.journal) + '">',
      '<h2>' + escapeHtml_(group.journal) + '</h2>',
      '<span>' + group.rows.length + ' 篇</span>',
      '</div>',
      articles,
      '</section>'
    ].join('\n');
  }).join('\n');

  return [
    '<!doctype html>',
    '<html lang="zh-Hant">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<link rel="icon" href="data:,">',
    '<title>' + escapeHtml_(title) + '</title>',
    '<style>',
    ':root{--ink:#17212b;--muted:#667085;--line:#dfe4ea;--paper:#f4f6f8;--card:#fff;--navy:#12324a;--accent:#1d5d8f;--accent-soft:#edf5fa;--focus:#f6fef9;}',
    '*{box-sizing:border-box;}',
    'html{scroll-behavior:smooth;}',
    'body{font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:var(--paper);color:var(--ink);font-size:16px;line-height:1.8;-webkit-font-smoothing:antialiased;}',
    'header{background:var(--navy);color:#fff;}',
    '.hero{max-width:960px;margin:0 auto;padding:40px 24px 34px;}',
    'h1{margin:0 0 10px;font-size:32px;line-height:1.25;letter-spacing:.01em;}',
    '.sub{color:#d7e1e8;font-size:15px;}',
    '.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;}',
    '.stat{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:6px 11px;color:#f7fafc;font-size:13px;}',
    '.dot{width:9px;height:9px;border-radius:50%;background:#9aa;}',
    'main{max-width:960px;margin:0 auto;padding:26px 24px 56px;}',
    '.notice{background:#fff;border:1px solid var(--line);border-left:5px solid var(--accent);border-radius:8px;padding:14px 16px;margin-bottom:16px;color:#475467;font-size:14px;}',
    '.journal-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 28px;}',
    '.journal-nav a{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;border:1px solid var(--line);border-radius:7px;padding:10px 12px;color:#344054;text-decoration:none;font-weight:700;font-size:14px;}',
    '.journal-nav a:hover{border-color:#8ab4cc;background:var(--accent-soft);}',
    '.journal-nav span{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:999px;background:#eef2f6;color:#475467;font-size:12px;}',
    '.journal-section{margin:32px 0 0;scroll-margin-top:12px;}',
    '.journal-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;border-radius:8px 8px 0 0;color:#fff;padding:14px 20px;margin-bottom:0;}',
    '.journal-heading h2{font-size:20px;margin:0;line-height:1.3;}',
    '.journal-heading span{font-size:13px;opacity:.9;}',
    '.article{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:26px;margin:0 0 18px;box-shadow:0 1px 3px rgba(15,23,42,.05);scroll-margin-top:16px;}',
    '.journal-heading+.article{border-top-left-radius:0;border-top-right-radius:0;}',
    '.article-top{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;color:var(--muted);font-size:13px;margin-bottom:12px;}',
    '.study-badge{display:inline-flex;align-items:center;border-radius:999px;background:#eef4ff;color:#1849a9;padding:3px 9px;font-size:12px;font-weight:750;}',
    '.journal-nejm{background:#8b1e3f;}.journal-jama{background:#1d5d8f;}.journal-lancet{background:#217a58;}.journal-bmj{background:#654c96;}.journal-other{background:#596168;}',
    '.article-heading{display:grid;grid-template-columns:32px minmax(0,1fr);gap:12px;align-items:start;margin-bottom:16px;}',
    '.article-heading h2{font-size:22px;line-height:1.45;margin:0;color:#101828;}',
    '.article-no{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#eef2f6;color:#475467;font-size:14px;font-weight:750;margin-top:2px;}',
    '.original-title{margin:7px 0 0;color:#667085;font-size:14px;line-height:1.55;font-weight:500;overflow-wrap:anywhere;}',
    '.conclusion{background:var(--focus);border:1px solid #cfe9da;border-left:5px solid #12b76a;border-radius:8px;padding:14px 16px;margin:0 0 16px;}',
    'h3{font-size:15px;margin:0 0 7px;color:#344054;}',
    'p{margin:0 0 12px;}',
    'p:last-child{margin-bottom:0;}',
    '.article-body{display:grid;gap:12px;}',
    '.section{border:1px solid #e7ebef;border-radius:8px;padding:15px 17px;background:#fbfcfd;}',
    '.section p{font-size:15px;color:#273444;}',
    '.article-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px;padding-top:15px;border-top:1px solid #edf0f2;}',
    'a{color:#0b5cab;}',
    '.article-actions a{display:inline-flex;align-items:center;border:1px solid #bcd2e3;border-radius:6px;padding:7px 11px;text-decoration:none;font-size:14px;background:#f7fbff;font-weight:650;}',
    'footer{max-width:960px;margin:0 auto;padding:0 24px 36px;color:var(--muted);font-size:13px;}',
    '@media (max-width:720px){.hero{padding:30px 18px 26px;}h1{font-size:24px;}main{padding:20px 14px 44px;}.journal-nav{grid-template-columns:repeat(2,minmax(0,1fr));}.article{padding:19px 16px;}.article-heading h2{font-size:19px;}.article-heading{grid-template-columns:28px minmax(0,1fr);gap:10px;}.article-no{width:28px;height:28px;}.section{padding:13px 14px;}}',
    '@media print{body{background:#fff;color:#000;}header{background:#fff;color:#000;border-bottom:2px solid #000;}.sub,.stat,.article-top,footer{color:#333;}.journal-nav{display:none;}.notice,.article{box-shadow:none;border-color:#999;break-inside:avoid;}.article-actions a[href]::after{content:" (" attr(href) ")";font-size:11px;color:#333;}.article-actions a[href="#top"]{display:none;}}',
    '</style>',
    '</head>',
    '<body>',
    '<header id="top">',
    '<div class="hero">',
    '<h1>' + escapeHtml_(title) + '</h1>',
    '<div class="sub">產生日期：' + escapeHtml_(date) + '｜文章數：' + rows.length + '</div>',
    '<div class="stats">' + statsHtml + '</div>',
    '</div>',
    '</header>',
    '<main>',
    '<section class="notice">' + (isEnglishOnly
      ? '本版未使用 AI 翻譯，保留 PubMed 原始英文摘要；臨床決策前請回查 PubMed 原文與院內規範。'
      : '本電子報由 PubMed 文獻資料與 AI 摘要產生，適合作為院內藥訊初稿與教學範例；臨床決策前請回查 PubMed 原文與院內規範。') + '</section>',
    '<nav class="journal-nav" aria-label="期刊導覽">' + navHtml + '</nav>',
    cards,
    '</main>',
    '<footer>本電子報為文獻摘要與教學範例，不提供個別病人治療建議。</footer>',
    '</body>',
    '</html>'
  ].join('\n');
}

function buildSectionHtml_(label, value) {
  return [
    '<section class="section">',
    '<h3>' + escapeHtml_(label) + '</h3>',
    '<p>' + escapeHtml_(normalizeNewsletterText_(value)) + '</p>',
    '</section>'
  ].join('\n');
}

function normalizeNewsletterText_(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getJournalGroups_(rows) {
  const grouped = {};

  rows.forEach(function(row) {
    const journal = String(row.journal || 'Other');
    if (!grouped[journal]) {
      grouped[journal] = [];
    }
    grouped[journal].push(Object.assign({}, row));
  });

  let displayIndex = 0;
  return Object.keys(grouped).sort(compareJournals_).map(function(journal) {
    grouped[journal].forEach(function(row) {
      displayIndex++;
      row.displayIndex = displayIndex;
    });
    return {
      journal: journal,
      rows: grouped[journal]
    };
  });
}

function compareJournals_(left, right) {
  const order = ['jama', 'n engl j med', 'lancet', 'bmj'];
  const leftValue = String(left || '').toLowerCase();
  const rightValue = String(right || '').toLowerCase();
  const leftRank = order.reduce(function(rank, name, index) {
    return rank === 99 && leftValue.indexOf(name) !== -1 ? index : rank;
  }, 99);
  const rightRank = order.reduce(function(rank, name, index) {
    return rank === 99 && rightValue.indexOf(name) !== -1 ? index : rank;
  }, 99);
  return leftRank - rightRank || leftValue.localeCompare(rightValue);
}

function getStudyTypeLabel_(publicationType) {
  const value = Array.isArray(publicationType)
    ? publicationType.join('; ')
    : String(publicationType || '');
  if (/Randomized Controlled Trial/i.test(value)) {
    return 'RCT';
  }
  if (/Meta-Analysis/i.test(value)) {
    return 'Meta-analysis';
  }
  if (/Systematic Review/i.test(value)) {
    return 'Systematic Review';
  }
  if (/Clinical Trial/i.test(value)) {
    return 'Clinical Trial';
  }
  if (/Observational Study|Cohort Studies/i.test(value)) {
    return 'Observational Study';
  }
  if (/Review/i.test(value)) {
    return 'Review';
  }
  return /Journal Article/i.test(value) ? 'Original Article' : '';
}

function getArticleId_(row) {
  return 'article-' + row.displayIndex + '-' + String(row.pmid || '').replace(/[^0-9A-Za-z_-]/g, '');
}

function getJournalSectionId_(journal) {
  return 'journal-' + String(journal || 'other').toLowerCase().replace(/[^0-9a-z]+/g, '-').replace(/^-|-$/g, '');
}

function getJournalClass_(journal) {
  const value = String(journal || '').toLowerCase();
  if (value.indexOf('n engl j med') !== -1) {
    return 'journal-nejm';
  }
  if (value.indexOf('jama') !== -1) {
    return 'journal-jama';
  }
  if (value.indexOf('lancet') !== -1) {
    return 'journal-lancet';
  }
  if (value.indexOf('bmj') !== -1) {
    return 'journal-bmj';
  }
  return 'journal-other';
}

function formatDisplayDate_(value) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return formatDate_(value);
  }

  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return formatDate_(parsed);
  }

  return String(value);
}

function getNewsletterFileName_(isDemo) {
  const prefix = isDemo ? 'DEMO_' : '';
  return prefix + formatDate_(new Date()) + '_' + CONFIG.newsletterFileNameSuffix;
}

function getEnglishNewsletterFileName_() {
  return formatDate_(new Date()) + '_四大期刊英文摘要電子報.html';
}

function syncSelectedArticlesToEnglishNewsletter_(spreadsheet) {
  const selectedSheet = spreadsheet.getSheetByName(SHEET_NAMES.selected);
  const selectedRows = selectedSheet ? readObjects_(selectedSheet) : [];
  const newsletterRows = selectedRows.filter(function(row) {
    return row.selection_reason === 'OK';
  }).map(function(row) {
    return {
      pmid: row.pmid,
      title: row.title,
      title_zh: '',
      journal: row.journal,
      pub_date: row.pub_date,
      publication_type: row.publication_type,
      background: '',
      methods: '',
      results: String(row.abstract || 'Abstract not available.'),
      conclusion: '本版尚未執行 AI 翻譯，請由 PubMed 原文確認研究內容。',
      pubmed_url: row.pubmed_url || ('https://pubmed.ncbi.nlm.nih.gov/' + row.pmid + '/'),
      html_status: 'READY',
      updated_at: new Date().toISOString()
    };
  });

  writeNewsletterRows_(spreadsheet, newsletterRows);
  return newsletterRows.length;
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
