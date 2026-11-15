(function() {
  var region = document.getElementById('toastRegion');
  if (!region) return;

  function dismissToast(toast) {
    if (toast && toast.parentNode) toast.remove();
  }

  function showToast(message, state, persistent) {
    var toast = document.createElement('div');
    var text = document.createElement('span');
    var closeButton = document.createElement('button');
    var isError = state === 'error';

    toast.className = 'toast toast-' + (state || 'info');
    toast.setAttribute('role', isError ? 'alert' : 'status');
    text.className = 'toast-message';
    text.textContent = message;
    closeButton.className = 'toast-dismiss';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Tutup pemberitahuan');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', function() { dismissToast(toast); });
    toast.appendChild(text);
    toast.appendChild(closeButton);
    region.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    region.appendChild(toast);

    if (!persistent) {
      var timeout = isError ? 8000 : 5000;
      var timer = window.setTimeout(function() { dismissToast(toast); }, timeout);
      toast.addEventListener('mouseenter', function() { window.clearTimeout(timer); });
      toast.addEventListener('mouseleave', function() {
        timer = window.setTimeout(function() { dismissToast(toast); }, timeout);
      });
      toast.addEventListener('focusin', function() { window.clearTimeout(timer); });
      toast.addEventListener('focusout', function() {
        timer = window.setTimeout(function() { dismissToast(toast); }, timeout);
      });
    }

    return toast;
  }

  window.applierToast = showToast;

  region.querySelectorAll('[data-toast]').forEach(function(toast) {
    var closeButton = toast.querySelector('.toast-dismiss');
    if (closeButton) closeButton.addEventListener('click', function() { dismissToast(toast); });
    var timeout = toast.classList.contains('toast-error') ? 8000 : 5000;
    var timer = window.setTimeout(function() { dismissToast(toast); }, timeout);
    toast.addEventListener('mouseenter', function() { window.clearTimeout(timer); });
    toast.addEventListener('mouseleave', function() {
      timer = window.setTimeout(function() { dismissToast(toast); }, timeout);
    });
    toast.addEventListener('focusin', function() { window.clearTimeout(timer); });
    toast.addEventListener('focusout', function() {
      timer = window.setTimeout(function() { dismissToast(toast); }, timeout);
    });
  });

  document.addEventListener('submit', function(event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'post') return;
    if (form.dataset.feedbackSubmitting === 'true') {
      event.preventDefault();
      return;
    }

    form.dataset.feedbackSubmitting = 'true';
    form.classList.add('is-submitting');
    form.setAttribute('aria-busy', 'true');
    var submitter = event.submitter;
    var action = form.getAttribute('action') || '';
    var message = 'Sedang menyimpan perubahan…';
    if (/\/jobs\/browser-import$/.test(action)) message = 'Sedang mengimpor lowongan…';
    else if (/\/automation\/jobs\/\d+\/draft$/.test(action)) message = 'Menyiapkan draft lamaran…';
    else if (/\/profile\/cv$/.test(action)) message = 'Sedang mengunggah CV…';
    else if (/\/logout$/.test(action)) message = 'Sedang keluar dari akun…';
    else if (submitter && submitter.textContent.trim()) message = 'Memproses: ' + submitter.textContent.trim();
    showToast(message, 'info', true);
  });
})();
