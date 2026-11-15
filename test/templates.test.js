var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var pug = require('pug');
var createPagination = require('../lib/pagination');

var viewsDirectory = path.join(__dirname, '..', 'views');
var templateNames = fs.readdirSync(viewsDirectory).filter(function(file) { return file.endsWith('.pug'); });

test('all Pug views compile', function() {
  assert.ok(templateNames.length >= 10);
  templateNames.forEach(function(file) {
    assert.doesNotThrow(function() {
      pug.compileFile(path.join(viewsDirectory, file));
    }, file + ' should compile');
  });
});

test('authenticated layout renders accessible toast feedback and client handler', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'dashboard.pug'), {
    title: 'Dashboard',
    activeNav: 'dashboard',
    currentUser: { id: 1, name: 'Rani', email: 'rani@example.test' },
    csrfToken: 'test-token',
    flash: { type: 'success', message: 'Profil berhasil disimpan.' },
    navItems: [],
    statusCounts: {},
    totalApplications: 0,
    savedCount: 0,
    jobs: [],
    recentApplications: [],
    automation: { is_enabled: false, weekly_limit: 5 },
    sourceStatus: [],
    statusLabels: {},
    formatDate: function(date) { return date; },
    formatMoney: function(value) { return String(value); }
  });

  assert.match(html, /id="toastRegion" aria-live="polite"/);
  assert.match(html, /class="toast toast-success" role="status"/);
  assert.match(html, /aria-label="Tutup pemberitahuan"/);
  assert.match(html, /\/javascripts\/feedback\.js/);
});

test('auth layout announces error feedback assertively', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'login.pug'), {
    title: 'Masuk',
    csrfToken: 'test-token',
    flash: { type: 'error', message: 'Email atau kata sandi tidak cocok.' }
  });

  assert.match(html, /id="toastRegion" aria-live="assertive"/);
  assert.match(html, /class="toast toast-error" role="alert"/);
  assert.match(html, /\/javascripts\/feedback\.js/);
});

test('login view renders a CSRF-protected form', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'login.pug'), {
    title: 'Masuk',
    csrfToken: 'test-token',
    flash: null
  });
  assert.match(html, /action="\/login"/);
  assert.match(html, /name="_csrf" value="test-token"/);
  assert.match(html, /autocomplete="current-password"/);
});

test('job search page explains browser imports and site permission requirements', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'jobs.pug'), {
    title: 'Cari lowongan',
    activeNav: 'jobs',
    currentUser: { id: 1, name: 'Rani', email: 'rani@example.test' },
    csrfToken: 'test-token',
    flash: null,
    navItems: [],
    jobs: [],
    pagination: { totalItems: 0, totalPages: 0 },
    returnTo: '/jobs',
    search: '',
    location: '',
    workMode: 'any',
    workModes: ['any', 'onsite', 'hybrid', 'remote'],
    formatDate: function(date) { return date; },
    formatMoney: function(value) { return String(value); },
    sourceStatus: []
  });
  assert.match(html, /gunakan ekstensi Applier Jobes/);
  assert.match(html, /halaman itu/);
  assert.match(html, /Pastikan situs mengizinkan penggunaan datanya/);
});

test('job source notice explains Adzuna setup with a developer link', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'jobs.pug'), {
    title: 'Cari lowongan',
    activeNav: 'jobs',
    currentUser: { id: 1, name: 'Rani', email: 'rani@example.test' },
    csrfToken: 'test-token',
    flash: null,
    navItems: [],
    jobs: [],
    pagination: { totalItems: 0, totalPages: 0 },
    returnTo: '/jobs',
    search: '',
    location: '',
    workMode: 'any',
    workModes: ['any', 'onsite', 'hybrid', 'remote'],
    formatDate: function(date) { return date; },
    formatMoney: function(value) { return String(value); },
    sourceStatus: [
      { name: 'Arbeitnow', status: 'updated', count: 20 },
      { name: 'Adzuna', status: 'not-configured', count: 0 }
    ]
  });
  assert.match(html, /20 lowongan tersedia dari sumber langsung/);
  assert.match(html, /Terhubung/);
  assert.match(html, /Perlu konfigurasi/);
  assert.match(html, /https:\/\/developer\.adzuna\.com\/overview/);
  assert.match(html, /ADZUNA_APP_ID/);
  assert.match(html, /ADZUNA_APP_KEY/);
});

test('browser import page renders a CSRF-protected review flow', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'browser-import.pug'), {
    title: 'Impor dari browser',
    activeNav: 'jobs',
    currentUser: { id: 1, name: 'Rani', email: 'rani@example.test' },
    csrfToken: 'test-token',
    flash: null,
    navItems: [{ key: 'jobs', label: 'Cari lowongan', href: '/jobs', icon: 'jobs' }]
  });
  assert.match(html, /Konfirmasi lowongan/);
  assert.match(html, /data-csrf="test-token"/);
  assert.match(html, /browser-import\.js/);
});

