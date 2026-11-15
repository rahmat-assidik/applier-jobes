function createPagination(options) {
  var totalItems = Math.max(0, Number(options.totalItems) || 0);
  var pageSize = Math.max(1, Number(options.pageSize) || 10);
  var totalPages = Math.ceil(totalItems / pageSize);
  var requestedPage = Number(options.requestedPage);
  var page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  if (totalPages > 0) page = Math.min(page, totalPages);
  else page = 1;

  function pageUrl(pageNumber) {
    var params = new URLSearchParams();
    Object.keys(options.query || {}).forEach(function(key) {
      var value = options.query[key];
      if (typeof value === 'string' && value) params.set(key, value);
    });
    params.set(options.pageParam, String(pageNumber));
    return options.pathname + '?' + params.toString();
  }

  var firstVisiblePage = Math.max(1, page - 2);
  var lastVisiblePage = Math.min(totalPages, page + 2);
  var pages = [];
  for (var pageNumber = firstVisiblePage; pageNumber <= lastVisiblePage; pageNumber += 1) {
    pages.push({ number: pageNumber, url: pageUrl(pageNumber), current: pageNumber === page });
  }

  return {
    page: page,
    pageSize: pageSize,
    offset: (page - 1) * pageSize,
    totalItems: totalItems,
    totalPages: totalPages,
    startItem: totalItems ? (page - 1) * pageSize + 1 : 0,
    endItem: Math.min(page * pageSize, totalItems),
    pages: pages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
    previousUrl: pageUrl(Math.max(1, page - 1)),
    nextUrl: pageUrl(Math.min(totalPages || 1, page + 1)),
    firstUrl: pageUrl(1),
    lastUrl: pageUrl(Math.max(totalPages, 1)),
    showLeadingEllipsis: firstVisiblePage > 2,
    showFirstPage: firstVisiblePage > 1,
    showLastPage: lastVisiblePage < totalPages,
    showTrailingEllipsis: lastVisiblePage < totalPages - 1
  };
}

module.exports = createPagination;
