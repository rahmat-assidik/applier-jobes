var crypto = require('crypto');

function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.is('application/json')) {
      return res.status(401).json({ message: 'Sesi login berakhir. Masuk kembali lalu ulangi impor.' });
    }
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  return next();
}

function verifyCsrf(req, res, next) {
  var submittedToken = req.body && req.body._csrf;
  var storedToken = req.session && req.session.csrfToken;

  if (
    typeof submittedToken !== 'string' ||
    typeof storedToken !== 'string' ||
    submittedToken.length !== storedToken.length ||
    !crypto.timingSafeEqual(Buffer.from(submittedToken), Buffer.from(storedToken))
  ) {
    return next(Object.assign(new Error('Sesi formulir tidak valid. Muat ulang halaman dan coba lagi.'), { status: 403 }));
  }

  return next();
}

function asyncHandler(handler) {
  return function(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function flash(req, type, message) {
  req.session.flash = { type: type, message: message };
}

module.exports = { requireAuth: requireAuth, verifyCsrf: verifyCsrf, asyncHandler: asyncHandler, flash: flash };
