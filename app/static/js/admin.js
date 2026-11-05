var wilayahList = [];
var vouchersSaatIni = [];
var timerHasil = null;
var toastTimer = null;

function tampilkanPopup(pesan, tipe) {
  var el = document.getElementById('toast-popup');
  if (!el) return;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  el.className = 'toast-popup ' + (tipe === 'error' ? 'toast-error' : 'toast-success');
  el.textContent = pesan;
  el.classList.add('show');
  toastTimer = setTimeout(function () {
    el.classList.remove('show');
  }, 2000);
}

function getAdminToken() {
  return localStorage.getItem('admin_token') || '';
}

function api(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  var token = getAdminToken();
  if (token) {
    opts.headers['Authorization'] = 'Bearer ' + token;
    opts.headers['X-Admin-Token'] = token;
  }
  return fetch(url, opts).then(function (r) {
    if (r.status === 401) {
      localStorage.removeItem('admin_token');
      tampilkanLogin();
      throw new Error('unauthorized');
    }
    return r.json();
  });
}

function post(url, obj) {
  var headers = { 'Content-Type': 'application/json' };
  var token = getAdminToken();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
    headers['X-Admin-Token'] = token;
  }
  return api(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(obj)
  });
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = (s == null) ? '' : String(s);
  return d.innerHTML;
}

function tampilkanLogin() {
  document.getElementById('login-wrap').style.display = 'flex';
  document.getElementById('app-wrap').style.display = 'none';
}

function tampilkanApp() {
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('app-wrap').style.display = 'block';
  muatSemua();
}


// Autentikasi Admin

document.getElementById('form-admin-login').addEventListener('submit', function (e) {
  e.preventDefault();
  var u = document.getElementById('a-username').value.trim();
  var p = document.getElementById('a-password').value;

  post('/admin/api/login', { username: u, password: p }).then(function (d) {
    if (d.ok) {
      if (d.token) {
        localStorage.setItem('admin_token', d.token);
      }
      tampilkanApp();
      tampilkanPopup('Login berhasil.', 'success');
    } else {
      tampilkanPopup(d.msg || 'Username atau password salah.', 'error');
    }
  }).catch(function () {
    tampilkanPopup('Gagal terhubung ke server.', 'error');
  });
});

document.getElementById('btn-keluar').addEventListener('click', function () {
  if (confirm('Apakah Anda yakin ingin keluar?')) {
    post('/admin/api/logout', {}).then(function () {
      localStorage.removeItem('admin_token');
      tampilkanLogin();
      tampilkanPopup('Berhasil keluar.', 'success');
    });
  }
});


// Navigasi Tab

document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'hasil') { muatHasil(); }
    if (btn.dataset.tab === 'voucher') {
      muatVoucher(getSelectedWilayahFilter());
      muatKuotaGlobal();
    }
    if (btn.dataset.tab === 'kandidat') { muatKandidat(); }
    if (btn.dataset.tab === 'wilayah') { muatWilayah(); }
    if (btn.dataset.tab === 'log') { muatLog(); }
  });
});


// Manajemen Wilayah

