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
    if (kuota > 0 && jml < kuota) {
      infoEl.textContent = 'Memilih ' + kuota + ' kandidat';
      infoEl.className = 'muted';
    } else if (kuota > 0) {
    }
  }

  if (btn) {
    if (kuota > 0 && jml >= kuota) {
      btn.style.display = 'inline-flex';
    } else {
      btn.style.display = 'none';
    }
  }
}

fetch('/api/kandidat').then(function (r) { return r.json(); }).then(function (d) {
  if (!d.ok) { location.href = '/'; return; }
  kuota = d.kuota;
  totalKandidat = d.kandidat.length;

  if (d.pemilih) {
    var namaEl = document.getElementById('voter-nama');
    var asalEl = document.getElementById('voter-asal');
    if (namaEl) { namaEl.textContent = d.pemilih.nama || ''; }
    if (asalEl) { asalEl.textContent = d.pemilih.asal_wilayah || ''; }
  }

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

var modalPernyataan = document.getElementById('modal-pernyataan');
var checkPernyataan = document.getElementById('check-pernyataan');
var btnFinalSubmit = document.getElementById('btn-final-submit');
var modalPesan = document.getElementById('modal-pesan');
var btnBatalModal = document.getElementById('btn-batal-modal');

document.getElementById('btn-submit').addEventListener('click', function () {
  if (dipilih.length < kuota) return;
  checkPernyataan.checked = false;
  btnFinalSubmit.style.display = 'none';
  btnFinalSubmit.disabled = false;
  btnFinalSubmit.textContent = 'Submit';
  modalPesan.textContent = '';
  modalPernyataan.classList.add('show');
});

checkPernyataan.addEventListener('change', function () {
  if (this.checked) {
    btnFinalSubmit.style.display = 'inline-flex';
  } else {
    btnFinalSubmit.style.display = 'none';
  }
});

if (btnBatalModal) {
  btnBatalModal.addEventListener('click', function () {
    modalPernyataan.classList.remove('show');
  });
}

modalPernyataan.addEventListener('click', function (e) {
  if (e.target === modalPernyataan) {
    modalPernyataan.classList.remove('show');
  }
});

btnFinalSubmit.addEventListener('click', function () {
  if (!checkPernyataan.checked) return;
  modalPesan.textContent = '';
  btnFinalSubmit.disabled = true;
  btnFinalSubmit.textContent = 'Menyimpan...';

  var golput = dipilih.length > kuota;
  fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kandidat_ids: dipilih, golput: golput })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.ok) {
      location.href = '/static/thanks.html';
    } else {
      btnFinalSubmit.disabled = false;
      btnFinalSubmit.textContent = 'Submit';
      modalPesan.textContent = d.msg || 'Gagal menyimpan suara.';
    }
  }).catch(function () {
    btnFinalSubmit.disabled = false;
    btnFinalSubmit.textContent = 'Submit';
    modalPesan.textContent = 'Terjadi kesalahan jaringan.';
  });
});
