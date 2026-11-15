var test = require('node:test');
var assert = require('node:assert/strict');
var {
  normalizeArbeitnowJob,
  normalizeAdzunaJob,
  normalizeBrowserJob,
  plainText,
  safeJobUrl
} = require('../lib/job-sources');

test('Arbeitnow listings are normalized and retain source attribution', function() {
  var job = normalizeArbeitnowJob({
    slug: 'designer-berlin-123',
    company_name: 'Studio <strong>Berlin</strong>',
    title: 'Product Designer',
    description: '<p>Design systems &amp; product work.</p>',
    remote: true,
    job_types: ['Full-time'],
    location: 'Berlin',
    url: 'https://www.arbeitnow.com/jobs/companies/studio/designer-123',
    created_at: 1794714914
  });

  assert.equal(job.source, 'Arbeitnow');
  assert.equal(job.externalId, 'designer-berlin-123');
  assert.equal(job.company, 'Studio Berlin');
  assert.equal(job.description, 'Design systems & product work.');
  assert.equal(job.workMode, 'remote');
  assert.equal(job.applyUrl, 'https://www.arbeitnow.com/jobs/companies/studio/designer-123');
});

test('external job URLs reject unsafe protocols and embedded credentials', function() {
  assert.equal(safeJobUrl('javascript:alert(1)'), null);
  assert.equal(safeJobUrl('https://user:password@example.com/job'), null);
  assert.equal(safeJobUrl('https://example.com/job'), 'https://example.com/job');
});

test('Adzuna listing fields are normalized for local job storage', function() {
  var job = normalizeAdzunaJob({
    id: '12345',
    title: 'UX Designer',
    description: '<div>Build accessible experiences.</div>',
    redirect_url: 'https://www.adzuna.co.id/jobs/land/ad/12345',
    created: '2026-11-15T10:00:00Z',
    company: { display_name: 'Example Company' },
    location: { display_name: 'Jakarta' },
    contract_type: 'permanent',
    contract_time: 'full_time',
    salary_min: 10000000,
    salary_max: 15000000
  });

  assert.equal(job.source, 'Adzuna');
  assert.equal(job.company, 'Example Company');
  assert.equal(job.location, 'Jakarta');
  assert.equal(job.description, 'Build accessible experiences.');
  assert.equal(job.salaryMin, 10000000);
  assert.equal(job.employmentType, 'full-time');
});

test('normalizers skip incomplete listings and strip markup from text', function() {
  assert.equal(normalizeArbeitnowJob({ slug: 'missing-fields' }), null);
  assert.equal(normalizeAdzunaJob({ id: 'missing-fields' }), null);
  assert.equal(plainText('<script>alert(1)</script><p>Safe text</p>', 100), 'alert(1) Safe text');
});

test('job descriptions preserve paragraphs, line breaks, and emphasized headings', function() {
  assert.equal(
    plainText('<p><strong>About the team</strong></p><p>We work with startups.<br>Our goal is better tools.</p><ul><li>Build workflows</li><li>Share feedback</li></ul>', 500, true),
    'About the team\n\nWe work with startups.\nOur goal is better tools.\n\nBuild workflows\n\nShare feedback'
  );
});

test('job descriptions decode escaped HTML tags instead of displaying markup', function() {
  var description = '&lt;/li&gt; &lt;/ul&gt; &lt;h2&gt;&lt;strong&gt;Your Expertise:&amp;nbsp;&lt;/strong&gt;&lt;/h2&gt; &lt;p&gt;Candidates should have experience.&lt;/p&gt; &lt;ul&gt;&lt;li&gt;Build tools&lt;/li&gt;&lt;li&gt;Share feedback&lt;/li&gt;&lt;/ul&gt;';
  var result = plainText(description, 1000, true);

  assert.equal(result, 'Your Expertise:\n\nCandidates should have experience.\n\nBuild tools\n\nShare feedback');
  assert.doesNotMatch(result, /<\/?(?:li|ul|h2|strong|p)>|&nbsp;/i);
});

test('browser imports accept normalized HTTPS job postings and reject unsafe URLs', function() {
  var job = normalizeBrowserJob({
    title: '<strong>Senior Engineer</strong>',
    company: 'Example Inc.',
    url: 'https://careers.example.com/jobs/123#details',
    location: 'Jakarta',
    workMode: 'remote',
    employmentType: 'FULL_TIME',
    description: '<p>Build reliable systems.</p>'
  });

  assert.equal(job.source, 'Career page: careers.example.com');
  assert.equal(job.title, 'Senior Engineer');
  assert.equal(job.applyUrl, 'https://careers.example.com/jobs/123');
  assert.equal(job.workMode, 'remote');
  assert.equal(job.description, 'Build reliable systems.');
  assert.equal(normalizeBrowserJob({ title: 'Role', company: 'Co', url: 'http://careers.example.com/job' }), null);
  assert.equal(normalizeBrowserJob({ title: 'Role', company: 'Co', url: 'javascript:alert(1)' }), null);
});
