import io
import os
import secrets
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

import config
from database import get_db
from models import Wilayah, Kandidat, Voucher, VotingSession, Vote, Admin, ActivityLog
from security import hash_password, check_password, random_password, throttle

router = APIRouter(prefix='/admin')

UPLOAD_DIR = Path('static/uploads')
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Token autentikasi independen untuk admin (kebal terhadap aktivitas pemilih)
ACTIVE_ADMIN_TOKENS: dict[str, int] = {}


def get_current_admin_id(request: Request) -> int | None:
    auth_header = request.headers.get('Authorization') or ''
    token = None
    if auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
    if not token:
        token = request.headers.get('X-Admin-Token')
    if not token:
        token = request.cookies.get('admin_token')

    if token and token in ACTIVE_ADMIN_TOKENS:
        return ACTIVE_ADMIN_TOKENS[token]

    return request.session.get('admin_id')


def admin_auth(request: Request):
    admin_id = get_current_admin_id(request)
    if not admin_id:
        raise HTTPException(status_code=401, detail='belum login')
    request.state.admin_id = admin_id


def tulis_log(db, request, jenis, keterangan=None):
    ip = request.client.host if request and request.client else None
    admin_id = getattr(request.state, 'admin_id', None) if request and hasattr(request, 'state') else None
    if not admin_id and request:
        admin_id = get_current_admin_id(request)
    db.add(ActivityLog(admin_id=admin_id,
                       jenis=jenis, keterangan=keterangan, ip=ip))


def simpan_foto(foto: UploadFile, kandidat_id: int) -> str:
    ext = os.path.splitext(foto.filename)[1].lower()
    if ext not in ('.jpg', '.jpeg', '.png', '.webp'):
        ext = '.jpg'
    token_unik = secrets.token_hex(3) 
    nama_file = f"kandidat_{kandidat_id}_{token_unik}{ext}"
    
    with open(UPLOAD_DIR / nama_file, 'wb') as f:
        f.write(foto.file.read())
    return '/static/uploads/' + nama_file



# ---------- halaman ----------

@router.get('')
def halaman_admin():
    return FileResponse('static/admin.html')


# ---------- auth admin ----------

class AdminLogin(BaseModel):
    username: str
    password: str


