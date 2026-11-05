# Voting App — Panduan Setup (Ubuntu Server)

## 1. Install paket

```bash
sudo apt update
sudo apt install -y mysql-server nginx python3-venv python3-pip
```

## 2. Setup database MySQL

```bash
sudo mysql
```

```sql
CREATE DATABASE voting CHARACTER SET utf8mb4;
CREATE USER 'voting'@'localhost' IDENTIFIED BY 'voting123';
GRANT ALL PRIVILEGES ON voting.* TO 'voting'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 3. Taruh aplikasi

```bash
sudo mkdir -p /var/www/voting-app
# salin isi folder ini ke /var/www/voting-app (scp/rsync/flashdisk)
cd /var/www/voting-app

python3 -m venv venv
venv/bin/pip install -r requirements.txt

cp .env.example .env
nano .env   # isi DATABASE_URL dan SECRET_KEY
# contoh SECRET_KEY: jalankan  openssl rand -hex 32
```

## 4. Jalankan sebagai service

```bash
sudo cp deploy/voting.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now voting
sudo systemctl status voting     # pastikan active (running)
```

## 5. Nginx

```bash
sudo cp deploy/voting-nginx.conf /etc/nginx/sites-available/voting
sudo ln -sf /etc/nginx/sites-available/voting /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

Buka dari komputer lain dalam LAN: `http://IP-SERVER` (voter) dan `http://IP-SERVER/admin` (panitia).

## 6. Ganti logo

Ganti file `app/static/assets/logo.png` dengan logo Anda (usahakan persegi, misal 300x300 px).

## 7. Ganti password admin default

Login `/admin` dengan `admin1 / admin12345` (juga `admin2`, `admin3`),
lalu ganti password di tab **Akun**. Jangan lupa juga ganti password database di `.env`.

---

## Alur pemakaian singkat

1. Tab **Wilayah** — tambahkan kode pos + nama cabang (misal `64173 - Kandat`).
2. Tab **Kandidat** — tambah kandidat + foto, atur urutan tampil.
3. Tab **Voucher** — pilih wilayah, jumlah, kuota → **Generate** → tab cetak terbuka → cetak.
4. Isi Nama & Asal Pimpinan di tabel voucher (tersimpan otomatis).
5. Bagikan voucher ke pemilih. Pantau di tab **Hasil** (real-time) dan **Log**.
6. **Password Baru** = voucher hilang/blokir. **Recovery** = suara dihapus, voucher dipakai ulang.
7. Export Excel di tab **Hasil**.

## Catatan

- Username format: kode pos (5 digit) + nomor urut (3 digit), misal `64173078`.
- Max 999 voucher per wilayah. Kuota maksimal = jumlah kandidat aktif.
- Password voucher hanya tampil saat generate/regenerate — setelah itu tidak bisa dilihat lagi.
- Anti bruteforce: 3x salah password = kunci 5 menit per voucher.
