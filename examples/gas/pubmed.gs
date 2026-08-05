function fetchPubMedArticles_() {
  const pubMedApiKey = requirePubMedApiKey_();
  const spreadsheet = getOrCreateWeeklySpreadsheet_();
  const articles = [];

  CONFIG.journals.forEach(function(journal) {
    try {
      const pmids = searchPubMedIds_(journal, pubMedApiKey);
      const journalArticles = [];

      for (let i = 0; i < pmids.length; i += CONFIG.batchSize) {
        const batchIds = pmids.slice(i, i + CONFIG.batchSize);
        const batchArticles = fetchPubMedBatch_(batchIds, pubMedApiKey);
        journalArticles.push.apply(journalArticles, batchArticles);
        Utilities.sleep(500);
      }

      articles.push.apply(articles, journalArticles);
      writeRawArticles_(spreadsheet, articles);
      appendRunLog_(
        spreadsheet,
        'fetch:' + journal,
        'OK',
        journal + ' PubMed 抓取完成',
        journalArticles.length,
        ''
      );
    } catch (error) {
      appendRunLog_(
        spreadsheet,
        'fetch:' + journal,
        'ERROR',
        journal + ' PubMed 抓取失敗，已繼續其他期刊',
        0,
        error && error.message ? error.message : String(error)
      );
    }
  });

  return articles;
}

function searchPubMedIds_(journal, pubMedApiKey) {
  const journalQuery = '"' + journal + '"[Journal]';
  const keywordQuery = CONFIG.keywords.join(' OR ');
  const term = '(' + journalQuery + ') AND (' + keywordQuery + ') AND ("last ' + CONFIG.daysBack + ' days"[dp])';
  const url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
    + '?db=pubmed'
    + '&retmode=json'
    + '&retmax=100000'
    + '&sort=pub+date'
    + '&term=' + encodeURIComponent(term)
    + '&api_key=' + encodeURIComponent(pubMedApiKey);

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    throw new Error('PubMed ESearch 失敗：HTTP ' + response.getResponseCode());
  }

  const data = JSON.parse(response.getContentText());
  return data.esearchresult && data.esearchresult.idlist ? data.esearchresult.idlist : [];
}

function fetchPubMedBatch_(pmids, pubMedApiKey) {
  if (!pmids.length) {
    return [];
  }

  const url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'
    + '?db=pubmed'
    + '&retmode=xml'
    + '&id=' + encodeURIComponent(pmids.join(','))
    + '&api_key=' + encodeURIComponent(pubMedApiKey);

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    throw new Error('PubMed EFetch 失敗：HTTP ' + response.getResponseCode());
  }

  const document = XmlService.parse(response.getContentText());
  const root = document.getRootElement();
  const articles = root.getChildren('PubmedArticle');
  const now = new Date().toISOString();

  return articles.map(function(articleElement) {
    const medline = getChild_(articleElement, 'MedlineCitation');
    const article = getChild_(medline, 'Article');
    const pmid = getText_(getChild_(medline, 'PMID'));
    const journal = getJournalTitle_(article);
    const title = getElementValue_(getChild_(article, 'ArticleTitle'));
    const abstract = getAbstractText_(article);
    const publicationTypes = getPublicationTypes_(article);
    const pubDate = getPubDate_(article);

    return {
      pmid: pmid,
      title: title,
      journal: journal,
      pub_date: pubDate,
      publication_type: publicationTypes,
      has_abstract: abstract.trim().length > 0,
      abstract: abstract,
      pubmed_url: 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/',
      raw_status: 'FETCHED',
      created_at: now
    };
  });
}

function getJournalTitle_(article) {
  const journal = getChild_(article, 'Journal');
  const iso = getText_(getChild_(journal, 'ISOAbbreviation'));
  const title = getText_(getChild_(journal, 'Title'));
  return iso || title;
}

function getAbstractText_(article) {
  const abstractElement = getChild_(article, 'Abstract');
  if (!abstractElement) {
    return '';
  }

  return abstractElement.getChildren('AbstractText').map(function(part) {
    const label = part.getAttribute('Label');
    const prefix = label ? label.getValue() + ': ' : '';
    return prefix + getElementValue_(part);
  }).join('\n');
}

function getPublicationTypes_(article) {
  const list = getChild_(article, 'PublicationTypeList');
  if (!list) {
    return [];
  }

  return list.getChildren('PublicationType').map(function(type) {
    return type.getText();
  });
}

function getPubDate_(article) {
  const journal = getChild_(article, 'Journal');
  const issue = getChild_(journal, 'JournalIssue');
  const pubDate = getChild_(issue, 'PubDate');

  if (!pubDate) {
    return '';
  }

  const year = getText_(getChild_(pubDate, 'Year'));
  const month = normalizeMonth_(getText_(getChild_(pubDate, 'Month')));
  const day = pad2_(getText_(getChild_(pubDate, 'Day')) || '01');
  const medlineDate = getText_(getChild_(pubDate, 'MedlineDate'));

  if (year) {
    return [year, month || '01', day].join('-');
  }

  return medlineDate;
}

function getChild_(element, name) {
  return element ? element.getChild(name) : null;
}

function getText_(element) {
  return element ? element.getText() : '';
}

function getElementValue_(element) {
  return element ? element.getValue() : '';
}

function normalizeMonth_(month) {
  if (!month) {
    return '';
  }

  const months = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12'
  };

  if (/^\d+$/.test(month)) {
    return pad2_(month);
  }

  return months[month.substring(0, 3)] || '';
}

function pad2_(value) {
  const text = String(value || '');
  return text.length === 1 ? '0' + text : text;
}
