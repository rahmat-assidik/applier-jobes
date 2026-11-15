var db = require('./db');
var crypto = require('crypto');

var CACHE_TTL = 15 * 60 * 1000;
var REQUEST_TIMEOUT = 8000;
var cache = new Map();
var pending = new Map();

function decodeHtmlEntities(value) {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, function(entity, reference) {
    var lowerReference = reference.toLowerCase();
    if (lowerReference === 'amp') return '&';
    if (lowerReference === 'lt') return '<';
    if (lowerReference === 'gt') return '>';
    if (lowerReference === 'quot') return '"';
    if (lowerReference === 'apos') return "'";
    if (lowerReference === 'nbsp') return ' ';
    if (lowerReference.charAt(0) !== '#') return entity;

    var codePoint = lowerReference.charAt(1) === 'x'
      ? parseInt(lowerReference.slice(2), 16)
      : parseInt(lowerReference.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function plainText(value, maxLength, preserveFormatting) {
  var text = String(value || '');
  if (preserveFormatting) {
    for (var pass = 0; pass < 3 && /&(?:amp;)*(?:lt|#0*60;|#x0*3c;)/i.test(text); pass += 1) {
      text = decodeHtmlEntities(text);
    }
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:p|div|li|h[1-6]|ul|ol|blockquote|section|article)\b[^>]*>/gi, '\n')
      .replace(/<(?:strong|b)\b[^>]*>/gi, '\n')
      .replace(/<\/(?:strong|b)\s*>/gi, '\n');
  }

  text = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#39;|&#x27;/gi, "'");
  text = decodeHtmlEntities(text);
  if (preserveFormatting) {
    text = text.replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  } else {
    text = text.replace(/\s+/g, ' ');
  }
  return text.trim().slice(0, maxLength);
}

function safeJobUrl(value) {
  try {
    var url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString().slice(0, 1000);
  } catch (error) {
    return null;
  }
}

function toSqlDate(value) {
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) date = new Date();
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeWorkType(value) {
  var type = String(value || '').toLowerCase();
  if (type.includes('intern')) return 'internship';
  if (type.includes('part')) return 'part-time';
  if (type.includes('contract') || type.includes('freelance') || type.includes('temporary')) return 'contract';
  return 'full-time';
}

function normalizeArbeitnowJob(job) {
  var title = plainText(job.title, 180);
  var company = plainText(job.company_name, 160);
  var url = safeJobUrl(job.url);
  if (!job.slug || !title || !company || !url) return null;

  return {
    source: 'Arbeitnow',
    externalId: String(job.slug).slice(0, 191),
    title: title,
    company: company,
    location: plainText(job.location || 'Europe', 120) || 'Europe',
    workMode: job.remote ? 'remote' : 'onsite',
    employmentType: normalizeWorkType(Array.isArray(job.job_types) ? job.job_types.join(' ') : ''),
    salaryMin: null,
    salaryMax: null,
    description: plainText(job.description, 5000, true) || 'Lihat detail lowongan pada situs sumber.',
    applyUrl: url,
    publishedAt: toSqlDate(Number(job.created_at) ? Number(job.created_at) * 1000 : job.created_at)
  };
}

function normalizeAdzunaJob(job) {
  var title = plainText(job.title, 180);
  var company = plainText(job.company && job.company.display_name, 160);
  var url = safeJobUrl(job.redirect_url);
  if (!job.id || !title || !company || !url) return null;

  function salary(value) {
    var amount = Number(value);
    return Number.isSafeInteger(amount) && amount >= 0 && amount <= 4294967295 ? amount : null;
  }

  return {
    source: 'Adzuna',
    externalId: String(job.id).slice(0, 191),
    title: title,
    company: company,
    location: plainText(job.location && job.location.display_name, 120) || 'Indonesia',
    workMode: 'onsite',
    employmentType: normalizeWorkType(job.contract_time || job.contract_type),
    salaryMin: salary(job.salary_min),
    salaryMax: salary(job.salary_max),
    description: plainText(job.description, 5000, true) || 'Lihat detail lowongan pada situs sumber.',
    applyUrl: url,
    publishedAt: toSqlDate(job.created)
  };
}

function normalizeBrowserJob(job) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) return null;

  var title = plainText(job.title, 180);
  var company = plainText(job.company, 160);
  var applyUrl = safeJobUrl(job.url);
  if (!title || !company || !applyUrl || !applyUrl.startsWith('https://')) return null;

  var url = new URL(applyUrl);
  url.hash = '';
  var location = plainText(job.location, 120) || 'Tidak dicantumkan';
  var workMode = ['onsite', 'hybrid', 'remote'].includes(job.workMode) ? job.workMode : 'onsite';

  return {
    source: 'Career page: ' + url.hostname.slice(0, 85),
    externalId: crypto.createHash('sha256').update(url.toString()).digest('hex'),
    title: title,
    company: company,
    location: location,
    workMode: workMode,
    employmentType: normalizeWorkType(job.employmentType),
    salaryMin: null,
    salaryMax: null,
    description: plainText(job.description, 5000, true) || 'Lihat detail lowongan pada situs perusahaan.',
    applyUrl: url.toString(),
    publishedAt: toSqlDate(job.publishedAt)
  };
}

