(function() {
  var app = document.getElementById('browserImportApp');
  if (!app) return;

  var message = document.getElementById('browserImportMessage');
  var list = document.getElementById('browserImportList');
  var submit = document.getElementById('browserImportSubmit');
  var csrfToken = app.dataset.csrf;
  var jobs = [];

  function setMessage(text, state) {
    message.textContent = text;
    message.className = 'browser-import-message' + (state ? ' browser-import-message-' + state : '');
  }

  function notify(text, state, persistent) {
    if (typeof window.applierToast === 'function') window.applierToast(text, state, persistent);
  }

  function addText(parent, tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function renderJobs() {
    list.replaceChildren();
    jobs.forEach(function(job, index) {
      var item = document.createElement('li');
      item.className = 'browser-import-item';

      var label = document.createElement('label');
      label.className = 'browser-import-choice';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.value = String(index);
      var details = document.createElement('span');
      details.className = 'browser-import-details';
      addText(details, 'strong', '', job.title);
      addText(details, 'span', 'browser-import-company', job.company + ' · ' + (job.location || 'Lokasi tidak dicantumkan'));
      addText(details, 'span', 'browser-import-description', (job.description || 'Deskripsi tidak tersedia.').slice(0, 360));
      label.appendChild(checkbox);
      label.appendChild(details);
      item.appendChild(label);
      list.appendChild(item);
    });
    updateSelectionState();
  }

  function updateSelectionState() {
    var selectedCount = list.querySelectorAll('input[type="checkbox"]:checked').length;
    submit.disabled = selectedCount === 0;
    submit.textContent = selectedCount ? 'Impor ' + selectedCount + ' dari ' + jobs.length + ' lowongan' : 'Pilih lowongan untuk diimpor';
  }

  function readPayload() {
    if (!location.hash.startsWith('#jobs=') || location.hash.length > 800000) {
      setMessage('Data tidak ditemukan. Kembali ke ekstensi dan pindai halaman karier publik yang menyediakan data JobPosting.', 'error');
      return;
    }

    try {
      var parsed = JSON.parse(decodeURIComponent(location.hash.slice(6)));
      if (!parsed || !Array.isArray(parsed.jobs)) throw new Error('Format data tidak sesuai.');
      if (parsed.jobs.length > 50) throw new Error('Maksimal 50 lowongan dapat diimpor sekaligus.');
      jobs = parsed.jobs.filter(function(job) {
        return job && typeof job.title === 'string' && typeof job.company === 'string' && typeof job.url === 'string';
      });
      if (!jobs.length) throw new Error('Tidak ada lowongan yang dapat ditampilkan.');
      setMessage(jobs.length + ' lowongan ditemukan. Periksa detail dan pilih yang ingin disimpan; data hanya diproses setelah konfirmasi.', 'success');
      notify(jobs.length + ' lowongan siap ditinjau sebelum diimpor.', 'success');
      renderJobs();
      history.replaceState(null, '', location.pathname + location.search);
    } catch (error) {
      setMessage(error.message || 'Data impor tidak valid. Pindai halaman kembali dari ekstensi.', 'error');
    }
  }

  submit.addEventListener('click', async function() {
    var selected = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map(function(checkbox) {
      return jobs[Number(checkbox.value)];
    }).filter(Boolean);

    if (!selected.length) {
      setMessage('Pilih setidaknya satu lowongan untuk diimpor.', 'error');
      return;
    }

    submit.disabled = true;
    setMessage('Menyimpan lowongan yang dipilih…');
    notify('Sedang mengimpor ' + selected.length + ' lowongan…', 'info', true);
    try {
      var response = await fetch('/jobs/browser-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _csrf: csrfToken, jobs: selected })
      });
      var contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Respons server tidak valid. Muat ulang halaman impor lalu coba lagi.');
      }
      var result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Lowongan tidak dapat disimpan (HTTP ' + response.status + ').');
      if (!Number.isInteger(result.imported) || result.imported !== selected.length) {
        throw new Error('Server belum mengonfirmasi penyimpanan semua lowongan. Periksa halaman Cari Lowongan sebelum mencoba kembali.');
      }
      list.replaceChildren();
      submit.hidden = true;
      var successMessage = result.imported + ' lowongan berhasil ditambahkan atau diperbarui.';
      setMessage(successMessage, 'success');
      notify(successMessage, 'success');
    } catch (error) {
      var errorMessage = error.message || 'Terjadi kesalahan saat menyimpan. Coba lagi.';
      setMessage(errorMessage, 'error');
      notify(errorMessage, 'error');
      submit.disabled = false;
    }
  });

  list.addEventListener('change', updateSelectionState);
  readPayload();
})();
