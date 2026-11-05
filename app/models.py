from sqlalchemy import (Column, Integer, String, DateTime, ForeignKey,
                        UniqueConstraint, func)
from database import Base


class Wilayah(Base):
    __tablename__ = 'wilayah'
    id = Column(Integer, primary_key=True)
    kode_pos = Column(String(5), unique=True, nullable=False)
    nama = Column(String(100), nullable=False)


class Kandidat(Base):
    __tablename__ = 'kandidat'
    id = Column(Integer, primary_key=True)
    nama = Column(String(100), nullable=False)
    asal_pimpinan = Column(String(100), nullable=True)
    foto = Column(String(255), nullable=True)
    urutan = Column(Integer, default=0)
    aktif = Column(Integer, default=1)


class Voucher(Base):
    __tablename__ = 'voucher'
    id = Column(Integer, primary_key=True)
    wilayah_id = Column(Integer, ForeignKey('wilayah.id'), nullable=False)
    nomor_urut = Column(Integer, nullable=False)
    username = Column(String(10), unique=True, nullable=False)
    nama = Column(String(100), nullable=True)
    asal_pimpinan = Column(String(100), nullable=True)
    password_hash = Column(String(255), nullable=False)
    password_plain = Column(String(100), nullable=True)
    kuota = Column(Integer, nullable=False)
    status = Column(String(20), default='BARU')  # BARU / TERPAKAI
    created_at = Column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint('wilayah_id', 'nomor_urut'),)


class VotingSession(Base):
    __tablename__ = 'voting_session'
    id = Column(Integer, primary_key=True)
    voucher_id = Column(Integer, ForeignKey('voucher.id'), nullable=False)
    login_at = Column(DateTime, server_default=func.now())
    logout_at = Column(DateTime, nullable=True)
    submit_at = Column(DateTime, nullable=True)


class Vote(Base):
    __tablename__ = 'vote'
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey('voting_session.id'), nullable=False)
    kandidat_id = Column(Integer, ForeignKey('kandidat.id'), nullable=False)
    voted_at = Column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint('session_id', 'kandidat_id'),)


class Admin(Base):
    __tablename__ = 'admin'
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)


class ActivityLog(Base):
    __tablename__ = 'activity_log'
    id = Column(Integer, primary_key=True)
    voucher_id = Column(Integer, ForeignKey('voucher.id'), nullable=True)
    admin_id = Column(Integer, ForeignKey('admin.id'), nullable=True)
    jenis = Column(String(30), nullable=False)
    keterangan = Column(String(255), nullable=True)
    ip = Column(String(45), nullable=True)
    waktu = Column(DateTime, server_default=func.now())
