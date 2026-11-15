var express = require('express');
var router = express.Router();
var bcrypt = require('bcryptjs');
var crypto = require('crypto');
var fs = require('fs/promises');
var path = require('path');
var multer = require('multer');
var db = require('../lib/db');
var jobSources = require('../lib/job-sources');
var createPagination = require('../lib/pagination');
var { requireAuth, verifyCsrf, asyncHandler, flash } = require('../middleware/auth');

var applicationStatuses = ['draft', 'submitted', 'viewed', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];
var statusLabels = {
  draft: 'Draft',
  submitted: 'Terkirim',
  viewed: 'Dilihat',
  screening: 'Ditinjau',
  interview: 'Interview',
  offer: 'Penawaran',
  rejected: 'Ditolak',
  withdrawn: 'Ditarik'
};
var workModes = ['any', 'onsite', 'hybrid', 'remote'];
var employmentTypes = ['any', 'full-time', 'contract', 'internship', 'part-time'];
var cvDirectory = path.join(__dirname, '..', 'storage', 'private', 'cv');
var cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: function(req, file, callback) {
    if (file.mimetype !== 'application/pdf') {
      return callback(Object.assign(new Error('Hanya file PDF yang dapat diunggah.'), { code: 'CV_INVALID_FILE' }));
    }
    callback(null, true);
  }
});

function handleCvUpload(req, res, next) {
  cvUpload.single('cv')(req, res, function(error) {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      flash(req, 'error', 'Ukuran CV maksimal 5 MB.');
      return res.redirect('/profile');
    }
    if (error.code === 'CV_INVALID_FILE') {
      flash(req, 'error', error.message);
      return res.redirect('/profile');
    }
    next(error);
  });
}

function safeCvKey(value) {
  return typeof value === 'string' && /^[a-f0-9]{32}\.pdf$/.test(value);
}

function splitCriteria(value) {
  return String(value || '').split(',').map(function(item) {
    return item.trim().slice(0, 100);
  }).filter(Boolean).slice(0, 10);
}

function safeListReturnTo(value, pathname) {
  return typeof value === 'string' &&
    (value === pathname || value.startsWith(pathname + '?')) &&
    !value.startsWith('//')
      ? value
      : pathname;
}

