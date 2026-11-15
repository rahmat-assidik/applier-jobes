(function() {
  document.addEventListener('submit', function(event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || form.action !== window.location.origin + '/login') return;

    if (form.dataset.submitting === 'true') {
      event.preventDefault();
      return;
    }

    var button = form.querySelector('button[type="submit"]');
    var label = button && button.querySelector('.auth-submit-label');
    var spinner = button && button.querySelector('.auth-submit-spinner');
    if (!button || !label || !spinner) return;

    form.dataset.submitting = 'true';
    form.setAttribute('aria-busy', 'true');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    label.textContent = 'Memproses...';
    spinner.hidden = false;
  });
})();
