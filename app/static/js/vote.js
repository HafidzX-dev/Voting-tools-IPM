var kuota = 0;
var totalKandidat = 0;
var dipilih = [];

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function refreshInfo() {
  var jml = dipilih.length;
  var infoEl = document.getElementById('info-kuota');
  var btn = document.getElementById('btn-submit');

  if (infoEl) {
    if (jml < kuota) {
      infoEl.textContent = 'Wajib memilih ' + kuota + ' kandidat. Tersisa ' + (kuota - jml) + ' pilihan.';
      infoEl.className = 'muted';
    } else {
      infoEl.textContent = 'Pilihan sudah lengkap. Klik Submit untuk melanjutkan.';
      infoEl.className = 'muted info-ok';
    }
  }

  if (btn) {
    btn.disabled = (jml < kuota);
  }
}

fetch('/api/kandidat').then(function (r) { return r.json(); }).then(function (d) {
  if (!d.ok) { location.href = '/'; return; }
  kuota = d.kuota;
  totalKandidat = d.kandidat.length;
  var daftar = document.getElementById('daftar');

  d.kandidat.forEach(function (k) {
    var el = document.createElement('div');
    el.className = 'kandidat';
    el.setAttribute('role', 'checkbox');
    el.setAttribute('aria-checked', 'false');
    el.setAttribute('tabindex', '0');

    var nomorEl = document.createElement('div');
    nomorEl.className = 'kandidat-nomor';
    nomorEl.textContent = k.urutan != null ? k.urutan : '';

    var checkEl = document.createElement('div');
    checkEl.className = 'kandidat-check';
    checkEl.setAttribute('aria-hidden', 'true');
    checkEl.style.display = 'none';
    checkEl.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="20 6 9 17 4 12"></polyline>' +
      '</svg>';

    var imgEl = document.createElement('img');
    imgEl.src = k.foto || '/static/assets/logo.png?v=3';
    imgEl.alt = '';

    var namaEl = document.createElement('div');
    namaEl.className = 'nama';
    namaEl.textContent = k.nama;

    el.appendChild(nomorEl);
    el.appendChild(checkEl);
    el.appendChild(imgEl);
    el.appendChild(namaEl);

    if (k.asal_pimpinan) {
      var asalEl = document.createElement('div');
      asalEl.className = 'muted';
      asalEl.style.fontSize = '12px';
      asalEl.style.marginTop = '2px';
      asalEl.textContent = k.asal_pimpinan;
      el.appendChild(asalEl);
    }

    el.onclick = function () {
      var idx = dipilih.indexOf(k.id);
      if (idx >= 0) {
        // batalkan pilihan
        dipilih.splice(idx, 1);
        el.classList.remove('dipilih');
        el.setAttribute('aria-checked', 'false');
        checkEl.style.display = 'none';
      } else {
        // tambah pilihan (bisa sampai semua kandidat)
        dipilih.push(k.id);
        el.classList.add('dipilih');
        el.setAttribute('aria-checked', 'true');
        checkEl.style.display = 'flex';
      }
      refreshInfo();
    };
    el.onkeydown = function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); }
    };
    daftar.appendChild(el);
  });

  refreshInfo();
});

document.getElementById('btn-submit').addEventListener('click', function () {
  var pesan = document.getElementById('pesan');
  pesan.textContent = '';
  var golput = dipilih.length > kuota;
  fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kandidat_ids: dipilih, golput: golput })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.ok) {
      location.href = '/static/thanks.html';
    } else {
      pesan.textContent = d.msg || 'Gagal menyimpan suara.';
    }
  }).catch(function () {
    pesan.textContent = 'Terjadi kesalahan jaringan.';
  });
});