function muatWilayah() {
  return api('/admin/api/wilayah').then(function (rows) {
    wilayahList = rows;
    var tbody = document.querySelector('#tbl-wilayah tbody');
    tbody.innerHTML = '';

    rows.forEach(function (w) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + esc(w.kode_pos) + '</strong></td>' +
        '<td>' + esc(w.nama) + '</td>' +
        '<td>' + w.total + '</td>' +
        '<td>' + w.terpakai + '</td>' +
        '<td><button class="danger btn-sm" data-action="hapus-wilayah" data-id="' + w.id + '" data-nama="' + esc(w.nama) + '">Hapus</button></td>';
      tbody.appendChild(tr);
    });

    // Dropdown wilayah di form tambah voucher (kode pos + nama)
    var selTambah = document.getElementById('v-wilayah');
    var curTambahVal = selTambah.value;
    selTambah.innerHTML = '';
    rows.forEach(function (w) {
      var opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = w.kode_pos + ' - ' + w.nama;
      selTambah.appendChild(opt);
    });
    if (curTambahVal && rows.some(function (w) { return String(w.id) === curTambahVal; })) {
      selTambah.value = curTambahVal;
    }

    // Dropdown filter wilayah di tabel voucher
    var selFilter = document.getElementById('filter-wilayah');
    var curFilterVal = selFilter.value;
    selFilter.innerHTML = '<option value="0">Semua Wilayah</option>';
    rows.forEach(function (w) {
      var opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = w.kode_pos + ' - ' + w.nama;
      selFilter.appendChild(opt);
    });
    if (curFilterVal && (curFilterVal === '0' || rows.some(function (w) { return String(w.id) === curFilterVal; }))) {
      selFilter.value = curFilterVal;
    }

    // Dropdown asal pimpinan di form kandidat (HANYA NAMA, TANPA KODE POS)
    var selKandidatAsal = document.getElementById('k-asal');
    if (selKandidatAsal) {
      var curKandidatAsalVal = selKandidatAsal.value;
      selKandidatAsal.innerHTML = '<option value="">-- Pilih Asal Pimpinan --</option>';
      rows.forEach(function (w) {
        var opt = document.createElement('option');
        opt.value = w.nama;
        opt.textContent = w.nama;
        selKandidatAsal.appendChild(opt);
      });
      if (curKandidatAsalVal) {
        selKandidatAsal.value = curKandidatAsalVal;
      }
    }

    // Dropdown asal pimpinan di modal edit kandidat
    var selEditAsal = document.getElementById('edit-k-asal');
    if (selEditAsal) {
      var curEditAsalVal = selEditAsal.value;
      selEditAsal.innerHTML = '<option value=""> -Pilih Asal Pimpinan- </option>';
      rows.forEach(function (w) {
        var opt = document.createElement('option');
        opt.value = w.nama;
        opt.textContent = w.nama;
        selEditAsal.appendChild(opt);
      });
      if (curEditAsalVal) {
        selEditAsal.value = curEditAsalVal;
      }
    }
  });
}

document.getElementById('btn-tambah-wilayah').addEventListener('click', function () {
  var kode = document.getElementById('w-kode').value.trim();
  var nama = document.getElementById('w-nama').value.trim();

  if (!/^[0-9]{5}$/.test(kode)) {
    tampilkanPopup('Kode pos harus 5 digit angka.', 'error');
    return;
  }
  if (!nama) {
    tampilkanPopup('Nama wilayah wajib diisi.', 'error');
    return;
  }

  post('/admin/api/wilayah', { kode_pos: kode, nama: nama }).then(function (d) {
    if (d.ok) {
      document.getElementById('w-kode').value = '';
      document.getElementById('w-nama').value = '';
      tampilkanPopup('Wilayah berhasil ditambahkan.', 'success');
      muatWilayah();
    } else {
      tampilkanPopup(d.msg || 'Gagal menambahkan wilayah.', 'error');
    }
  });
});

document.querySelector('#tbl-wilayah').addEventListener('click', function (e) {
  var t = e.target;
  if (t.dataset.action === 'hapus-wilayah') {
    var id = t.dataset.id;
    var nama = t.dataset.nama;
    if (confirm('Hapus wilayah "' + nama + '"?')) {
      api('/admin/api/wilayah/' + id, { method: 'DELETE' }).then(function (d) {
        if (d.ok) {
          tampilkanPopup('Wilayah berhasil dihapus.', 'success');
          muatWilayah();
        } else {
          tampilkanPopup(d.msg || 'Gagal menghapus wilayah.', 'error');
        }
      });
    }
  }
});


// Manajemen Kuota Global & Voucher

function muatKuotaGlobal() {
  api('/admin/api/voucher/kuota').then(function (d) {
    if (d.ok) {
      var inp = document.getElementById('global-kuota');
      if (inp) { inp.value = d.kuota || 1; }
    }
  });
}