test('browser import login handoff page is available without dashboard data', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'browser-import-login.pug'), {
    title: 'Masuk untuk impor',
    flash: null
  });
  assert.match(html, /Masuk untuk melanjutkan/);
  assert.match(html, /browser-import-login\.js/);
});

test('application review renders guided checklist and preserves manual submission', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'application-review.pug'), {
    title: 'Tinjau lamaran',
    activeNav: 'applications',
    currentUser: { id: 1, name: 'Rani', email: 'rani@example.test' },
    csrfToken: 'test-token',
    flash: null,
    navItems: [],
    application: {
      id: 12,
      status: 'draft',
      title: 'Product Designer',
      company_name: 'Studio Example',
      location: 'Jakarta',
      source_name: 'JobStreet',
      apply_url: 'https://example.com/jobs/12',
      headline: 'Product Designer',
      profile_location: 'Jakarta',
      cv_original_name: 'resume.pdf'
    }
  });

  assert.match(html, /ASISTEN LAMARAN TERPANDU/);
  assert.match(html, /Checklist sebelum melamar/);
  assert.match(html, /Buka formulir perusahaan/);
  assert.match(html, /Saya sudah mengirim lamaran/);
  assert.match(html, /tidak mengisi atau mengirim formulir ke situs eksternal secara otomatis/);
});

test('dashboard renders its independent workspace navigation', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'dashboard.pug'), {
    title: 'Dashboard',
    activeNav: 'dashboard',
    currentUser: { id: 1, name: 'Rani', email: 'rani@example.test' },
    csrfToken: 'test-token',
    flash: null,
    navItems: [
      { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
      { key: 'jobs', label: 'Cari lowongan', href: '/jobs', icon: 'jobs' }
    ],
    statusCounts: {},
    totalApplications: 0,
    savedCount: 0,
    jobs: [],
    recentApplications: [],
    jobsPagination: { totalItems: 0, totalPages: 0 },
    applicationsPagination: { totalItems: 0, totalPages: 0 },
    automation: { is_enabled: false, weekly_limit: 5 },
    sourceStatus: [],
    statusLabels: {},
    formatDate: function(date) { return date; },
    formatMoney: function(value) { return String(value); }
  });
  assert.match(html, /href="\/jobs"/);
  assert.match(html, /Selamat datang, Rani/);
  assert.match(html, /Lowongan terbaru/);
});

test('dashboard renders when pagination locals are not provided', function() {
  var html = pug.renderFile(path.join(viewsDirectory, 'dashboard.pug'), {
    title: 'Dashboard',
    activeNav: 'dashboard',
    currentUser: { id: 1, name: 'Rani', email: 'rani@example.test' },
    csrfToken: 'test-token',
    flash: null,
    navItems: [],
    statusCounts: {},
    totalApplications: 0,
    savedCount: 0,
    jobs: [],
    recentApplications: [],
    automation: { is_enabled: false, weekly_limit: 5 },
    sourceStatus: [],
    statusLabels: {},
    formatDate: function(date) { return date; },
    formatMoney: function(value) { return String(value); }
  });

  assert.match(html, /0 lowongan aktif/);
  assert.match(html, /0 catatan lamaran/);
});

test('record list pages render accessible pagination links and preserve filter query', function() {
  var pagination = createPagination({
    pathname: '/jobs',
    pageParam: 'page',
    requestedPage: '2',
    pageSize: 10,
    totalItems: 23,
    query: { q: 'designer', location: 'Jakarta' }
  });
  var shared = {
    title: 'Daftar',
    activeNav: 'jobs',
    currentUser: { id: 1, name: 'Rani', email: 'rani@example.test' },
    csrfToken: 'test-token',
    flash: null,
    navItems: [],
    pagination: pagination,
    formatDate: function(date) { return date; },
    formatMoney: function(value) { return String(value); }
  };
  var html = pug.renderFile(path.join(viewsDirectory, 'jobs.pug'), Object.assign({}, shared, {
    jobs: [],
    returnTo: '/jobs?q=designer&location=Jakarta&page=2',
    search: 'designer',
    location: 'Jakarta',
    workMode: 'any',
    workModes: ['any', 'onsite', 'hybrid', 'remote'],
    sourceStatus: [],
    statusLabels: {}
  }));

  assert.match(html, /Menampilkan 11–20 dari 23 data/);
  assert.match(html, /aria-current="page" aria-label="Halaman 2"/);
  assert.match(html, /href="\/jobs\?q=designer&amp;location=Jakarta&amp;page=3"/);
  assert.match(html, /aria-label="Navigasi halaman"/);
});

test('each dashboard navigation destination has a separate view', function() {
  var expectedViews = ['dashboard', 'jobs', 'saved-jobs', 'applications', 'automation', 'profile', 'settings'];
  expectedViews.forEach(function(name) {
    assert.ok(fs.existsSync(path.join(viewsDirectory, name + '.pug')), name + ' should have its own page');
  });
});
