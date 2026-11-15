var test = require('node:test');
var assert = require('node:assert/strict');
var extractJobPostingsFromPage = require('../extension/job-extractor');

function visibleElement(text) {
  return {
    innerText: text,
    textContent: text,
    getClientRects: function() { return [{}]; }
  };
}

function mockDocument(selectors) {
  return {
    querySelectorAll: function(selector) {
      return selectors[selector] || [];
    }
  };
}

function makeJobCard(id, options) {
  var settings = options || {};
  var href = 'https://careers.example.com/job/' + id;
  var link = {
    href: href,
    innerText: settings.title || 'Product Designer ' + id,
    textContent: settings.title || 'Product Designer ' + id,
    getAttribute: function() { return '/job/' + id; },
    getClientRects: function() { return settings.hidden ? [] : [{}]; }
  };
  var company = visibleElement(settings.company || 'Studio ' + id);
  var title = visibleElement(settings.title || 'Product Designer ' + id);
  var location = visibleElement(settings.location || 'Jakarta');
  var card = {
    innerText: [title.innerText, company.innerText, location.innerText].join(' · '),
    textContent: [title.textContent, company.textContent, location.textContent].join(' · '),
    parentElement: null,
    getClientRects: function() { return settings.hidden ? [] : [{}]; },
    querySelectorAll: function(selector) {
      if (selector.indexOf('a[href') === 0 || selector.indexOf('a[data-automation') === 0 || selector.indexOf('a[data-testid') === 0) return [link];
      if (selector.indexOf('jobTitle') !== -1 || selector.indexOf('job-title') !== -1 || selector === 'h2' || selector === 'h3') return [title];
      if (selector.indexOf('Company') !== -1 || selector.indexOf('company') !== -1 || selector.indexOf('companies') !== -1) return [company];
      if (selector.indexOf('Location') !== -1 || selector.indexOf('location') !== -1) return [location];
      return [];
    }
  };
  link.parentElement = card;
  return { card: card, link: link };
}

test('browser extractor falls back to visible job detail fields without structured metadata', function() {
  var page = mockDocument({
    'script[type="application/ld+json"]': [],
    '[data-automation="jobTitle"]': [visibleElement('Senior Product Designer')],
    '[data-automation="advertiser-name"]': [visibleElement('Studio Example')],
    '[data-automation="job-detail-location"]': [visibleElement('Jakarta · Hybrid')],
    '[data-automation="jobAdDetails"]': [visibleElement('Design accessible products with a cross-functional team.')],
    h1: [visibleElement('Senior Product Designer')]
  });
  var result = extractJobPostingsFromPage(page, { href: 'https://careers.example.com/job/123', pathname: '/job/123' });

  assert.equal(result.extractionMethod, 'visible-page');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, 'Senior Product Designer');
  assert.equal(result.jobs[0].company, 'Studio Example');
  assert.equal(result.jobs[0].location, 'Jakarta · Hybrid');
  assert.equal(result.jobs[0].description, 'Design accessible products with a cross-functional team.');
});

test('browser extractor ignores hidden fields and does not guess on search pages', function() {
  var hiddenTitle = {
    innerText: 'Search results',
    textContent: 'Search results',
    getClientRects: function() { return []; }
  };
  var page = mockDocument({
    'script[type="application/ld+json"]': [],
    '[data-automation="jobTitle"]': [hiddenTitle],
    '[data-automation="advertiser-name"]': [visibleElement('Company')],
    'h1': [hiddenTitle]
  });
  var result = extractJobPostingsFromPage(page, { href: 'https://careers.example.com/search?q=design', pathname: '/search' });

  assert.equal(result.jobs.length, 0);
});

test('browser extractor collects visible cards, ignores hidden cards, and deduplicates URLs', function() {
  var first = makeJobCard('101');
  var duplicate = makeJobCard('101', { title: 'Duplicate card' });
  var second = makeJobCard('202', { title: 'Senior UX Designer', company: 'Example Studio' });
  var hidden = makeJobCard('303', { hidden: true });
  var cards = [first.card, duplicate.card, second.card, hidden.card];
  var links = [first.link, duplicate.link, second.link, hidden.link];
  var page = mockDocument({
    'script[type="application/ld+json"]': [],
    '[data-automation="jobListing"]': cards,
    'a[href*="/job/"], a[href*="/job-"], a[data-automation*="jobTitle"], a[data-testid*="job-title"]': links
  });
  var result = extractJobPostingsFromPage(page, { href: 'https://careers.example.com/search?q=designer', origin: 'https://careers.example.com', pathname: '/search' });

  assert.equal(result.extractionMethod, 'visible-cards');
  assert.equal(result.jobs.length, 2);
  assert.deepEqual(result.jobs.map(function(job) { return job.url; }), [
    'https://careers.example.com/job/101',
    'https://careers.example.com/job/202'
  ]);
  assert.equal(result.jobs[1].title, 'Senior UX Designer');
  assert.equal(result.jobs[1].company, 'Example Studio');
});

test('browser extractor caps one active-page batch at 50 jobs', function() {
  var cards = [];
  var links = [];
  for (var index = 0; index < 55; index += 1) {
    var job = makeJobCard(String(index + 1));
    cards.push(job.card);
    links.push(job.link);
  }
  var page = mockDocument({
    'script[type="application/ld+json"]': [],
    '[data-automation="jobListing"]': cards,
    'a[href*="/job/"], a[href*="/job-"], a[data-automation*="jobTitle"], a[data-testid*="job-title"]': links
  });
  var result = extractJobPostingsFromPage(page, { href: 'https://careers.example.com/search?q=designer', origin: 'https://careers.example.com', pathname: '/search' });

  assert.equal(result.jobs.length, 50);
});
