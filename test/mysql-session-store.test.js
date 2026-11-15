var test = require('node:test');
var assert = require('node:assert/strict');
var db = require('../lib/db');
var MySQLSessionStore = require('../lib/mysql-session-store');

test('MySQL session store serializes, retrieves, refreshes, and destroys sessions', async function() {
  var originalExecute = db.execute;
  var storedData;
  var storedExpiry;
  var store = new MySQLSessionStore();

  db.execute = async function(sql, params) {
    if (sql.startsWith('INSERT INTO sessions')) {
      storedExpiry = params[1];
      storedData = params[2];
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith('SELECT data FROM sessions')) {
      return [storedData ? [{ data: storedData }] : [], []];
    }
    if (sql.startsWith('UPDATE sessions')) {
      storedExpiry = params[0];
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith('DELETE FROM sessions')) {
      storedData = null;
      return [{ affectedRows: 1 }, []];
    }
    throw new Error('Unexpected SQL in session store test.');
  };

  try {
    var sessionData = {
      cookie: { expires: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      user: { id: 7, name: 'Rani' }
    };
    await new Promise(function(resolve, reject) {
      store.set('session-id', sessionData, function(error) { error ? reject(error) : resolve(); });
    });
    var saved = await new Promise(function(resolve, reject) {
      store.get('session-id', function(error, value) { error ? reject(error) : resolve(value); });
    });
    assert.deepEqual(saved, sessionData);
    assert.ok(storedExpiry > Math.floor(Date.now() / 1000));

    await new Promise(function(resolve, reject) {
      store.touch('session-id', sessionData, function(error) { error ? reject(error) : resolve(); });
    });
    await new Promise(function(resolve, reject) {
      store.destroy('session-id', function(error) { error ? reject(error) : resolve(); });
    });
    var removed = await new Promise(function(resolve, reject) {
      store.get('session-id', function(error, value) { error ? reject(error) : resolve(value); });
    });
    assert.equal(removed, null);
  } finally {
    store.close();
    db.execute = originalExecute;
  }
});
