(function() {
  var region = document.getElementById('toastRegion');
  if (!region) return;

  function dismissToast(toast) {
    if (toast && toast.parentNode) toast.remove();
  }

  function showToast(message, state, persistent) {
    var toast = document.createElement('div');
    var icon = document.createElement('span');
    var iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    var content = document.createElement('div');
    var title = document.createElement('strong');
    var description = document.createElement('span');
    var closeButton = document.createElement('button');
    var isError = state === 'error';
    var isSuccess = state === 'success';
    var isWarning = state === 'warning';
    var isProcessing = state === 'info' && /^(Sedang|Menyiapkan)/i.test(message);
    var titleText = isSuccess ? 'Berhasil' : isError ? 'Terjadi kesalahan' : isWarning ? 'Perlu diperhatikan' : isProcessing ? 'Sedang diproses' : 'Informasi';

    toast.className = 'toast toast-' + (state || 'info');
    toast.setAttribute('role', isError ? 'alert' : 'status');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    iconSvg.setAttribute('viewBox', '0 0 20 20');
    icon.appendChild(iconSvg);
    iconPath.setAttribute('d', isSuccess
      ? 'm5.5 10.2 2.9 2.9 6.1-6.2'
      : isError
        ? 'm6.5 6.5 7 7m0-7-7 7'
        : isWarning
          ? 'M10 5.5v5m0 3h.01'
          : 'M10 8.5v4m0-7h.01');
    iconSvg.appendChild(iconPath);
    content.className = 'toast-message';
    title.className = 'toast-title';
    title.textContent = titleText;
    description.className = 'toast-description';
    description.textContent = message;
    closeButton.className = 'toast-dismiss';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Tutup pemberitahuan');
    var closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    closeSvg.setAttribute('viewBox', '0 0 20 20');
    closeSvg.setAttribute('aria-hidden', 'true');
    closePath.setAttribute('d', 'm5 5 10 10M15 5 5 15');
    closeSvg.appendChild(closePath);
    closeButton.appendChild(closeSvg);
    closeButton.addEventListener('click', function() { dismissToast(toast); });
    content.appendChild(title);
    content.appendChild(description);
    toast.appendChild(icon);
    toast.appendChild(content);
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
