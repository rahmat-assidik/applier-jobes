require('dotenv').config();

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var helmet = require('helmet');
var session = require('express-session');
var rateLimit = require('express-rate-limit');
var crypto = require('crypto');
var authRouter = require('./routes/auth');
var indexRouter = require('./routes/index');
var MySQLSessionStore = require('./lib/mysql-session-store');
var db = require('./lib/db');

var app = express();
var sessionStore = new MySQLSessionStore();
var sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET must be set in production.');
}

if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(48).toString('hex');
  console.warn('SESSION_SECRET is not set; using an ephemeral development secret.');
}

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'form-action': ["'self'"],
      'img-src': ["'self'", 'data:']
    }
  }
}));
app.use(logger(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(function(req, res, next) {
  db.query('SELECT 1').then(function() {
    if (req.path === '/health') return res.json({ status: 'ok', database: 'connected' });
    next();
  }).catch(function(error) {
    console.error('MySQL is unavailable for request ' + req.method + ' ' + req.path + ':', error.message);
    if (req.path === '/health') return res.status(503).json({ status: 'error', database: 'unavailable' });
    res.status(503).render('error', {
      title: 'Database tidak tersedia',
      message: 'Layanan MySQL belum tersambung. Pastikan server database berjalan dan konfigurasi .env sudah benar.',
      error: {}
    });
  });
});
app.use(session({
  name: 'applier.sid',
  secret: sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000
  }
}));
app.use(function(req, res, next) {
  res.locals.csrfToken = req.session.csrfToken || (req.session.csrfToken = crypto.randomBytes(32).toString('hex'));
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.formatMoney = function(value) {
    return value == null ? 'Gaji tidak dicantumkan' : 'Rp ' + new Intl.NumberFormat('id-ID').format(value);
  };
  res.locals.formatDate = function(value) {
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
  };
  res.locals.navItems = [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    { key: 'jobs', label: 'Cari lowongan', href: '/jobs', icon: 'jobs' },
    { key: 'saved', label: 'Lowongan tersimpan', href: '/saved-jobs', icon: 'saved' },
    { key: 'applications', label: 'Lamaran saya', href: '/applications', icon: 'applications' },
    { key: 'automation', label: 'Auto apply', href: '/automation', icon: 'automation' },
    { key: 'profile', label: 'Profil & CV', href: '/profile', icon: 'profile' },
    { key: 'settings', label: 'Pengaturan', href: '/settings', icon: 'settings' }
  ];
  next();
});

var authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'
});

app.use('/', authRouter(authLimiter));
app.use('/', indexRouter);

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  if (err.status >= 500) console.error(err);
  res.locals.message = err.status >= 500 ? 'Terjadi kesalahan pada server.' : err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error', { title: err.status === 404 ? 'Halaman tidak ditemukan' : 'Terjadi kesalahan' });
});

module.exports = app;
