var test = require('node:test');
var assert = require('node:assert/strict');
var createPagination = require('../lib/pagination');

test('pagination calculates offsets, ranges, and nearby page links', function() {
  var pagination = createPagination({
    pathname: '/jobs',
    pageParam: 'page',
    requestedPage: '3',
    pageSize: 10,
    totalItems: 97,
    query: { q: 'product design', location: 'Jakarta' }
  });

  assert.equal(pagination.page, 3);
  assert.equal(pagination.offset, 20);
  assert.equal(pagination.startItem, 21);
  assert.equal(pagination.endItem, 30);
  assert.equal(pagination.totalPages, 10);
  assert.deepEqual(pagination.pages.map(function(page) { return page.number; }), [1, 2, 3, 4, 5]);
  assert.equal(pagination.pages[2].current, true);
  assert.equal(pagination.pages[1].url, '/jobs?q=product+design&location=Jakarta&page=2');
  assert.equal(pagination.showLastPage, true);
  assert.equal(pagination.showTrailingEllipsis, true);
});

test('pagination clamps invalid and out-of-range page numbers', function() {
  var invalidPage = createPagination({
    pathname: '/applications',
    pageParam: 'page',
    requestedPage: 'invalid',
    totalItems: 21
  });
  var pastLastPage = createPagination({
    pathname: '/applications',
    pageParam: 'page',
    requestedPage: '99',
    totalItems: 21
  });

  assert.equal(invalidPage.page, 1);
  assert.equal(invalidPage.offset, 0);
  assert.equal(pastLastPage.page, 3);
  assert.equal(pastLastPage.startItem, 21);
  assert.equal(pastLastPage.endItem, 21);
});

test('pagination handles empty data without generating invalid ranges', function() {
  var pagination = createPagination({
    pathname: '/saved-jobs',
    pageParam: 'page',
    requestedPage: '2',
    totalItems: 0
  });

  assert.equal(pagination.page, 1);
  assert.equal(pagination.totalPages, 0);
  assert.equal(pagination.startItem, 0);
  assert.equal(pagination.endItem, 0);
  assert.equal(pagination.hasPrevious, false);
  assert.equal(pagination.hasNext, false);
});
