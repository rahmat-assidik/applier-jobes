(function(root) {
  function extractJobPostingsFromPage(pageDocument, pageLocation) {
    var page = pageDocument || document;
    var currentLocation = pageLocation || location;

    function cleanText(value, maxLength) {
      return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }

    function isVisible(element) {
      if (!element || !element.getClientRects || !element.getClientRects().length) return false;
      if (typeof getComputedStyle === 'function') {
        var style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      }
      return true;
    }

    function queryAll(selector, scope) {
      try {
        return Array.from((scope || page).querySelectorAll(selector));
      } catch (error) {
        return [];
      }
    }

    function visibleText(selectors, scope, maxLength) {
      for (var selector of selectors) {
        for (var element of queryAll(selector, scope)) {
          if (!isVisible(element)) continue;
          var text = cleanText(element.innerText || element.textContent, maxLength);
          if (text) return text;
        }
      }
      return '';
    }

    function collect(node, output) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(function(item) { collect(item, output); });
        return;
      }
      if (typeof node !== 'object') return;

      var types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      if (types.some(function(type) { return typeof type === 'string' && type.toLowerCase().split(/[\/#:]/).pop() === 'jobposting'; })) {
        output.push(node);
      }
      if (node['@graph']) collect(node['@graph'], output);
      if (node.itemListElement) collect(node.itemListElement, output);
      if (node.item && typeof node.item === 'object') collect(node.item, output);
    }

    var postings = [];
    var malformedBlocks = 0;
    queryAll('script[type="application/ld+json"]').forEach(function(script) {
      try {
        collect(JSON.parse(script.textContent), postings);
      } catch (error) {
        malformedBlocks += 1;
      }
    });

    var unique = new Map();
    postings.forEach(function(posting) {
      var organization = posting.hiringOrganization || posting.sourceOrganization || {};
      var rawUrl = typeof posting.url === 'string'
        ? posting.url
        : typeof posting.mainEntityOfPage === 'string'
          ? posting.mainEntityOfPage
          : posting.mainEntityOfPage && posting.mainEntityOfPage['@id'];
      if (!rawUrl && postings.length === 1) rawUrl = currentLocation.href;

      var jobUrl;
      try {
        jobUrl = new URL(rawUrl, currentLocation.href);
      } catch (error) {
        return;
      }
      if (jobUrl.protocol !== 'https:' || jobUrl.username || jobUrl.password || jobUrl.href.length > 2048) return;

      var employmentTypes = Array.isArray(posting.employmentType) ? posting.employmentType.join(', ') : posting.employmentType;
      var workMode = String(posting.jobLocationType || '').toUpperCase() === 'TELECOMMUTE' ? 'remote' : 'onsite';
      var title = cleanText(posting.title, 180);
      var company = cleanText(organization.name, 160);
      if (!title || !company) return;

      jobUrl.hash = '';
      unique.set(jobUrl.href, {
        title: title,
        company: company,
        url: jobUrl.href,
        location: cleanText(getAddress(posting.jobLocation), 120),
        workMode: workMode,
        employmentType: cleanText(employmentTypes, 80),
        description: String(posting.description || '').slice(0, 300),
        publishedAt: typeof posting.datePosted === 'string' ? posting.datePosted : '',
        extraction: 'structured'
      });
    });

    var extractionMethod = unique.size ? 'structured' : '';
    var cardSelectors = [
      '[data-automation="jobListing"]',
      '[data-automation="normalJob"]',
      '[data-automation="job-card"]',
      '[data-testid*="job-card"]',
      'article[data-testid*="job"]',
      'article[data-automation*="job"]'
    ];
    var cardSet = new Set();
    cardSelectors.forEach(function(selector) {
      queryAll(selector).forEach(function(card) {
        if (isVisible(card)) cardSet.add(card);
      });
    });

    var jobLinks = queryAll('a[href*="/job/"], a[href*="/job-"], a[data-automation*="jobTitle"], a[data-testid*="job-title"]');
    jobLinks.forEach(function(link) {
      if (!isVisible(link)) return;
      var parent = link.parentElement;
      for (var depth = 0; parent && depth < 7; depth += 1, parent = parent.parentElement) {
        var textLength = cleanText(parent.innerText || parent.textContent, 10000).length;
        if (textLength >= 35 && textLength <= 5000 && queryAll('a[href*="/job/"], a[href*="/job-"], a[data-automation*="jobTitle"], a[data-testid*="job-title"]', parent).length <= 3) {
          cardSet.add(parent);
          break;
        }
      }
    });

    cardSet.forEach(function(card) {
      var links = queryAll('a[href*="/job/"], a[href*="/job-"], a[data-automation*="jobTitle"], a[data-testid*="job-title"]', card)
        .filter(isVisible);
      if (!links.length && card.matches && card.matches('a[href]')) links = [card];
      var link = links.find(function(candidate) {
        return cleanText(candidate.innerText || candidate.textContent, 180).length > 2;
      });
      if (!link) return;

      var jobUrl;
      try {
        jobUrl = new URL(link.href || link.getAttribute('href'), currentLocation.href);
      } catch (error) {
        return;
      }
      if (jobUrl.protocol !== 'https:' || jobUrl.origin !== currentLocation.origin || jobUrl.username || jobUrl.password || jobUrl.href.length > 2048) return;

      var title = visibleText([
        '[data-automation="jobTitle"]',
        '[data-testid="job-title"]',
        '[data-testid*="job-title"]',
        '[itemprop="title"]',
        'h2',
        'h3'
      ], card, 180) || cleanText(link.innerText || link.textContent, 180);
      var company = visibleText([
        '[data-automation="jobCompany"]',
        '[data-automation="advertiser-name"]',
        '[data-automation="job-company"]',
        '[data-testid="company-name"]',
        '[data-testid*="company"]',
        '[itemprop="hiringOrganization"]',
        'a[href*="/companies/"]',
        'a[href*="/company/"]'
      ], card, 160);
      var locationText = visibleText([
        '[data-automation="jobLocation"]',
        '[data-automation="job-detail-location"]',
        '[data-testid="job-location"]',
        '[data-testid*="location"]',
        '[itemprop="jobLocation"]',
        '[class*="job-location"]'
      ], card, 120);
      var description = visibleText([
        '[data-automation="jobShortDescription"]',
        '[data-automation="job-description"]',
        '[data-testid="job-description"]',
        '[data-testid*="description"]',
        '[itemprop="description"]'
      ], card, 600);

      if (!title) return;
      company = company || 'Perusahaan tidak dicantumkan';
      jobUrl.hash = '';
      if (!unique.has(jobUrl.href)) {
        unique.set(jobUrl.href, {
          title: title,
          company: company,
          url: jobUrl.href,
          location: locationText,
          workMode: /\bremote\b/i.test(locationText) ? 'remote' : 'onsite',
          employmentType: '',
          description: description.slice(0, 300),
          publishedAt: '',
          extraction: 'visible-card'
        });
        extractionMethod = 'visible-cards';
      }
    });

    if (!unique.size) {
      var title = visibleText([
        '[data-automation="jobTitle"]',
        '[data-automation="job-detail-title"]',
        '[data-testid="job-title"]',
        '[data-testid*="job-title"]',
        '[itemprop="title"]',
        'main h1',
        'article h1',
        'h1'
      ], page, 180);
      var company = visibleText([
        '[data-automation="advertiser-name"]',
        '[data-automation="job-company"]',
        '[data-testid="company-name"]',
        '[data-testid*="company"]',
        '[itemprop="hiringOrganization"]',
        'a[href*="/companies/"]',
        'a[href*="/company/"]'
      ], page, 160);
      var locationText = visibleText([
        '[data-automation="job-detail-location"]',
        '[data-testid="job-location"]',
        '[itemprop="jobLocation"]',
        '[class*="job-location"]'
      ], page, 120);
      var description = visibleText([
        '[data-automation="jobAdDetails"]',
        '[data-automation="job-description"]',
        '[data-testid="job-description"]',
        '[data-testid*="description"]',
        '[itemprop="description"]',
        'article',
        'main'
      ], page, 3000);
      var isDetailPage = /\/job(?:\/|$|[?#])/i.test(currentLocation.pathname);

      if (title && company && (isDetailPage || queryAll('h1').length === 1)) {
        var pageUrl = new URL(currentLocation.href);
        pageUrl.hash = '';
        unique.set(pageUrl.href, {
          title: title,
          company: company,
          url: pageUrl.href,
          location: locationText,
          workMode: /\bremote\b/i.test(locationText) ? 'remote' : 'onsite',
          employmentType: '',
          description: description,
          publishedAt: '',
          extraction: 'visible-page'
        });
        extractionMethod = 'visible-page';
      }
    }

    return {
      jobs: Array.from(unique.values()).slice(0, 50),
      malformedBlocks: malformedBlocks,
      extractionMethod: extractionMethod
    };

    function getAddress(locationValue) {
      var places = Array.isArray(locationValue) ? locationValue : [locationValue];
      return places.map(function(place) {
        var address = place && place.address;
        if (typeof address === 'string') return address;
        if (!address || typeof address !== 'object') return '';
        return [address.addressLocality, address.addressRegion, address.addressCountry && (address.addressCountry.name || address.addressCountry)]
          .filter(function(part) { return typeof part === 'string'; })
          .join(', ');
      }).filter(Boolean).join(' · ');
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = extractJobPostingsFromPage;
  root.applierJobesExtractJobPostings = extractJobPostingsFromPage;
})(globalThis);
