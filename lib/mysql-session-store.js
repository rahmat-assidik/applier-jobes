var util = require('util');
var session = require('express-session');
var db = require('./db');

function MySQLSessionStore() {
  session.Store.call(this);
  this.cleanupTimer = setInterval(() => {
    db.execute('DELETE FROM sessions WHERE expires <= UNIX_TIMESTAMP()').catch(function(error) {
      console.error('Unable to remove expired sessions:', error.message);
    });
  }, 15 * 60 * 1000);
  this.cleanupTimer.unref();
}

util.inherits(MySQLSessionStore, session.Store);

MySQLSessionStore.prototype.get = function(sessionId, callback) {
  db.execute('SELECT data FROM sessions WHERE session_id = ? AND expires > UNIX_TIMESTAMP()', [sessionId])
    .then(function(result) {
      if (!result[0].length) return callback(null, null);
      try {
        callback(null, JSON.parse(result[0][0].data));
      } catch (error) {
        callback(error);
      }
    })
    .catch(callback);
};

MySQLSessionStore.prototype.set = function(sessionId, sessionData, callback) {
  var expiresAt = sessionData.cookie && sessionData.cookie.expires
    ? new Date(sessionData.cookie.expires).getTime()
    : Date.now() + 12 * 60 * 60 * 1000;
  var expires = Math.floor(expiresAt / 1000);
  var data = JSON.stringify(sessionData);

  db.execute(
    'INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)',
    [sessionId, expires, data]
  ).then(function() {
    callback(null);
  }).catch(callback);
};

MySQLSessionStore.prototype.touch = function(sessionId, sessionData, callback) {
  var expiresAt = sessionData.cookie && sessionData.cookie.expires
    ? new Date(sessionData.cookie.expires).getTime()
    : Date.now() + 12 * 60 * 60 * 1000;
  db.execute('UPDATE sessions SET expires = ? WHERE session_id = ?', [Math.floor(expiresAt / 1000), sessionId])
    .then(function() {
      callback(null);
    })
    .catch(callback);
};

MySQLSessionStore.prototype.destroy = function(sessionId, callback) {
  db.execute('DELETE FROM sessions WHERE session_id = ?', [sessionId])
    .then(function() {
      callback(null);
    })
    .catch(callback);
};

MySQLSessionStore.prototype.clear = function(callback) {
  db.execute('DELETE FROM sessions')
    .then(function() {
      callback(null);
    })
    .catch(callback);
};

MySQLSessionStore.prototype.length = function(callback) {
  db.execute('SELECT COUNT(*) AS count FROM sessions')
    .then(function(result) {
      callback(null, Number(result[0][0].count));
    })
    .catch(callback);
};

MySQLSessionStore.prototype.close = function(callback) {
  clearInterval(this.cleanupTimer);
  if (callback) callback(null);
};

module.exports = MySQLSessionStore;
