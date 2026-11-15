(() => {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const menuButton = document.getElementById('mobileMenu');
  const closeButton = document.getElementById('mobileNavClose');
  const backdrop = document.getElementById('sidebarBackdrop');
  const searchForm = document.querySelector('.global-search');
  const searchInput = searchForm && searchForm.querySelector('input');
  const mobileViewport = window.matchMedia('(max-width: 900px)');

  if (!sidebar || !mainContent || !menuButton || !closeButton || !backdrop) return;

  function setOpen(open, returnFocus = true) {
    const shouldOpen = mobileViewport.matches && open;
    sidebar.classList.toggle('is-open', shouldOpen);
    backdrop.classList.toggle('is-visible', shouldOpen);
    menuButton.setAttribute('aria-expanded', String(shouldOpen));
    sidebar.inert = mobileViewport.matches && !shouldOpen;
    mainContent.inert = shouldOpen;
    document.body.classList.toggle('navigation-open', shouldOpen);

    if (shouldOpen) closeButton.focus();
    else if (returnFocus && mobileViewport.matches) menuButton.focus();
  }

  menuButton.addEventListener('click', () => {
    setOpen(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  closeButton.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  if (searchForm && searchInput) {
    searchForm.addEventListener('click', () => {
      if (!window.matchMedia('(max-width: 600px)').matches) return;
      searchForm.classList.add('search-expanded');
      searchInput.focus();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
    }
    if (event.key === 'Escape' && searchForm) {
      searchForm.classList.remove('search-expanded');
      if (searchInput) searchInput.blur();
    }

    if (event.key !== 'Tab' || menuButton.getAttribute('aria-expanded') !== 'true') return;
    const focusableItems = Array.from(sidebar.querySelectorAll('a[href], button:not([disabled])'));
    const firstItem = focusableItems[0];
    const lastItem = focusableItems[focusableItems.length - 1];
    if (event.shiftKey && document.activeElement === firstItem) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      firstItem.focus();
    }
  });

  mobileViewport.addEventListener('change', () => setOpen(false, false));
  setOpen(false, false);
})();