@router.post('/api/login')
def login_admin(data: AdminLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter_by(username=data.username.strip()).first()
    if not admin or not check_password(data.password, admin.password_hash):
        return {'ok': False, 'msg': 'Username atau password salah.'}
    token = secrets.token_hex(32)
    ACTIVE_ADMIN_TOKENS[token] = admin.id
    request.state.admin_id = admin.id
    request.session['admin_id'] = admin.id
    response.set_cookie('admin_token', token, max_age=config.SESSION_MAX_AGE, httponly=True, samesite='lax')
    tulis_log(db, request, 'ADMIN_LOGIN')
    db.commit()
    return {'ok': True, 'token': token}


@router.post('/api/logout')
def logout_admin(request: Request, response: Response):
    auth_header = request.headers.get('Authorization') or ''
    token = None
    if auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
    if not token:
        token = request.headers.get('X-Admin-Token')
    if not token:
        token = request.cookies.get('admin_token')

    if token and token in ACTIVE_ADMIN_TOKENS:
        ACTIVE_ADMIN_TOKENS.pop(token, None)

    request.session.pop('admin_id', None)
    response.delete_cookie('admin_token')
    return {'ok': True}


class GantiPass(BaseModel):
    password_lama: str
    password_baru: str


@router.post('/api/ganti-password')
def ganti_password(data: GantiPass, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    admin_id = getattr(request.state, 'admin_id', None) or get_current_admin_id(request)
    admin = db.get(Admin, admin_id)
    if not admin or not check_password(data.password_lama, admin.password_hash):
        return {'ok': False, 'msg': 'Password lama salah.'}
    if len(data.password_baru) < 8:
        return {'ok': False, 'msg': 'Password baru minimal 8 karakter.'}
    admin.password_hash = hash_password(data.password_baru)
    tulis_log(db, request, 'GANTI_PASSWORD')
    db.commit()
    return {'ok': True}


# ---------- wilayah ----------

class WilayahIn(BaseModel):
    kode_pos: str
    nama: str


@router.get('/api/wilayah')
def list_wilayah(request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    hasil = []
    for w in db.query(Wilayah).order_by(Wilayah.kode_pos).all():
        total = db.query(Voucher).filter_by(wilayah_id=w.id).count()
        pakai = db.query(Voucher).filter_by(wilayah_id=w.id, status='TERPAKAI').count()
        hasil.append({'id': w.id, 'kode_pos': w.kode_pos, 'nama': w.nama,
                      'total': total, 'terpakai': pakai})
    return hasil


@router.post('/api/wilayah')
def tambah_wilayah(data: WilayahIn, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    if db.query(Wilayah).filter_by(kode_pos=data.kode_pos.strip()).first():
        return {'ok': False, 'msg': 'Kode pos sudah terdaftar.'}
    db.add(Wilayah(kode_pos=data.kode_pos.strip(), nama=data.nama.strip()))
    tulis_log(db, request, 'TAMBAH_WILAYAH', data.nama)
    db.commit()
    return {'ok': True}


@router.delete('/api/wilayah/{wid}')
def hapus_wilayah(wid: int, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    w = db.get(Wilayah, wid)
    if not w:
        return {'ok': False}
    if db.query(Voucher).filter_by(wilayah_id=wid).count() > 0:
        return {'ok': False, 'msg': 'Wilayah masih punya voucher, tidak bisa dihapus.'}
    db.delete(w)
    tulis_log(db, request, 'HAPUS_WILAYAH', w.nama)
    db.commit()
    return {'ok': True}


# ---------- kandidat ----------

@router.get('/api/kandidat')
def list_kandidat(request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    rows = db.query(Kandidat).order_by(Kandidat.urutan, Kandidat.id).all()
    return [{'id': k.id, 'nama': k.nama, 'asal_pimpinan': k.asal_pimpinan or '', 'foto': k.foto,
             'urutan': k.urutan, 'aktif': k.aktif} for k in rows]


@router.post('/api/kandidat')
async def tambah_kandidat(request: Request, nama: str = Form(...),
                          asal_pimpinan: str = Form(None),
                          foto: UploadFile = File(None),
                          db: Session = Depends(get_db)):
    admin_auth(request)
    nama_clean = nama.strip()
    if not nama_clean:
        return {'ok': False, 'msg': 'Nama kandidat wajib diisi.'}

    # Nomor urut otomatis berurutan dari jumlah kandidat yang sudah ada
    max_urutan = db.query(func.max(Kandidat.urutan)).scalar() or 0
    k = Kandidat(nama=nama_clean, asal_pimpinan=(asal_pimpinan or '').strip() or None,
                 urutan=max_urutan + 1, aktif=1)
    db.add(k)
    db.flush()
    if foto and foto.filename:
        k.foto = simpan_foto(foto, k.id)
    tulis_log(db, request, 'TAMBAH_KANDIDAT', k.nama)
    db.commit()
    return {'ok': True, 'id': k.id, 'urutan': k.urutan}


@router.put('/api/kandidat/{kid}')
async def ubah_kandidat(kid: int, request: Request, nama: str = Form(...),
                        asal_pimpinan: str = Form(None),
                        aktif: int = Form(1),
                        foto: UploadFile = File(None),
                        db: Session = Depends(get_db)):
    admin_auth(request)
    k = db.get(Kandidat, kid)
    if not k:
        return {'ok': False, 'msg': 'Kandidat tidak ditemukan.'}
    k.nama = nama.strip()
    k.asal_pimpinan = (asal_pimpinan or '').strip() or None
    k.aktif = aktif
    if foto and foto.filename:
        k.foto = simpan_foto(foto, k.id)
    tulis_log(db, request, 'UBAH_KANDIDAT', k.nama)
    db.commit()
    return {'ok': True}


@router.delete('/api/kandidat/{kid}')
def hapus_kandidat(kid: int, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    k = db.get(Kandidat, kid)
    if not k:
        return {'ok': False, 'msg': 'Kandidat tidak ditemukan.'}

    nama = k.nama
    if k.foto and k.foto.startswith('/static/uploads/'):
        foto_path = Path('.') / k.foto.lstrip('/')
        if foto_path.exists():
            try:
                foto_path.unlink()
            except Exception:
                pass

    # Hapus suara untuk kandidat ini
    db.query(Vote).filter_by(kandidat_id=kid).delete()
    db.delete(k)
    db.flush()

    # Sesuaikan kembali nomor urut kandidat yang tersisa berdasarkan urutan yang sudah ada
    sisa = db.query(Kandidat).order_by(Kandidat.urutan.asc(), Kandidat.id.asc()).all()
    for idx, c in enumerate(sisa, start=1):
        c.urutan = idx

    tulis_log(db, request, 'HAPUS_KANDIDAT', nama)
    db.commit()
    return {'ok': True}


# ---------- voucher ----------

class KuotaGlobalIn(BaseModel):
    kuota: int


@router.get('/api/voucher/kuota')
def get_kuota_global(request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    v = db.query(Voucher.kuota).order_by(Voucher.id.desc()).first()
    kuota = v[0] if v else 1
    return {'ok': True, 'kuota': kuota}


@router.post('/api/voucher/kuota')
def set_kuota_global(data: KuotaGlobalIn, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    if data.kuota < 1:
        return {'ok': False, 'msg': 'Kuota suara minimal 1.'}
    jml_kandidat = db.query(Kandidat).filter_by(aktif=1).count()
    if jml_kandidat > 0 and data.kuota > jml_kandidat:
        return {'ok': False, 'msg': f'Kuota suara maksimal {jml_kandidat} (sesuai jumlah kandidat aktif).'}

    db.query(Voucher).update({'kuota': data.kuota})
    tulis_log(db, request, 'UBAH_KUOTA_GLOBAL', f'Kuota suara diset menjadi {data.kuota}')
    db.commit()
    return {'ok': True, 'kuota': data.kuota}


class TambahVoucherIn(BaseModel):
    wilayah_id: int
    nama: str


@router.post('/api/voucher')
def tambah_voucher(data: TambahVoucherIn, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    nama = data.nama.strip()
    if not nama:
        return {'ok': False, 'msg': 'Nama pemilih wajib diisi.'}

    # Cek nama voter tidak boleh sama (case-insensitive)
    existing = db.query(Voucher).filter(func.lower(Voucher.nama) == nama.lower()).first()
    if existing:
        return {'ok': False, 'msg': f'Nama pemilih "{nama}" sudah terdaftar, nama tidak boleh sama.'}

    w = db.get(Wilayah, data.wilayah_id)
    if not w:
        return {'ok': False, 'msg': 'Wilayah tidak ditemukan.'}

    # Ambil kuota aktif global
    v_last_kuota = db.query(Voucher.kuota).order_by(Voucher.id.desc()).first()
    kuota_aktif = v_last_kuota[0] if v_last_kuota else 1

    max_urut = db.query(func.max(Voucher.nomor_urut)).scalar() or 0
    start = max_urut + 1
    if start > 99999:
        return {'ok': False, 'msg': 'Nomor urut voucher sudah penuh (maks 99999).'}

    pw = random_password()
    username = '%s%03d' % (w.kode_pos, start)
    # Asal pimpinan otomatis mengikuti nama wilayah dari kode pos yang dipilih admin
    asal = w.nama

    v = Voucher(
        wilayah_id=w.id,
        nomor_urut=start,
        username=username,
        nama=nama,
        asal_pimpinan=asal,
        password_hash=hash_password(pw),
        password_plain=pw,
        kuota=kuota_aktif,
        status='BARU'
    )
    db.add(v)
    db.flush()
    tulis_log(db, request, 'TAMBAH_VOUCHER', f'{username} - {nama} ({w.nama})')
    db.commit()
    return {
        'ok': True,
        'voucher': {
            'id': v.id,
            'username': username,
            'password': pw,
            'nama': nama,
            'asal_pimpinan': asal,
            'kuota': v.kuota,
            'status': v.status,
            'wilayah_id': w.id,
            'wilayah_nama': w.nama
        }
    }


@router.get('/api/voucher')
def list_voucher(wilayah_id: int | None = None, request: Request = None, db: Session = Depends(get_db)):
    admin_auth(request)
    q = db.query(Voucher, Wilayah).join(Wilayah, Voucher.wilayah_id == Wilayah.id)
    if wilayah_id and wilayah_id > 0:
        q = q.filter(Voucher.wilayah_id == wilayah_id)
    rows = q.order_by(Voucher.id.desc()).all()

    active_voucher_ids = set(
        r[0] for r in db.query(VotingSession.voucher_id)
        .filter(VotingSession.submit_at == None, VotingSession.logout_at == None)
        .all()
    )

    items = []
    for v, w in rows:
        items.append({
            'id': v.id,
            'username': v.username,
            'password': v.password_plain or '',
            'nomor_urut': v.nomor_urut,
            'wilayah_id': w.id,
            'wilayah_nama': w.nama,
            'kode_pos': w.kode_pos,
            'nama': v.nama or '',
            'asal_pimpinan': v.asal_pimpinan or '',
            'kuota': v.kuota,
            'status': v.status,
            'is_login': (v.id in active_voucher_ids) and (v.status != 'TERPAKAI')
        })
    return {'ok': True, 'items': items}


class VoucherEdit(BaseModel):
    nama: str | None = None
    asal_pimpinan: str | None = None


@router.put('/api/voucher/{vid}')
def edit_voucher(vid: int, data: VoucherEdit, request: Request,
                 db: Session = Depends(get_db)):
    admin_auth(request)
    v = db.get(Voucher, vid)
    if not v:
        return {'ok': False, 'msg': 'Voucher tidak ditemukan.'}
    if data.nama is not None:
        nama_baru = data.nama.strip()
        if nama_baru:
            # Pastikan nama tidak bentrok dengan voucher lain
            duplikat = db.query(Voucher).filter(func.lower(Voucher.nama) == nama_baru.lower(), Voucher.id != vid).first()
            if duplikat:
                return {'ok': False, 'msg': f'Nama voter "{nama_baru}" sudah digunakan oleh voucher lain.'}
            v.nama = nama_baru
        else:
            return {'ok': False, 'msg': 'Nama voter tidak boleh kosong.'}
    if data.asal_pimpinan is not None:
        v.asal_pimpinan = data.asal_pimpinan.strip() or None
    db.commit()
    return {'ok': True}


@router.delete('/api/voucher/{vid}')
def hapus_voucher(vid: int, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    v = db.get(Voucher, vid)
    if not v:
        return {'ok': False, 'msg': 'Voucher tidak ditemukan.'}

    username = v.username
    nama = v.nama or ''

    # Lepaskan referensi voucher di log aktivitas
    db.query(ActivityLog).filter_by(voucher_id=v.id).update({'voucher_id': None})

    # Hapus semua sesi dan suara jika ada
    sesi_ids = [s.id for s in db.query(VotingSession).filter_by(voucher_id=v.id).all()]
    for sid in sesi_ids:
        db.query(Vote).filter_by(session_id=sid).delete()
    db.query(VotingSession).filter_by(voucher_id=v.id).delete()

    db.delete(v)
    tulis_log(db, request, 'HAPUS_VOUCHER', f'{username} - {nama}')
    db.commit()
    return {'ok': True}


def reset_voucher(db, v: Voucher, request: Request, jenis: str):
    sesi_ids = [s.id for s in db.query(VotingSession).filter_by(voucher_id=v.id).all()]
    for sid in sesi_ids:
        db.query(Vote).filter_by(session_id=sid).delete()
    db.query(VotingSession).filter_by(voucher_id=v.id).delete()
    v.status = 'BARU'
    tulis_log(db, request, jenis, v.username)


@router.post('/api/voucher/{vid}/regenerate')
def regenerate_password(vid: int, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    v = db.get(Voucher, vid)
    if not v:
        return {'ok': False, 'msg': 'Voucher tidak ditemukan.'}
    if v.status == 'TERPAKAI':
        return {'ok': False, 'msg': 'Voucher sudah voting. Gunakan Recovery bila perlu.'}
    reset_voucher(db, v, request, 'REGENERATE_VOUCHER')
    pw = random_password()
    v.password_hash = hash_password(pw)
    v.password_plain = pw
    db.commit()
    return {'ok': True, 'username': v.username, 'password': pw, 'nama': v.nama or '', 'asal_pimpinan': v.asal_pimpinan or ''}


@router.post('/api/voucher/{vid}/recover')
def recover_voucher(vid: int, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    v = db.get(Voucher, vid)
    if not v:
        return {'ok': False, 'msg': 'Voucher tidak ditemukan.'}
    reset_voucher(db, v, request, 'RECOVERY_VOUCHER')
    throttle.reset('v:' + v.username)
    db.commit()
    return {'ok': True, 'username': v.username}


@router.post('/api/voucher/{vid}/reset-login')
def reset_login_voucher(vid: int, request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    v = db.get(Voucher, vid)
    if not v:
        return {'ok': False, 'msg': 'Voucher tidak ditemukan.'}
    if v.status == 'TERPAKAI':
        return {'ok': False, 'msg': 'Voucher sudah digunakan.'}
    db.query(VotingSession).filter_by(voucher_id=v.id, submit_at=None).delete()
    throttle.reset('v:' + v.username)
    tulis_log(db, request, 'RESET_LOGIN_VOUCHER', v.username)
    db.commit()
    return {'ok': True, 'username': v.username}


# ---------- hasil ----------

@router.get('/api/hasil')
def hasil_voting(request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    kandidat = (db.query(Kandidat).filter_by(aktif=1)
                .order_by(Kandidat.urutan, Kandidat.id).all())
    total_suara = db.query(Vote).count()
    data = []
    for k in kandidat:
        n = db.query(Vote).filter_by(kandidat_id=k.id).count()
        data.append({'id': k.id, 'nama': k.nama, 'urutan': k.urutan, 'suara': n,
                     'persen': round(n / total_suara * 100, 2) if total_suara else 0})
    total_voucher = db.query(Voucher).count()
    sudah = db.query(Voucher).filter_by(status='TERPAKAI').count()
    return {'kandidat': data,
            'total_suara': total_suara,
            'total_voucher': total_voucher,
            'sudah_vote': sudah,
            'belum_vote': total_voucher - sudah}


# ---------- log ----------

@router.get('/api/log')
def log_aktivitas(request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    rows = db.query(ActivityLog).order_by(ActivityLog.id.desc()).limit(500).all()
    out = []
    for r in rows:
        username = None
        if r.voucher_id:
            v = db.get(Voucher, r.voucher_id)
            username = v.username if v else None
        admin_name = None
        if r.admin_id:
            a = db.get(Admin, r.admin_id)
            admin_name = a.username if a else None
        waktu = r.waktu.strftime('%Y-%m-%d %H:%M:%S') if r.waktu else ''
        out.append({'waktu': waktu, 'jenis': r.jenis, 'username': username,
                    'admin': admin_name, 'keterangan': r.keterangan or '',
                    'ip': r.ip or ''})
    return out


# ---------- export excel ----------

@router.get('/api/export')
def export_excel(request: Request, db: Session = Depends(get_db)):
    admin_auth(request)
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, Reference

    wb = Workbook()
    ws = wb.active
    ws.title = 'Hasil Voting'
    ws.append(['No. Urut', 'Kandidat', 'Suara', 'Persentase (%)'])
    kandidat = (db.query(Kandidat).filter_by(aktif=1)
                .order_by(Kandidat.urutan, Kandidat.id).all())
    total = db.query(Vote).count()
    for k in kandidat:
        n = db.query(Vote).filter_by(kandidat_id=k.id).count()
        ws.append([k.urutan, k.nama, n, round(n / total * 100, 2) if total else 0])
    chart = BarChart()
    chart.title = 'Hasil Voting'
    data_ref = Reference(ws, min_col=3, min_row=1, max_row=1 + len(kandidat))
    cats = Reference(ws, min_col=2, min_row=2, max_row=1 + len(kandidat))
    chart.add_data(data_ref, titles_from_data=True)
    chart.set_categories(cats)
    chart.height = 10
    chart.width = 22
    ws.add_chart(chart, 'F2')

    ws2 = wb.create_sheet('Log Aktivitas')
    ws2.append(['Waktu', 'Jenis', 'Username Voucher', 'Admin', 'Keterangan', 'IP'])
    rows = db.query(ActivityLog).order_by(ActivityLog.id.asc()).all()
    for r in rows:
        v = db.get(Voucher, r.voucher_id) if r.voucher_id else None
        a = db.get(Admin, r.admin_id) if r.admin_id else None
        waktu = r.waktu.strftime('%Y-%m-%d %H:%M:%S') if r.waktu else ''
        ws2.append([waktu, r.jenis, v.username if v else '',
                    a.username if a else '', r.keterangan or '', r.ip or ''])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    tulis_log(db, request, 'EXPORT_EXCEL')
    db.commit()
    return StreamingResponse(
        buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename=hasil_voting.xlsx'})
