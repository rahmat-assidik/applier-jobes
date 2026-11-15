var browserApi = globalThis.browser || globalThis.chrome;
var originInput = document.getElementById('appOrigin');
var saveOriginButton = document.getElementById('saveOrigin');
var scanButton = document.getElementById('scanPage');
var sendButton = document.getElementById('sendJobs');
var statusMessage = document.getElementById('status');
var resultsList = document.getElementById('results');
var foundJobs = [];

function setStatus(text, state) {
  statusMessage.textContent = text;
  statusMessage.className = 'status' + (state ? ' status-' + state : '');
}

function normalizeAppOrigin(value) {
  var url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('Masukkan alamat aplikasi yang valid.');
  }
  var localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !localHost) || url.username || url.password) {
    throw new Error('Gunakan HTTPS, atau HTTP hanya untuk localhost.');
  }
  return url.origin;
}

function renderResults() {
  resultsList.replaceChildren();
  foundJobs.forEach(function(job, index) {
    var item = document.createElement('li');
    item.className = 'result';
    var label = document.createElement('label');
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.value = String(index);
    var details = document.createElement('span');
    var title = document.createElement('strong');
    title.textContent = job.title;
    var company = document.createElement('span');
    company.textContent = job.company + (job.location ? ' · ' + job.location : '');
    details.appendChild(title);
    details.appendChild(company);
    label.appendChild(checkbox);
    label.appendChild(details);
    item.appendChild(label);
    resultsList.appendChild(item);
  });
  updateSelectionState();
}

function updateSelectionState() {
  var selectedCount = resultsList.querySelectorAll('input[type="checkbox"]:checked').length;
  sendButton.disabled = selectedCount === 0 || selectedCount > 50;
  sendButton.textContent = selectedCount > 50 ? 'Maksimal 50 lowongan per impor' : 'Tinjau dan impor ' + selectedCount + ' lowongan';
}

async function loadSettings() {
  var settings = await browserApi.storage.local.get({ appOrigin: 'http://localhost:3000' });
  originInput.value = settings.appOrigin;
}

saveOriginButton.addEventListener('click', async function() {
  try {
    var appOrigin = normalizeAppOrigin(originInput.value.trim());
    await browserApi.storage.local.set({ appOrigin: appOrigin });
    originInput.value = appOrigin;
    setStatus('Alamat aplikasi disimpan.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

scanButton.addEventListener('click', async function() {
  scanButton.disabled = true;
  sendButton.disabled = true;
  setStatus('Memindai metadata dan kartu lowongan pada halaman aktif…');
  try {
    var tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab || !Number.isInteger(tab.id) || !/^https:\/\//i.test(tab.url || '')) {
      throw new Error('Buka halaman karier publik menggunakan HTTPS terlebih dahulu.');
    }

    var results = await browserApi.scripting.executeScript({
      target: { tabId: tab.id },
      func: globalThis.applierJobesExtractJobPostings
    });
    var scanResult = results[0] && results[0].result;
    foundJobs = scanResult && Array.isArray(scanResult.jobs) ? scanResult.jobs : [];
    renderResults();
    if (foundJobs.length) {
      var skippedMessage = scanResult.malformedBlocks ? ' ' + scanResult.malformedBlocks + ' blok metadata tidak valid dilewati.' : '';
      setStatus(foundJobs.length + ' lowongan ditemukan pada halaman aktif. Pilih yang ingin ditinjau.' + skippedMessage, 'success');
    } else {
      setStatus('Kartu lowongan belum dapat dikenali. Terapkan filter dan pastikan hasil sudah tampil, lalu pindai lagi. Beberapa situs mungkin memakai struktur yang belum didukung.', 'error');
    }
  } catch (error) {
    setStatus(error.message || 'Halaman ini tidak dapat dipindai.', 'error');
  } finally {
    scanButton.disabled = false;
  }
});

resultsList.addEventListener('change', updateSelectionState);

sendButton.addEventListener('click', async function() {
  try {
    var appOrigin = normalizeAppOrigin(originInput.value.trim());
    var checkedJobs = Array.from(resultsList.querySelectorAll('input[type="checkbox"]:checked'));
    if (checkedJobs.length > 50) throw new Error('Maksimal 50 lowongan dapat dikirim sekaligus.');
    var selectedJobs = checkedJobs
      .map(function(checkbox) { return foundJobs[Number(checkbox.value)]; })
      .filter(Boolean);
    if (!selectedJobs.length) throw new Error('Pilih setidaknya satu lowongan.');
    var activeTabs = await browserApi.tabs.query({ active: true, currentWindow: true });
    var activeTabUrl = activeTabs[0] && activeTabs[0].url;
    if (activeTabUrl && new URL(activeTabUrl).origin === appOrigin) {
      throw new Error('Alamat aplikasi mengarah ke halaman lowongan yang sedang dibuka. Masukkan alamat Applier Jobes (misalnya http://localhost:3000), lalu tekan Simpan.');
    }
    await browserApi.storage.local.set({ appOrigin: appOrigin });
    var target = new URL('/jobs/browser-import', appOrigin);
    target.hash = 'jobs=' + encodeURIComponent(JSON.stringify({ jobs: selectedJobs }));
    await browserApi.tabs.create({ url: target.href });
  } catch (error) {
    setStatus(error.message || 'Tidak dapat membuka aplikasi.', 'error');
  }
});

loadSettings().catch(function(error) {
  setStatus(error.message || 'Pengaturan ekstensi tidak dapat dimuat.', 'error');
});
