import random
import string
import threading
import time

import bcrypt


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


def check_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def random_password(length=8) -> str:
    # tanpa O, 0, I, 1 supaya tidak tertukar saat diketik
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace('O', '').replace('0', '').replace('I', '').replace('1', '')
    return ''.join(random.choice(chars) for _ in range(length))


class LoginThrottle:
    """Anti bruteforce sederhana, simpan di memori (cukup untuk 1 server).
    3x gagal -> kunci 5 menit."""

    def __init__(self, max_fail=3, lock_seconds=300):
        self.max_fail = max_fail
        self.lock_seconds = lock_seconds
        self._data = {}
        self._lock = threading.Lock()

    def is_locked(self, key: str) -> bool:
        with self._lock:
            item = self._data.get(key)
            if not item:
                return False
            _, locked_until = item
            return time.time() < locked_until

    def fail(self, key: str):
        with self._lock:
            fails, _ = self._data.get(key, (0, 0))
            fails += 1
            locked = time.time() + self.lock_seconds if fails >= self.max_fail else 0
            self._data[key] = (fails, locked)

    def reset(self, key: str):
        with self._lock:
            self._data.pop(key, None)


throttle = LoginThrottle()
