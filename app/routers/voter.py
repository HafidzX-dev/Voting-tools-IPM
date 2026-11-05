from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Voucher, Kandidat, VotingSession, Vote, ActivityLog
from security import check_password, throttle

router = APIRouter()


def tulis_log(db, voucher_id, jenis, request, keterangan=None):
    ip = request.client.host if request.client else None
    db.add(ActivityLog(voucher_id=voucher_id, jenis=jenis,
                       keterangan=keterangan, ip=ip))


@router.get('/')
def index():
    return FileResponse('static/index.html')


@router.get('/vote')
def halaman_vote():
    return FileResponse('static/vote.html')


class LoginIn(BaseModel):
    username: str
    password: str


@router.post('/api/login')
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    username = data.username.strip()
    key = 'v:' + username
    if throttle.is_locked(key):
        return {'ok': False, 'msg': 'Terlalu banyak percobaan. Coba lagi 5 menit lagi.'}

    password = data.password.strip().upper()
    voucher = db.query(Voucher).filter_by(username=username).first()
    if not voucher or not check_password(password, voucher.password_hash):
        throttle.fail(key)
        if voucher:
            tulis_log(db, voucher.id, 'LOGIN_GAGAL', request)
            db.commit()
        return {'ok': False, 'msg': 'Username atau password salah.'}

    if voucher.status != 'BARU':
        return {'ok': False, 'msg': 'Voucher sudah digunakan.'}

    sesi_aktif = (db.query(VotingSession)
                  .filter_by(voucher_id=voucher.id, submit_at=None, logout_at=None)
                  .first())
    if sesi_aktif:
        tulis_log(db, voucher.id, 'LOGIN_GAGAL', request, 'sesi masih aktif')
        db.commit()
        return {'ok': False, 'msg': 'Voucher sedang dipakai. Tunggu sebentar atau hubungi panitia.'}

    sesi = VotingSession(voucher_id=voucher.id)
    db.add(sesi)
    db.flush()
    tulis_log(db, voucher.id, 'LOGIN', request)
    db.commit()

    throttle.reset(key)
    request.session.pop('sesi_id', None)
    request.session['sesi_id'] = sesi.id
    return {'ok': True}


@router.get('/api/kandidat')
def daftar_kandidat(request: Request, db: Session = Depends(get_db)):
    sesi_id = request.session.get('sesi_id')
    if not sesi_id:
        return {'ok': False}
    sesi = db.get(VotingSession, sesi_id)
    if not sesi or sesi.submit_at:
        return {'ok': False}
    voucher = db.get(Voucher, sesi.voucher_id)
    rows = (db.query(Kandidat).filter_by(aktif=1)
            .order_by(Kandidat.urutan, Kandidat.id).all())
    return {
        'ok': True,
        'kuota': voucher.kuota,
        'kandidat': [{'id': k.id, 'nama': k.nama, 'asal_pimpinan': k.asal_pimpinan or '', 'foto': k.foto} for k in rows],
    }


class VoteIn(BaseModel):
    kandidat_ids: list[int]
    golput: bool = False


@router.post('/api/vote')
def submit_vote(data: VoteIn, request: Request, db: Session = Depends(get_db)):
    sesi_id = request.session.get('sesi_id')
    if not sesi_id:
        return {'ok': False, 'msg': 'Sesi habis, silakan login ulang.'}
    sesi = db.get(VotingSession, sesi_id)
    if not sesi or sesi.submit_at:
        return {'ok': False, 'msg': 'Sesi tidak valid.'}

    voucher = db.get(Voucher, sesi.voucher_id)

    ids = list(dict.fromkeys(data.kandidat_ids))

    # Jika memilih lebih dari kuota (termasuk semua kandidat) → tidak sah = 0
    if data.golput or len(ids) > voucher.kuota:
        sesi.submit_at = datetime.now()
        voucher.status = 'TERPAKAI'
        tulis_log(db, voucher.id, 'SUBMIT', request)
        db.commit()
        request.session.pop('sesi_id', None)
        return {'ok': True}

    if len(ids) != voucher.kuota:
        return {'ok': False, 'msg': 'Pilih tepat ' + str(voucher.kuota) + ' kandidat.'}

    jml = (db.query(Kandidat)
           .filter(Kandidat.aktif == 1, Kandidat.id.in_(ids)).count())
    if jml != len(ids):
        return {'ok': False, 'msg': 'Ada kandidat yang tidak valid.'}

    for kid in ids:
        db.add(Vote(session_id=sesi.id, kandidat_id=kid))
    sesi.submit_at = datetime.now()
    voucher.status = 'TERPAKAI'
    tulis_log(db, voucher.id, 'SUBMIT', request)
    db.commit()
    request.session.pop('sesi_id', None)
    return {'ok': True}


@router.post('/api/logout')
def logout(request: Request, db: Session = Depends(get_db)):
    sesi_id = request.session.get('sesi_id')
    if sesi_id:
        sesi = db.get(VotingSession, sesi_id)
        if sesi and not sesi.logout_at and not sesi.submit_at:
            sesi.logout_at = datetime.now()
            tulis_log(db, sesi.voucher_id, 'LOGOUT', request)
            db.commit()
    request.session.pop('sesi_id', None)
    return {'ok': True}
