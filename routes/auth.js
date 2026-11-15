var express = require('express');
var bcrypt = require('bcryptjs');
var crypto = require('crypto');
var db = require('../lib/db');
var { verifyCsrf, asyncHandler, flash } = require('../middleware/auth');

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function renderAuth(req, res, view, title, values) {
  res.render(view, Object.assign({
    title: title,
    csrfToken: req.session.csrfToken,
    flash: res.locals.flash
  }, values || {}));
}

module.exports = function(authLimiter) {
  var router = express.Router();

  router.get('/login', function(req, res) {
    if (req.session.user) return res.redirect('/dashboard');
    renderAuth(req, res, 'login', 'Masuk');
  });

  router.post('/login', authLimiter, verifyCsrf, asyncHandler(async function(req, res) {
    var email = String(req.body.email || '').trim().toLowerCase();
    var password = String(req.body.password || '');
    if (!validEmail(email) || !password || Buffer.byteLength(password, 'utf8') > 72) {
      flash(req, 'error', 'Email atau kata sandi tidak valid.');
      return res.redirect('/login');
    }

    var [rows] = await db.execute('SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
    var user = rows[0];
    var passwordMatches = user && await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      flash(req, 'error', 'Email atau kata sandi tidak cocok.');
      return res.redirect('/login');
    }

    var returnTo = req.session.returnTo;
    await new Promise(function(resolve, reject) {
      req.session.regenerate(function(error) {
        if (error) return reject(error);
        resolve();
      });
    });
    req.session.user = { id: user.id, name: user.name, email: user.email };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    return res.redirect(typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard');
  }));

  router.get('/register', function(req, res) {
    if (req.session.user) return res.redirect('/dashboard');
    renderAuth(req, res, 'register', 'Buat akun');
  });

  router.post('/register', authLimiter, verifyCsrf, asyncHandler(async function(req, res) {
    var name = String(req.body.name || '').trim();
    var email = String(req.body.email || '').trim().toLowerCase();
    var password = String(req.body.password || '');
    if (!name || name.length > 100 || !validEmail(email)) {
      flash(req, 'error', 'Masukkan nama dan email yang valid.');
      return res.redirect('/register');
    }
    if (Buffer.byteLength(password, 'utf8') < 10 || Buffer.byteLength(password, 'utf8') > 72) {
      flash(req, 'error', 'Kata sandi harus memiliki panjang 10–72 byte.');
      return res.redirect('/register');
    }

    var passwordHash = await bcrypt.hash(password, 12);
    var connection = await db.getConnection();
    var userId;
    try {
      await connection.beginTransaction();
      var [result] = await connection.execute(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [name, email, passwordHash]
      );
      userId = result.insertId;
      await connection.execute(
        'INSERT INTO candidate_profiles (user_id, summary) VALUES (?, ?)',
        [userId, '']
      );
      await connection.execute(
        'INSERT INTO job_preferences (user_id) VALUES (?)',
        [userId]
      );
      await connection.execute(
        'INSERT INTO automation_rules (user_id) VALUES (?)',
        [userId]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') {
        flash(req, 'error', 'Email tersebut sudah terdaftar. Silakan masuk.');
        return res.redirect('/login');
      }
      throw error;
    } finally {
      connection.release();
    }

    await new Promise(function(resolve, reject) {
      req.session.regenerate(function(error) {
        if (error) return reject(error);
        resolve();
      });
    });
    req.session.user = { id: userId, name: name, email: email };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    flash(req, 'success', 'Akun berhasil dibuat. Lengkapi preferensi kerja untuk memulai.');
    res.redirect('/profile');
  }));

  router.post('/logout', verifyCsrf, function(req, res, next) {
    req.session.destroy(function(error) {
      if (error) return next(error);
      res.clearCookie('applier.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      res.redirect('/login');
    });
  });

  return router;
};