async function createApplicationDraft(userId, jobId) {
  var connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    var [result] = await connection.execute(
      "INSERT INTO applications (user_id, job_id, status, notes) SELECT ?, id, 'draft', '' FROM jobs WHERE id = ? AND is_active = 1",
      [userId, jobId]
    );
    if (!result.affectedRows) throw Object.assign(new Error('Lowongan tidak ditemukan atau sudah tidak aktif.'), { status: 404 });
    await connection.execute(
      "INSERT INTO application_status_history (application_id, previous_status, new_status) VALUES (?, NULL, 'draft')",
      [result.insertId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

router.get('/', function(req, res) {
  res.redirect(req.session.user ? '/dashboard' : '/login');
});

router.get('/jobs/browser-import', function(req, res) {
  if (!req.session.user) return res.render('browser-import-login', { title: 'Masuk untuk impor' });
  res.render('browser-import', { title: 'Impor dari browser', activeNav: 'jobs' });
});

router.use(requireAuth);

router.get('/dashboard', asyncHandler(async function(req, res) {
  var userId = req.session.user.id;
  var sourceStatus = await jobSources.refreshLiveJobs('', process.env.ADZUNA_LOCATION);
  var [jobCountRows] = await db.execute('SELECT COUNT(*) AS count FROM jobs WHERE is_active = 1');
  var [applicationCountRows] = await db.execute('SELECT COUNT(*) AS count FROM applications WHERE user_id = ?', [userId]);
  var dashboardJobsPagination = createPagination({
    pathname: '/dashboard',
    pageParam: 'jobsPage',
    requestedPage: req.query.jobsPage,
    pageSize: 10,
    totalItems: jobCountRows[0].count,
    query: { applicationsPage: req.query.applicationsPage }
  });
  var dashboardApplicationsPagination = createPagination({
    pathname: '/dashboard',
    pageParam: 'applicationsPage',
    requestedPage: req.query.applicationsPage,
    pageSize: 10,
    totalItems: applicationCountRows[0].count,
    query: { jobsPage: req.query.jobsPage }
  });
  var results = await Promise.all([
    db.execute('SELECT status, COUNT(*) AS count FROM applications WHERE user_id = ? GROUP BY status', [userId]),
    db.execute(
      'SELECT j.id, j.title, j.location, j.work_mode, j.employment_type, j.salary_min, j.salary_max, j.published_at, j.source_name, j.apply_url, c.name AS company_name, (SELECT COUNT(*) FROM saved_jobs s WHERE s.user_id = ? AND s.job_id = j.id) AS is_saved FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.is_active = 1 ORDER BY j.published_at DESC LIMIT ? OFFSET ?',
      [userId, dashboardJobsPagination.pageSize, dashboardJobsPagination.offset]
    ),
    db.execute(
      'SELECT a.id, a.status, a.updated_at, j.title, c.name AS company_name FROM applications a JOIN jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id WHERE a.user_id = ? ORDER BY a.updated_at DESC LIMIT ? OFFSET ?',
      [userId, dashboardApplicationsPagination.pageSize, dashboardApplicationsPagination.offset]
    ),
    db.execute('SELECT is_enabled, weekly_limit FROM automation_rules WHERE user_id = ?', [userId]),
    db.execute('SELECT COUNT(*) AS count FROM saved_jobs WHERE user_id = ?', [userId])
  ]);
  var statusCounts = results[0][0].reduce(function(counts, row) {
    counts[row.status] = Number(row.count);
    return counts;
  }, {});
  var totalApplications = Object.values(statusCounts).reduce(function(total, count) { return total + count; }, 0);
  res.render('dashboard', {
    title: 'Dashboard',
    activeNav: 'dashboard',
    statusCounts: statusCounts,
    totalApplications: totalApplications,
    jobs: results[1][0],
    recentApplications: results[2][0],
    jobsPagination: dashboardJobsPagination,
    applicationsPagination: dashboardApplicationsPagination,
    automation: results[3][0][0] || { is_enabled: false, weekly_limit: 5 },
    savedCount: Number(results[4][0][0].count),
    sourceStatus: sourceStatus,
    statusLabels: statusLabels
  });
}));

router.get('/jobs', asyncHandler(async function(req, res) {
  var userId = req.session.user.id;
  var search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  var location = typeof req.query.location === 'string' ? req.query.location.trim().slice(0, 100) : '';
  var sourceStatus = await jobSources.refreshLiveJobs(search, location);
  var filters = ['j.is_active = 1'];
  var params = [userId];

  if (search) {
    filters.push('(j.title LIKE ? OR j.location LIKE ? OR c.name LIKE ? OR j.description LIKE ?)');
    var pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
    params.push(pattern, pattern, pattern, pattern);
  }
  if (location) {
    filters.push('j.location LIKE ?');
    params.push('%' + location.replace(/[\\%_]/g, '\\$&') + '%');
  }
  if (workModes.includes(req.query.workMode) && req.query.workMode !== 'any') {
    filters.push('j.work_mode = ?');
    params.push(req.query.workMode);
  }

  var paginationQuery = {};
  if (search) paginationQuery.q = search;
  if (location) paginationQuery.location = location;
  if (workModes.includes(req.query.workMode) && req.query.workMode !== 'any') paginationQuery.workMode = req.query.workMode;
  var [countRows] = await db.execute(
    'SELECT COUNT(*) AS count FROM jobs j JOIN companies c ON c.id = j.company_id WHERE ' + filters.join(' AND '),
    params.slice(1)
  );
  var pagination = createPagination({
    pathname: '/jobs',
    pageParam: 'page',
    requestedPage: req.query.page,
    pageSize: 10,
    totalItems: countRows[0].count,
    query: paginationQuery
  });
  if (req.query.page && pagination.page > 1) paginationQuery.page = String(pagination.page);
  var returnToQuery = new URLSearchParams(paginationQuery).toString();
  var [rows] = await db.execute(
    'SELECT j.id, j.title, j.location, j.work_mode, j.employment_type, j.salary_min, j.salary_max, j.description, j.source_name, j.apply_url, j.published_at, c.name AS company_name, EXISTS(SELECT 1 FROM saved_jobs s WHERE s.user_id = ? AND s.job_id = j.id) AS is_saved FROM jobs j JOIN companies c ON c.id = j.company_id WHERE ' + filters.join(' AND ') + ' ORDER BY j.published_at DESC LIMIT ? OFFSET ?',
    params.concat([pagination.pageSize, pagination.offset])
  );
  res.render('jobs', {
    title: 'Cari lowongan',
    activeNav: 'jobs',
    jobs: rows,
    pagination: pagination,
    search: search,
    location: location,
    workMode: req.query.workMode || 'any',
    workModes: workModes,
    returnTo: '/jobs' + (returnToQuery ? '?' + returnToQuery : ''),
    sourceStatus: sourceStatus,
    statusLabels: statusLabels
  });
}));

router.post('/jobs/browser-import', verifyCsrf, asyncHandler(async function(req, res) {
  if (!req.body || !Array.isArray(req.body.jobs) || req.body.jobs.length < 1 || req.body.jobs.length > 50) {
    return res.status(400).json({ message: 'Pilih 1 sampai 50 lowongan untuk diimpor.' });
  }

  var jobs = req.body.jobs.map(jobSources.normalizeBrowserJob);
  if (jobs.some(function(job) { return !job; })) {
    return res.status(400).json({ message: 'Sebagian data lowongan tidak valid atau tautannya bukan HTTPS.' });
  }

  var connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (var job of jobs) {
      var [companyResult] = await connection.execute(
        'INSERT INTO companies (name, location, website) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), location = VALUES(location), website = IF(website = \'\', VALUES(website), website)',
        [job.company, job.location, new URL(job.applyUrl).origin]
      );
      await connection.execute(
        'INSERT INTO jobs (company_id, title, location, work_mode, employment_type, salary_min, salary_max, description, source_name, external_id, apply_url, published_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), company_id = VALUES(company_id), title = VALUES(title), location = VALUES(location), work_mode = VALUES(work_mode), employment_type = VALUES(employment_type), description = VALUES(description), apply_url = VALUES(apply_url), published_at = VALUES(published_at), is_active = TRUE',
        [companyResult.insertId, job.title, job.location, job.workMode, job.employmentType, job.salaryMin, job.salaryMax, job.description, job.source, job.externalId, job.applyUrl, job.publishedAt]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.json({ imported: jobs.length });
}));

router.post('/jobs/:id/save', verifyCsrf, asyncHandler(async function(req, res) {
  var jobId = Number(req.params.id);
  if (!Number.isSafeInteger(jobId) || jobId < 1) throw Object.assign(new Error('Lowongan tidak ditemukan.'), { status: 404 });

  if (req.body.action === 'remove') {
    await db.execute('DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?', [req.session.user.id, jobId]);
    flash(req, 'success', 'Lowongan dihapus dari daftar tersimpan.');
  } else if (req.body.action === 'save') {
    await db.execute('INSERT IGNORE INTO saved_jobs (user_id, job_id) SELECT ?, id FROM jobs WHERE id = ? AND is_active = 1', [req.session.user.id, jobId]);
    flash(req, 'success', 'Lowongan disimpan ke daftar kamu.');
  } else {
    throw Object.assign(new Error('Aksi lowongan tidak valid.'), { status: 400 });
  }

  var returnTo = req.body.returnTo;
  res.redirect(returnTo && returnTo.startsWith('/jobs')
    ? safeListReturnTo(returnTo, '/jobs')
    : safeListReturnTo(returnTo, '/saved-jobs'));
}));

router.post('/jobs/:id/apply', verifyCsrf, asyncHandler(async function(req, res) {
  var jobId = Number(req.params.id);
  if (!Number.isSafeInteger(jobId) || jobId < 1) throw Object.assign(new Error('Lowongan tidak ditemukan.'), { status: 404 });

  try {
    await createApplicationDraft(req.session.user.id, jobId);
    flash(req, 'success', 'Draft lamaran dibuat. Tinjau detail dan kirim sendiri melalui situs pemberi kerja.');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      flash(req, 'info', 'Lowongan ini sudah ada di daftar lamaran kamu.');
    } else {
      throw error;
    }
  }
  res.redirect('/applications');
}));

router.get('/saved-jobs', asyncHandler(async function(req, res) {
  var [countRows] = await db.execute('SELECT COUNT(*) AS count FROM saved_jobs WHERE user_id = ?', [req.session.user.id]);
  var pagination = createPagination({
    pathname: '/saved-jobs',
    pageParam: 'page',
    requestedPage: req.query.page,
    pageSize: 10,
    totalItems: countRows[0].count
  });
  var [jobs] = await db.execute(
    'SELECT j.id, j.title, j.location, j.work_mode, j.employment_type, j.salary_min, j.salary_max, j.description, j.source_name, j.apply_url, j.published_at, c.name AS company_name FROM saved_jobs s JOIN jobs j ON j.id = s.job_id JOIN companies c ON c.id = j.company_id WHERE s.user_id = ? ORDER BY s.saved_at DESC LIMIT ? OFFSET ?',
    [req.session.user.id, pagination.pageSize, pagination.offset]
  );
  res.render('saved-jobs', { title: 'Lowongan tersimpan', activeNav: 'saved', jobs: jobs, pagination: pagination });
}));

router.get('/applications', asyncHandler(async function(req, res) {
  var [countRows] = await db.execute('SELECT COUNT(*) AS count FROM applications WHERE user_id = ?', [req.session.user.id]);
  var pagination = createPagination({
    pathname: '/applications',
    pageParam: 'page',
    requestedPage: req.query.page,
    pageSize: 10,
    totalItems: countRows[0].count
  });
  var [applications] = await db.execute(
    'SELECT a.id, a.status, a.notes, a.applied_at, a.updated_at, j.title, j.location, j.work_mode, j.employment_type, j.source_name, j.apply_url, c.name AS company_name FROM applications a JOIN jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id WHERE a.user_id = ? ORDER BY a.updated_at DESC LIMIT ? OFFSET ?',
    [req.session.user.id, pagination.pageSize, pagination.offset]
  );
  res.render('applications', {
    title: 'Lamaran saya',
    activeNav: 'applications',
    applications: applications,
    pagination: pagination,
    statusLabels: statusLabels,
    applicationStatuses: applicationStatuses
  });
}));

router.get('/applications/:id/review', asyncHandler(async function(req, res) {
  var applicationId = Number(req.params.id);
  if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
    throw Object.assign(new Error('Lamaran tidak ditemukan.'), { status: 404 });
  }
  var [rows] = await db.execute(
    'SELECT a.id, a.status, j.title, j.location, j.work_mode, j.apply_url, j.source_name, c.name AS company_name, p.headline, p.location AS profile_location, p.summary, p.skills, p.cv_original_name, p.cv_size, p.cv_uploaded_at FROM applications a JOIN jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id LEFT JOIN candidate_profiles p ON p.user_id = a.user_id WHERE a.id = ? AND a.user_id = ?',
    [applicationId, req.session.user.id]
  );
  if (!rows.length) throw Object.assign(new Error('Lamaran tidak ditemukan.'), { status: 404 });
  res.render('application-review', {
    title: 'Tinjau lamaran',
    activeNav: 'applications',
    application: rows[0]
  });
}));

router.post('/applications/:id/mark-submitted', verifyCsrf, asyncHandler(async function(req, res) {
  var applicationId = Number(req.params.id);
  if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
    throw Object.assign(new Error('Lamaran tidak ditemukan.'), { status: 404 });
  }
  var connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    var [rows] = await connection.execute(
      'SELECT status FROM applications WHERE id = ? AND user_id = ? FOR UPDATE',
      [applicationId, req.session.user.id]
    );
    if (!rows.length) throw Object.assign(new Error('Lamaran tidak ditemukan.'), { status: 404 });
    if (rows[0].status !== 'submitted') {
      await connection.execute('UPDATE applications SET status = ? WHERE id = ?', ['submitted', applicationId]);
      await connection.execute(
        'INSERT INTO application_status_history (application_id, previous_status, new_status) VALUES (?, ?, ?)',
        [applicationId, rows[0].status, 'submitted']
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  flash(req, 'success', 'Lamaran ditandai terkirim. Perbarui statusnya saat perusahaan memberi kabar.');
  res.redirect('/applications/' + applicationId + '/review');
}));

router.post('/applications/:id/status', verifyCsrf, asyncHandler(async function(req, res) {
  var applicationId = Number(req.params.id);
  var newStatus = req.body.status;
  if (!Number.isSafeInteger(applicationId) || applicationId < 1 || !applicationStatuses.includes(newStatus)) {
    throw Object.assign(new Error('Status lamaran tidak valid.'), { status: 400 });
  }

  var connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    var [rows] = await connection.execute(
      'SELECT status FROM applications WHERE id = ? AND user_id = ? FOR UPDATE',
      [applicationId, req.session.user.id]
    );
    if (!rows.length) throw Object.assign(new Error('Lamaran tidak ditemukan.'), { status: 404 });
    var previousStatus = rows[0].status;
    if (previousStatus !== newStatus) {
      await connection.execute('UPDATE applications SET status = ? WHERE id = ?', [newStatus, applicationId]);
      await connection.execute(
        'INSERT INTO application_status_history (application_id, previous_status, new_status) VALUES (?, ?, ?)',
        [applicationId, previousStatus, newStatus]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  flash(req, 'success', 'Status lamaran diperbarui.');
  res.redirect(safeListReturnTo(req.body.returnTo, '/applications'));
}));

router.get('/automation', asyncHandler(async function(req, res) {
  var [rows] = await db.execute('SELECT * FROM automation_rules WHERE user_id = ?', [req.session.user.id]);
  var rule = rows[0] || { is_enabled: 0, target_titles: '', locations: '', work_mode: 'any', weekly_limit: 5 };
  var titles = splitCriteria(rule.target_titles);
  var locations = splitCriteria(rule.locations);
  var suggestedJobs = [];
  var pagination = createPagination({
    pathname: '/automation',
    pageParam: 'page',
    requestedPage: req.query.page,
    pageSize: 10,
    totalItems: 0
  });
  var weeklyCount = 0;
  var weeklyRemaining = 0;
  if (rule.is_enabled) {
    var [countRows] = await db.execute(
      'SELECT COUNT(*) AS count FROM applications WHERE user_id = ? AND applied_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
      [req.session.user.id]
    );
    weeklyCount = Number(countRows[0].count);
    weeklyRemaining = Math.max(0, Number(rule.weekly_limit) - weeklyCount);
  }
  if (rule.is_enabled && weeklyRemaining > 0 && titles.length && locations.length) {
    var filters = [
      'j.is_active = 1',
      'NOT EXISTS (SELECT 1 FROM applications a WHERE a.user_id = ? AND a.job_id = j.id)',
      '(' + titles.map(function() { return 'j.title LIKE ?'; }).join(' OR ') + ')',
      '(' + locations.map(function() { return 'j.location LIKE ?'; }).join(' OR ') + ')'
    ];
    var params = [req.session.user.id]
      .concat(titles.map(function(title) { return '%' + title + '%'; }))
      .concat(locations.map(function(location) { return '%' + location + '%'; }));
    if (workModes.includes(rule.work_mode) && rule.work_mode !== 'any') {
      filters.push('j.work_mode = ?');
      params.push(rule.work_mode);
    }
    var [countRows] = await db.execute(
      'SELECT COUNT(*) AS count FROM jobs j JOIN companies c ON c.id = j.company_id WHERE ' + filters.join(' AND '),
      params
    );
    pagination = createPagination({
      pathname: '/automation',
      pageParam: 'page',
      requestedPage: req.query.page,
      pageSize: 10,
      totalItems: Math.min(Number(countRows[0].count), weeklyRemaining)
    });
    var matchLimit = Math.min(pagination.pageSize, pagination.totalItems - pagination.offset);
    if (matchLimit > 0) {
      var [matches] = await db.execute(
        'SELECT j.id, j.title, j.location, j.work_mode, j.employment_type, j.salary_min, j.salary_max, j.description, j.source_name, j.apply_url, j.published_at, c.name AS company_name FROM jobs j JOIN companies c ON c.id = j.company_id WHERE ' + filters.join(' AND ') + ' ORDER BY j.published_at DESC LIMIT ? OFFSET ?',
        params.concat([matchLimit, pagination.offset])
      );
      suggestedJobs = matches;
    }
  }
  res.render('automation', {
    title: 'Auto apply',
    activeNav: 'automation',
    rule: rule,
    suggestedJobs: suggestedJobs,
    pagination: pagination,
    weeklyCount: weeklyCount,
    weeklyRemaining: weeklyRemaining
  });
}));

router.post('/automation', verifyCsrf, asyncHandler(async function(req, res) {
  var titles = String(req.body.targetTitles || '').trim().slice(0, 255);
  var locations = String(req.body.locations || '').trim().slice(0, 255);
  var mode = workModes.includes(req.body.workMode) ? req.body.workMode : 'any';
  var weeklyLimit = Number(req.body.weeklyLimit);

  if (!titles || !locations || !Number.isInteger(weeklyLimit) || weeklyLimit < 1 || weeklyLimit > 20) {
    flash(req, 'error', 'Isi jabatan, lokasi, dan batas mingguan antara 1–20.');
    return res.redirect('/automation');
  }

  await db.execute(
    "INSERT INTO automation_rules (user_id, is_enabled, target_titles, locations, work_mode, weekly_limit, approval_mode) VALUES (?, FALSE, ?, ?, ?, ?, 'manual_review') ON DUPLICATE KEY UPDATE target_titles = VALUES(target_titles), locations = VALUES(locations), work_mode = VALUES(work_mode), weekly_limit = VALUES(weekly_limit)",
    [req.session.user.id, titles, locations, mode, weeklyLimit]
  );
  flash(req, 'success', 'Kriteria auto apply tersimpan. Semua lowongan tetap memerlukan tinjauan manual.');
  res.redirect('/automation');
}));

router.post('/automation/toggle', verifyCsrf, asyncHandler(async function(req, res) {
  var [rows] = await db.execute('SELECT target_titles, locations, is_enabled FROM automation_rules WHERE user_id = ?', [req.session.user.id]);
  if (!rows.length || !rows[0].target_titles || !rows[0].locations) {
    flash(req, 'error', 'Simpan jabatan dan lokasi terlebih dahulu sebelum mengaktifkan aturan.');
    return res.redirect('/automation');
  }
  await db.execute('UPDATE automation_rules SET is_enabled = NOT is_enabled WHERE user_id = ?', [req.session.user.id]);
  flash(req, 'success', 'Status aturan diperbarui. Kecocokan hanya menyiapkan draft; pengiriman ke perusahaan tetap manual.');
  res.redirect('/automation');
}));

router.post('/automation/jobs/:id/draft', verifyCsrf, asyncHandler(async function(req, res) {
  var jobId = Number(req.params.id);
  if (!Number.isSafeInteger(jobId) || jobId < 1) throw Object.assign(new Error('Lowongan tidak ditemukan.'), { status: 404 });

  var applicationId;
  var connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    var [rules] = await connection.execute(
      'SELECT is_enabled, weekly_limit FROM automation_rules WHERE user_id = ? FOR UPDATE',
      [req.session.user.id]
    );
    if (!rules.length || !rules[0].is_enabled) {
      await connection.rollback();
      flash(req, 'error', 'Aktifkan aturan sebelum menyiapkan draft dari daftar kecocokan.');
      return res.redirect('/automation');
    }
    var [existingApplications] = await connection.execute(
      'SELECT id FROM applications WHERE user_id = ? AND job_id = ? FOR UPDATE',
      [req.session.user.id, jobId]
    );
    if (existingApplications.length) {
      await connection.rollback();
      flash(req, 'info', 'Draft untuk lowongan ini sudah ada. Lanjutkan dari halaman tinjauan.');
      return res.redirect('/applications/' + existingApplications[0].id + '/review');
    }
    var [countRows] = await connection.execute(
      'SELECT COUNT(*) AS count FROM applications WHERE user_id = ? AND applied_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
      [req.session.user.id]
    );
    if (Number(countRows[0].count) >= Number(rules[0].weekly_limit)) {
      await connection.rollback();
      flash(req, 'error', 'Batas draft mingguan tercapai. Tinjau kembali minggu depan atau sesuaikan batasnya.');
      return res.redirect('/automation');
    }
    var [result] = await connection.execute(
      "INSERT INTO applications (user_id, job_id, status, notes) SELECT ?, id, 'draft', '' FROM jobs WHERE id = ? AND is_active = 1",
      [req.session.user.id, jobId]
    );
    if (!result.affectedRows) throw Object.assign(new Error('Lowongan tidak ditemukan atau sudah tidak aktif.'), { status: 404 });
    applicationId = result.insertId;
    await connection.execute(
      "INSERT INTO application_status_history (application_id, previous_status, new_status) VALUES (?, NULL, 'draft')",
      [applicationId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      flash(req, 'info', 'Lowongan ini sudah ada di daftar lamaran kamu.');
      return res.redirect('/automation');
    }
    throw error;
  } finally {
    connection.release();
  }
  flash(req, 'success', 'Draft siap ditinjau. Lengkapi checklist, lalu kirim sendiri melalui situs perusahaan.');
  res.redirect('/applications/' + applicationId + '/review');
}));

router.get('/profile', asyncHandler(async function(req, res) {
  var [rows] = await db.execute(
    'SELECT u.name, u.email, p.headline, p.location, p.summary, p.skills, p.cv_storage_key, p.cv_original_name, p.cv_size, p.cv_uploaded_at FROM users u LEFT JOIN candidate_profiles p ON p.user_id = u.id WHERE u.id = ?',
    [req.session.user.id]
  );
  res.render('profile', { title: 'Profil & CV', activeNav: 'profile', profile: rows[0] });
}));

router.post('/profile/cv', handleCvUpload, verifyCsrf, asyncHandler(async function(req, res) {
  if (!req.file) {
    flash(req, 'error', 'Pilih file CV berformat PDF terlebih dahulu.');
    return res.redirect('/profile');
  }
  if (req.file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    flash(req, 'error', 'Isi file tidak dikenali sebagai PDF yang valid.');
    return res.redirect('/profile');
  }

  var userId = req.session.user.id;
  var storageKey = crypto.randomBytes(16).toString('hex') + '.pdf';
  var userDirectory = path.join(cvDirectory, String(userId));
  await fs.mkdir(userDirectory, { recursive: true, mode: 0o700 });
  var filePath = path.join(userDirectory, storageKey);
  await fs.writeFile(filePath, req.file.buffer, { flag: 'wx', mode: 0o600 });

  var originalName = String(req.file.originalname || 'CV.pdf')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 255) || 'CV.pdf';
  var [existingRows] = await db.execute('SELECT cv_storage_key FROM candidate_profiles WHERE user_id = ?', [userId]);
  try {
    await db.execute(
      'INSERT INTO candidate_profiles (user_id, summary, cv_storage_key, cv_original_name, cv_size, cv_uploaded_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE cv_storage_key = VALUES(cv_storage_key), cv_original_name = VALUES(cv_original_name), cv_size = VALUES(cv_size), cv_uploaded_at = CURRENT_TIMESTAMP',
      [userId, '', storageKey, originalName, req.file.size]
    );
  } catch (error) {
    await fs.unlink(filePath).catch(function(cleanupError) {
      console.error('Unable to remove unregistered CV upload:', cleanupError.message);
    });
    throw error;
  }
  if (existingRows[0] && safeCvKey(existingRows[0].cv_storage_key)) {
    await fs.unlink(path.join(userDirectory, existingRows[0].cv_storage_key)).catch(function(error) {
      if (error.code !== 'ENOENT') console.error('Unable to remove previous CV:', error.message);
    });
  }
  flash(req, 'success', 'CV PDF berhasil diunggah dan hanya dapat diakses dari akun kamu.');
  res.redirect('/profile');
}));

router.get('/profile/cv/download', asyncHandler(async function(req, res, next) {
  var [rows] = await db.execute(
    'SELECT cv_storage_key FROM candidate_profiles WHERE user_id = ?',
    [req.session.user.id]
  );
  var storageKey = rows[0] && rows[0].cv_storage_key;
  if (!safeCvKey(storageKey)) throw Object.assign(new Error('CV belum tersedia.'), { status: 404 });

  var filePath = path.join(cvDirectory, String(req.session.user.id), storageKey);
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type('application/pdf');
  res.attachment('CV.pdf');
  res.sendFile(filePath, function(error) {
    if (error && !res.headersSent) next(error);
  });
}));

router.post('/profile/cv/delete', verifyCsrf, asyncHandler(async function(req, res) {
  var [rows] = await db.execute(
    'SELECT cv_storage_key FROM candidate_profiles WHERE user_id = ?',
    [req.session.user.id]
  );
  var storageKey = rows[0] && rows[0].cv_storage_key;
  if (!safeCvKey(storageKey)) {
    flash(req, 'info', 'Tidak ada CV yang tersimpan.');
    return res.redirect('/profile');
  }
  await fs.unlink(path.join(cvDirectory, String(req.session.user.id), storageKey)).catch(function(error) {
    if (error.code !== 'ENOENT') throw error;
  });
  await db.execute(
    'UPDATE candidate_profiles SET cv_storage_key = NULL, cv_original_name = NULL, cv_size = NULL, cv_uploaded_at = NULL WHERE user_id = ?',
    [req.session.user.id]
  );
  flash(req, 'success', 'CV berhasil dihapus.');
  res.redirect('/profile');
}));

router.post('/profile', verifyCsrf, asyncHandler(async function(req, res) {
  var name = String(req.body.name || '').trim();
  var headline = String(req.body.headline || '').trim();
  var location = String(req.body.location || '').trim();
  var summary = String(req.body.summary || '').trim();
  var skills = String(req.body.skills || '').trim();
  if (!name || name.length > 100 || headline.length > 160 || location.length > 120 || skills.length > 500 || summary.length > 5000) {
    flash(req, 'error', 'Periksa kembali nama dan batas panjang setiap kolom.');
    return res.redirect('/profile');
  }

  var connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE users SET name = ? WHERE id = ?', [name, req.session.user.id]);
    await connection.execute(
      'INSERT INTO candidate_profiles (user_id, headline, location, summary, skills) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE headline = VALUES(headline), location = VALUES(location), summary = VALUES(summary), skills = VALUES(skills)',
      [req.session.user.id, headline, location, summary, skills]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  req.session.user.name = name;
  flash(req, 'success', 'Profil berhasil diperbarui.');
  res.redirect('/profile');
}));

router.get('/settings', asyncHandler(async function(req, res) {
  res.render('settings', { title: 'Pengaturan', activeNav: 'settings' });
}));

router.post('/settings/password', verifyCsrf, asyncHandler(async function(req, res) {
  var currentPassword = String(req.body.currentPassword || '');
  var newPassword = String(req.body.newPassword || '');
  if (Buffer.byteLength(newPassword, 'utf8') < 10 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    flash(req, 'error', 'Kata sandi baru harus memiliki panjang 10–72 byte.');
    return res.redirect('/settings');
  }

  var [rows] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id]);
  var passwordMatches = rows.length && await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!passwordMatches) {
    flash(req, 'error', 'Kata sandi saat ini tidak sesuai.');
    return res.redirect('/settings');
  }
  var passwordHash = await bcrypt.hash(newPassword, 12);
  await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.session.user.id]);
  var currentUser = req.session.user;
  await new Promise(function(resolve, reject) {
    req.session.regenerate(function(error) {
      if (error) return reject(error);
      resolve();
    });
  });
  req.session.user = currentUser;
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  flash(req, 'success', 'Kata sandi berhasil diganti.');
  res.redirect('/settings');
}));

module.exports = router;
