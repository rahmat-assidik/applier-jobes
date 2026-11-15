(function() {
  var message = document.getElementById('browserImportLoginMessage');
  var hash = location.hash;
  if (!hash.startsWith('#jobs=') || hash.length > 800000) {
    message.textContent = 'Data impor tidak ditemukan atau terlalu besar. Kembali ke ekstensi dan pilih ulang lowongan.';
    return;
  }

  sessionStorage.setItem('applierJobesBrowserImport', hash);
  location.replace('/login');
})();