document.getElementById('btn-set-kuota').addEventListener('click', function () {
  var val = parseInt(document.getElementById('global-kuota').value);
  if (!val || val < 1) {
    tampilkanPopup('Kuota suara minimal 1.', 'error');
    return;
  }
  post('/admin/api/voucher/kuota', { kuota: val }).then(function (d) {
    if (d.ok) {
      tampilkanPopup('Kuota suara berhasil diubah menjadi ' + val, 'success');
      muatVoucher(getSelectedWilayahFilter());
    } else {
      tampilkanPopup(d.msg || 'Gagal mengatur kuota.', 'error');
    }
  });
});

function getSelectedWilayahFilter() {
  var sel = document.getElementById('filter-wilayah');
  return sel ? parseInt(sel.value) || 0 : 0;
}

function muatVoucher(wilayahId) {
  var url = '/admin/api/voucher';
  if (wilayahId && wilayahId > 0) {
    url += '?wilayah_id=' + wilayahId;
  }

  return api(url).then(function (d) {
    if (!d.ok && d.ok !== undefined) { return; }
    var items = d.items || [];
    vouchersSaatIni = items;

    var tbody = document.querySelector('#tbl-voucher tbody');
    tbody.innerHTML = '';

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:24px">Belum ada voucher pemilih. Silakan tambah voucher di atas.</td></tr>';
      return;
    }

    items.forEach(function (v) {
      var sudah = v.status === 'TERPAKAI';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + esc(v.username) + '</strong></td>' +
        '<td>' +
          '<span>' + esc(v.nama) + '</span> ' +
          '<button class="btn-sm btn-icon" data-action="edit-voucher" data-id="' + v.id + '" data-nama="' + esc(v.nama) + '" title="Edit Nama">✏️</button>' +
        '</td>' +
        '<td>' + esc(v.asal_pimpinan || v.wilayah_nama) + '</td>' +
        '<td><span class="muted">' + esc(v.wilayah_nama) + '</span></td>' +
        '<td><span class="badge ' + (sudah ? 'badge-ok' : 'badge-new') + '">' +
          (sudah ? 'Sudah Voting' : 'Belum Voting') + '</span></td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn-sm" data-action="cetak" data-id="' + v.id + '">Cetak</button> ' +
          '<button class="btn-sm" data-action="regen" data-id="' + v.id + '">Password Baru</button> ' +
          (sudah ? '<button class="danger btn-sm" data-action="reset" data-id="' + v.id + '">Reset</button> ' : '') +
          '<button class="danger btn-sm" data-action="hapus-voucher" data-id="' + v.id + '" data-nama="' + esc(v.nama) + '" data-username="' + esc(v.username) + '">Hapus</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  });
}

document.getElementById('filter-wilayah').addEventListener('change', function () {
  muatVoucher(parseInt(this.value) || 0);
});

// Tambah Voucher Satuan per Pemilih
document.getElementById('btn-tambah-voucher').addEventListener('click', function () {
  var wid = parseInt(document.getElementById('v-wilayah').value);
  var nama = document.getElementById('v-nama').value.trim();

  if (!wid) {
    tampilkanPopup('Silakan pilih wilayah terlebih dahulu.', 'error');
    return;
  }
  if (!nama) {
    tampilkanPopup('Nama pemilih wajib diisi.', 'error');
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Menambahkan...';

  post('/admin/api/voucher', {
    wilayah_id: wid,
    nama: nama
  }).then(function (d) {
    btn.disabled = false;
    btn.textContent = 'Tambah Voucher';

    if (d.ok) {
      document.getElementById('v-nama').value = '';
      // Cukup tampilkan voucher sukses ditambahkan tanpa username/password di pop up
      tampilkanPopup('Voucher sukses ditambahkan', 'success');

      // Refresh data
      muatVoucher(getSelectedWilayahFilter());
      muatWilayah();
    } else {
      tampilkanPopup(d.msg || 'Gagal menambahkan voucher.', 'error');
    }
  }).catch(function () {
    btn.disabled = false;
    btn.textContent = 'Tambah Voucher';
    tampilkanPopup('Terjadi kesalahan jaringan.', 'error');
  });
});

// Modal Edit Voucher (Pensil)
var modalEditVoucher = document.getElementById('modal-edit-voucher');

function bukaModalEdit(id, nama) {
  document.getElementById('edit-v-id').value = id;
  document.getElementById('edit-v-nama').value = nama;
  modalEditVoucher.classList.add('show');
  document.getElementById('edit-v-nama').focus();
}

function tutupModalEdit() {
  modalEditVoucher.classList.remove('show');
}

document.getElementById('btn-batal-edit').addEventListener('click', tutupModalEdit);

document.getElementById('btn-simpan-edit').addEventListener('click', function () {
  var id = document.getElementById('edit-v-id').value;
  var namaBaru = document.getElementById('edit-v-nama').value.trim();

  if (!namaBaru) {
    tampilkanPopup('Nama pemilih tidak boleh kosong.', 'error');
    return;
  }

  api('/admin/api/voucher/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama: namaBaru })
  }).then(function (d) {
    if (d.ok) {
      tutupModalEdit();
      tampilkanPopup('Nama pemilih berhasil diperbarui.', 'success');
      muatVoucher(getSelectedWilayahFilter());
    } else {
      tampilkanPopup(d.msg || 'Gagal mengubah nama.', 'error');
    }
  }).catch(function () {
    tampilkanPopup('Terjadi kesalahan jaringan.', 'error');
  });
});

// Klik di luar modal untuk menutup
modalEditVoucher.addEventListener('click', function (e) {
  if (e.target === modalEditVoucher) {
    tutupModalEdit();
  }
});

// Aksi tabel voucher: Edit, Cetak, Password Baru, Reset, Hapus
document.querySelector('#tbl-voucher').addEventListener('click', function (e) {
  var t = e.target;
  var action = t.dataset.action;
  var id = t.dataset.id;
  if (!action || !id) { return; }

  if (action === 'edit-voucher') {
    bukaModalEdit(id, t.dataset.nama);
  }

  if (action === 'cetak') {
    var v = vouchersSaatIni.filter(function (x) { return String(x.id) === String(id); })[0];
    if (v) {
      cetakDataVoucher([{
        username: v.username,
        password: v.password || '',
        nama: v.nama,
        asal_pimpinan: v.asal_pimpinan || v.wilayah_nama
      }]);
    }
  }

  if (action === 'regen') {
    if (confirm('Buat password baru untuk voucher ini? Password sebelumnya tidak akan berlaku lagi.')) {
      post('/admin/api/voucher/' + id + '/regenerate', {}).then(function (d) {
        if (d.ok) {
          tampilkanPopup('Password baru berhasil dibuat.', 'success');
          cetakDataVoucher([d]);
          muatVoucher(getSelectedWilayahFilter());
        } else {
          tampilkanPopup(d.msg || 'Gagal membuat password baru.', 'error');
        }
      });
    }
  }

  if (action === 'reset') {
    if (confirm('Recovery akan MENGHAPUS semua pilihan suara dari voucher ini dan memungkinkannya voting kembali. Yakin?')) {
      post('/admin/api/voucher/' + id + '/recover', {}).then(function (d) {
        if (d.ok) {
          tampilkanPopup('Voucher berhasil di-reset.', 'success');
          muatVoucher(getSelectedWilayahFilter());
          muatWilayah();
        } else {
          tampilkanPopup(d.msg || 'Gagal reset voucher.', 'error');
        }
      });
    }
  }

  if (action === 'hapus-voucher') {
    var uname = t.dataset.username;
    var nama = t.dataset.nama;
    if (confirm('Hapus voucher ' + uname + ' (' + nama + ')? Tindakan ini tidak dapat dibatalkan.')) {
      api('/admin/api/voucher/' + id, { method: 'DELETE' }).then(function (d) {
        if (d.ok) {
          tampilkanPopup('Voucher berhasil dihapus.', 'success');
          muatVoucher(getSelectedWilayahFilter());
          muatWilayah();
        } else {
          tampilkanPopup(d.msg || 'Gagal menghapus voucher.', 'error');
        }
      });
    }
  }
});

// Cetak seluruh voucher yang sedang terfilter
document.getElementById('btn-cetak-terfilter').addEventListener('click', function () {
  if (!vouchersSaatIni || vouchersSaatIni.length === 0) {
    tampilkanPopup('Tidak ada voucher yang dapat dicetak.', 'error');
    return;
  }
  var dataCetak = vouchersSaatIni.map(function (v) {
    return {
      username: v.username,
      password: v.password || '',
      nama: v.nama || '',
      asal_pimpinan: v.asal_pimpinan || v.wilayah_nama || ''
    };
  });
  cetakDataVoucher(dataCetak);
});

function cetakDataVoucher(data) {
  var str = JSON.stringify(data);
  try {
    sessionStorage.setItem('cetak_voucher', str);
    localStorage.setItem('cetak_voucher', str);
    sessionStorage.setItem('cetak_logo', '/static/assets/logo.png?v=2');
    localStorage.setItem('cetak_logo', '/static/assets/logo.png?v=2');
  } catch (e) {}
  window.open('/static/cetak.html', '_blank');
}


// Manajemen Kandidat

function muatKandidat() {
  return api('/admin/api/kandidat').then(function (rows) {
    var tbody = document.querySelector('#tbl-kandidat tbody');
    tbody.innerHTML = '';

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:24px">Belum ada kandidat terdaftar.</td></tr>';
      return;
    }

    rows.forEach(function (k) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + k.urutan + '</strong></td>' +
        '<td><img src="' + (k.foto || '/static/assets/logo.png?v=2') + '" alt="Foto"></td>' +
        '<td><strong>' + esc(k.nama) + '</strong></td>' +
        '<td>' + esc(k.asal_pimpinan || '-') + '</td>' +
        '<td><span class="badge ' + (k.aktif ? 'badge-ok' : 'badge-new') + '">' + (k.aktif ? 'Aktif' : 'Nonaktif') + '</span></td>' +
        '<td>' +
          '<button class="btn-sm" data-action="edit-kandidat" data-id="' + k.id + '" data-nama="' + esc(k.nama) + '" data-asal="' + esc(k.asal_pimpinan || '') + '" data-foto="' + (k.foto || '') + '" data-aktif="' + k.aktif + '">Edit</button> ' +
          '<button class="btn-sm" data-action="toggle-kandidat" data-id="' + k.id + '" data-aktif="' + k.aktif + '" data-nama="' + esc(k.nama) + '">' +
          (k.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button> ' +
          '<button class="danger btn-sm" data-action="hapus-kandidat" data-id="' + k.id + '" data-nama="' + esc(k.nama) + '">Hapus</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
  });
}

document.getElementById('btn-tambah-kandidat').addEventListener('click', function () {
  var nama = document.getElementById('k-nama').value.trim();
  var asal = document.getElementById('k-asal') ? document.getElementById('k-asal').value : '';
  var foto = document.getElementById('k-foto').files[0];

  if (!nama) {
    tampilkanPopup('Nama lengkap kandidat wajib diisi.', 'error');
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Menambahkan...';

  var fd = new FormData();
  fd.append('nama', nama);
  if (asal) {
    fd.append('asal_pimpinan', asal);
  }
  if (foto) {
    fd.append('foto', foto);
  }

  api('/admin/api/kandidat', { method: 'POST', body: fd }).then(function (d) {
    btn.disabled = false;
    btn.textContent = 'Tambah Kandidat';
    if (d.ok) {
      document.getElementById('k-nama').value = '';
      if (document.getElementById('k-asal')) { document.getElementById('k-asal').value = ''; }
      document.getElementById('k-foto').value = '';
      tampilkanPopup('Kandidat berhasil ditambahkan (No. Urut ' + d.urutan + ').', 'success');
      muatKandidat();
    } else {
      tampilkanPopup(d.msg || 'Gagal menambahkan kandidat.', 'error');
    }
  }).catch(function () {
    btn.disabled = false;
    btn.textContent = 'Tambah Kandidat';
    tampilkanPopup('Terjadi kesalahan saat mengunggah kandidat.', 'error');
  });
});

document.querySelector('#tbl-kandidat').addEventListener('click', function (e) {
  var t = e.target;
  var action = t.dataset.action;
  var id = t.dataset.id;
  if (!action || !id) { return; }

  if (action === 'edit-kandidat') {
    var modal = document.getElementById('modal-edit-kandidat');
    document.getElementById('edit-k-id').value = id;
    document.getElementById('edit-k-nama').value = t.dataset.nama;
    document.getElementById('edit-k-aktif').value = t.dataset.aktif;
    document.getElementById('edit-k-foto').value = '';

    // isi dropdown asal pimpinan
    var selAsal = document.getElementById('edit-k-asal');
    var nilaiAsal = t.dataset.asal || '';
    Array.from(selAsal.options).forEach(function (opt) {
      opt.selected = (opt.value === nilaiAsal);
    });

    // tampilkan preview foto existing
    var preview = document.getElementById('edit-k-foto-preview');
    if (t.dataset.foto) {
      preview.src = t.dataset.foto;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }

    modal.classList.add('show');
    document.getElementById('edit-k-nama').focus();
  }

  if (action === 'toggle-kandidat') {
    var aktifBaru = t.dataset.aktif === '1' ? '0' : '1';
    var fd = new FormData();
    fd.append('nama', t.dataset.nama);
    fd.append('aktif', aktifBaru);

    api('/admin/api/kandidat/' + id, { method: 'PUT', body: fd }).then(function (d) {
      if (d.ok) {
        tampilkanPopup('Status kandidat berhasil diubah.', 'success');
        muatKandidat();
      }
    });
  }

  if (action === 'hapus-kandidat') {
    var nama = t.dataset.nama;
    if (confirm('Hapus kandidat "' + nama + '"? Nomor urut kandidat lain akan otomatis disesuaikan.')) {
      api('/admin/api/kandidat/' + id, { method: 'DELETE' }).then(function (d) {
        if (d.ok) {
          tampilkanPopup('Kandidat berhasil dihapus.', 'success');
          muatKandidat();
        } else {
          tampilkanPopup(d.msg || 'Gagal menghapus kandidat.', 'error');
        }
      });
    }
  }
});

// Modal Edit Kandidat - Batal
document.getElementById('btn-batal-edit-kandidat').addEventListener('click', function () {
  document.getElementById('modal-edit-kandidat').classList.remove('show');
});

document.getElementById('modal-edit-kandidat').addEventListener('click', function (e) {
  if (e.target === this) { this.classList.remove('show'); }
});

// Modal Edit Kandidat - Simpan
document.getElementById('btn-simpan-edit-kandidat').addEventListener('click', function () {
  var id = document.getElementById('edit-k-id').value;
  var nama = document.getElementById('edit-k-nama').value.trim();
  var asal = document.getElementById('edit-k-asal').value;
  var aktif = document.getElementById('edit-k-aktif').value;
  var foto = document.getElementById('edit-k-foto').files[0];

  if (!nama) {
    tampilkanPopup('Nama kandidat wajib diisi.', 'error');
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  var fd = new FormData();
  fd.append('nama', nama);
  fd.append('asal_pimpinan', asal);
  fd.append('aktif', aktif);
  if (foto) { fd.append('foto', foto); }

  api('/admin/api/kandidat/' + id, { method: 'PUT', body: fd }).then(function (d) {
    btn.disabled = false;
    btn.textContent = 'Simpan Perubahan';
    if (d.ok) {
      document.getElementById('modal-edit-kandidat').classList.remove('show');
      tampilkanPopup('Data kandidat berhasil diperbarui.', 'success');
      muatKandidat();
    } else {
      tampilkanPopup(d.msg || 'Gagal memperbarui kandidat.', 'error');
    }
  }).catch(function () {
    btn.disabled = false;
    btn.textContent = 'Simpan Perubahan';
    tampilkanPopup('Terjadi kesalahan saat menyimpan.', 'error');
  });
});


// Hasil Voting

function muatHasil() {
  api('/admin/api/hasil').then(function (d) {
    document.getElementById('stat').innerHTML =
      '<div class="stat"><span class="angka">' + d.sudah_vote + '</span><div class="label">Sudah Voting</div></div>' +
      '<div class="stat"><span class="angka">' + d.belum_vote + '</span><div class="label">Belum Voting</div></div>' +
      '<div class="stat"><span class="angka">' + d.total_voucher + '</span><div class="label">Total Pemilih</div></div>' +
      '<div class="stat"><span class="angka">' + d.total_suara + '</span><div class="label">Total Suara Masuk</div></div>';

    var g = document.getElementById('grafik');
    g.innerHTML = '';

    if (!d.kandidat || d.kandidat.length === 0) {
      g.innerHTML = '<p class="muted">Belum ada kandidat aktif.</p>';
      return;
    }

    var maxSuara = 1;
    d.kandidat.forEach(function (k) {
      if (k.suara > maxSuara) { maxSuara = k.suara; }
    });

    d.kandidat.forEach(function (k) {
      var persenLebar = Math.round((k.suara / maxSuara) * 100);
      var row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<div class="bar-label"><strong>No. ' + k.urutan + ' - ' + esc(k.nama) + '</strong>: ' + k.suara + ' suara (' + k.persen + '%)</div>' +
        '<div class="bar-wrap">' +
          '<div class="bar" style="width:' + Math.max(persenLebar, 1) + '%">' +
            (k.suara > 0 ? '<span class="bar-isi">' + k.suara + '</span>' : '') +
          '</div>' +
        '</div>';
      g.appendChild(row);
    });
  });

  if (timerHasil) { clearTimeout(timerHasil); }
  timerHasil = setTimeout(function () {
    if (document.getElementById('tab-hasil').classList.contains('active')) {
      muatHasil();
    }
  }, 5000);
}


// Log Aktivitas

function muatLog() {
  api('/admin/api/log').then(function (rows) {
    var tbody = document.querySelector('#tbl-log tbody');
    tbody.innerHTML = '';

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:20px">Belum ada catatan aktivitas.</td></tr>';
      return;
    }

    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td style="white-space:nowrap; font-size:12.5px">' + esc(r.waktu) + '</td>' +
        '<td><span style="font-family:monospace; font-size:12px; font-weight:600">' + esc(r.jenis) + '</span></td>' +
        '<td>' + esc(r.username || '-') + '</td>' +
        '<td>' + esc(r.admin || '-') + '</td>' +
        '<td>' + esc(r.keterangan || '-') + '</td>' +
        '<td style="font-size:12px; color:#64748b">' + esc(r.ip || '-') + '</td>';
      tbody.appendChild(tr);
    });
  });
}


// Akun Panitia

document.getElementById('btn-ganti-pass').addEventListener('click', function () {
  var lama = document.getElementById('p-lama').value;
  var baru = document.getElementById('p-baru').value;

  if (!lama || !baru) {
    tampilkanPopup('Harap isi password lama dan password baru.', 'error');
    return;
  }

  post('/admin/api/ganti-password', {
    password_lama: lama,
    password_baru: baru
  }).then(function (d) {
    if (d.ok) {
      document.getElementById('p-lama').value = '';
      document.getElementById('p-baru').value = '';
      tampilkanPopup('Password admin berhasil diperbarui.', 'success');
    } else {
      tampilkanPopup(d.msg || 'Gagal mengganti password.', 'error');
    }
  });
});


// Inisialisasi

function muatSemua() {
  muatWilayah().then(function () {
    muatVoucher(0);
  });
  muatKuotaGlobal();
  muatKandidat();
  muatHasil();
}

// Cek apakah admin sudah memiliki sesi aktif
api('/admin/api/hasil').then(function () {
  tampilkanApp();
}).catch(function () {
  tampilkanLogin();
});
