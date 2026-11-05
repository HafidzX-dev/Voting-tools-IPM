var passInput = document.getElementById('password');
if (passInput) {
  passInput.addEventListener('input', function () {
    var start = this.selectionStart;
    var end = this.selectionEnd;
    this.value = this.value.toUpperCase();
    if (start !== null && end !== null) {
      this.setSelectionRange(start, end);
    }
  });
}

document.getElementById('form-login').addEventListener('submit', function (e) {
  e.preventDefault();
  var pesan = document.getElementById('pesan');
  pesan.textContent = '';
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value.trim().toUpperCase()
    })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.ok) {
      location.href = '/vote';
    } else {
      pesan.textContent = d.msg || 'Login gagal.';
    }
  }).catch(function () {
    pesan.textContent = 'Terjadi kesalahan jaringan.';
  });
});