async function fetchJson(url) {
  var response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ApplierJobes/1.0 (job listing attribution)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  });
  if (!response.ok) throw new Error('Job source returned HTTP ' + response.status);
  return response.json();
}

async function persistJobs(jobs) {
  if (!jobs.length) return 0;
  var connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (var job of jobs) {
      var [companyResult] = await connection.execute(
        'INSERT INTO companies (name, location) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), location = VALUES(location)',
        [job.company, job.location]
      );
      var companyId = companyResult.insertId;
      await connection.execute(
        'INSERT INTO jobs (company_id, title, location, work_mode, employment_type, salary_min, salary_max, description, source_name, external_id, apply_url, published_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), company_id = VALUES(company_id), title = VALUES(title), location = VALUES(location), work_mode = VALUES(work_mode), employment_type = VALUES(employment_type), salary_min = VALUES(salary_min), salary_max = VALUES(salary_max), description = VALUES(description), apply_url = VALUES(apply_url), published_at = VALUES(published_at), is_active = TRUE',
        [companyId, job.title, job.location, job.workMode, job.employmentType, job.salaryMin, job.salaryMax, job.description, job.source, job.externalId, job.applyUrl, job.publishedAt]
      );
    }
    await connection.commit();
    return jobs.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cached(key, operation) {
  var now = Date.now();
  var entry = cache.get(key);
  if (entry && entry.expiresAt > now) return entry.value;
  if (pending.has(key)) return pending.get(key);

  var request = operation().then(function(value) {
    if (cache.size >= 100) {
      for (var [cachedKey, cachedValue] of cache) {
        if (cachedValue.expiresAt <= Date.now()) cache.delete(cachedKey);
      }
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
    }
    cache.set(key, { value: value, expiresAt: Date.now() + CACHE_TTL });
    return value;
  }).finally(function() {
    pending.delete(key);
  });
  pending.set(key, request);
  return request;
}

async function updateArbeitnow() {
  var payload = await fetchJson('https://www.arbeitnow.com/api/job-board-api?page=1');
  if (!payload || !Array.isArray(payload.data)) throw new Error('Unexpected Arbeitnow response');
  var jobs = payload.data.slice(0, 20).map(normalizeArbeitnowJob).filter(Boolean);
  var count = await persistJobs(jobs);
  return { name: 'Arbeitnow', status: 'updated', count: count };
}

async function updateAdzuna(search, location) {
  var appId = process.env.ADZUNA_APP_ID;
  var appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    return { name: 'Adzuna', status: 'not-configured', count: 0 };
  }
  var country = String(process.env.ADZUNA_COUNTRY || 'id').toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) throw new Error('Invalid Adzuna country code');

  var endpoint = new URL('https://api.adzuna.com/v1/api/jobs/' + country + '/search/1');
  endpoint.searchParams.set('app_id', appId);
  endpoint.searchParams.set('app_key', appKey);
  endpoint.searchParams.set('results_per_page', '20');
  endpoint.searchParams.set('what', search || 'jobs');
  endpoint.searchParams.set('where', location || process.env.ADZUNA_LOCATION || 'Indonesia');
  endpoint.searchParams.set('content-type', 'application/json');
  var payload = await fetchJson(endpoint.toString());
  if (!payload || !Array.isArray(payload.results)) throw new Error('Unexpected Adzuna response');
  var jobs = payload.results.map(normalizeAdzunaJob).filter(Boolean);
  var count = await persistJobs(jobs);
  return { name: 'Adzuna', status: 'updated', count: count };
}

async function reportProvider(key, operation) {
  try {
    return await cached(key, operation);
  } catch (error) {
    console.error('Unable to refresh ' + key + ' job listings:', error.message);
    return { name: key, status: 'error', count: 0 };
  }
}

async function refreshLiveJobs(search, location) {
  var query = String(search || '').trim().slice(0, 100);
  var place = String(location || '').trim().slice(0, 100);
  return Promise.all([
    reportProvider('Arbeitnow', updateArbeitnow),
    reportProvider('Adzuna', function() { return updateAdzuna(query, place); })
  ]);
}

module.exports = {
  refreshLiveJobs: refreshLiveJobs,
  normalizeArbeitnowJob: normalizeArbeitnowJob,
  normalizeAdzunaJob: normalizeAdzunaJob,
  normalizeBrowserJob: normalizeBrowserJob,
  plainText: plainText,
  safeJobUrl: safeJobUrl
};
