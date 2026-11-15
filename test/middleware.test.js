var test = require('node:test');
var assert = require('node:assert/strict');
var { requireAuth, verifyCsrf } = require('../middleware/auth');

test('requireAuth saves the requested page and redirects anonymous visitors', function() {
  var req = {
    session: {},
    originalUrl: '/applications',
    is: function() { return false; }
  };
  var redirectedTo;
  var nextCalled = false;
  var res = { redirect: function(path) { redirectedTo = path; } };

  requireAuth(req, res, function() { nextCalled = true; });

  assert.equal(redirectedTo, '/login');
  assert.equal(req.session.returnTo, '/applications');
  assert.equal(nextCalled, false);
});

test('requireAuth returns JSON unauthorized for anonymous JSON requests', function() {
  var req = {
    session: {},
    originalUrl: '/jobs/browser-import',
    method: 'POST',
    is: function(type) { return type === 'application/json'; }
  };
  var res = {
    statusCode: 200,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(body) {
      this.body = body;
      return this;
    },
    redirect: assert.fail
  };
  var nextCalled = false;

  requireAuth(req, res, function() { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /Sesi login berakhir/);
  assert.equal(req.session.returnTo, undefined);
  assert.equal(nextCalled, false);
});

test('requireAuth permits authenticated users', function() {
  var nextCalled = false;
  requireAuth(
    { session: { user: { id: 1 } } },
    { redirect: assert.fail },
    function() { nextCalled = true; }
  );
  assert.equal(nextCalled, true);
});

test('verifyCsrf accepts a matching token', function() {
  var nextError;
  verifyCsrf(
    { body: { _csrf: 'abc123' }, session: { csrfToken: 'abc123' } },
    {},
    function(error) { nextError = error; }
  );
  assert.equal(nextError, undefined);
});

test('verifyCsrf rejects missing and invalid tokens', function() {
  for (const body of [{}, { _csrf: 'incorrect' }]) {
    var nextError;
    verifyCsrf(
      { body: body, session: { csrfToken: 'abc123' } },
      {},
      function(error) { nextError = error; }
    );
    assert.equal(nextError.status, 403);
  }
});
