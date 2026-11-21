"""Decky backend for the original GameSir Tarantula Pro (2.4 GHz dongle 3537:103e).

Talks to the pad through its vendor HID channel (py_modules/t3pro_protocol.py,
the same module the Deadband fork uses) and to the t3pro-bridge user service
through ~/.config/t3pro/bridge.json. Every call is short and serialised; the
bridge keeps running alongside (hidraw allows several readers).
"""
import asyncio
import json
import os
import select
import struct
import subprocess
import threading
import time

import decky

import t3pro_protocol as p

HOME = decky.DECKY_USER_HOME
BRIDGE_CFG = os.path.join(HOME, '.config', 't3pro', 'bridge.json')
MODES = ['off', 'solid', 'breathing', 'phantom', 'streamer', 'radar']
_lock = threading.Lock()


def _user_env():
    env = dict(os.environ)
    uid = os.getuid()
    env.setdefault('XDG_RUNTIME_DIR', f'/run/user/{uid}')
    env.setdefault('DBUS_SESSION_BUS_ADDRESS', f'unix:path=/run/user/{uid}/bus')
    return env


def _systemctl(*args):
    try:
        r = subprocess.run(['systemctl', '--user', *args], env=_user_env(),
                           capture_output=True, text=True, timeout=10)
        return r.returncode == 0, r.stdout.strip()
    except (OSError, subprocess.SubprocessError) as e:
        return False, str(e)


def _load_cfg():
    try:
        with open(BRIDGE_CFG) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _save_cfg(cfg):
    os.makedirs(os.path.dirname(BRIDGE_CFG), exist_ok=True)
    tmp = BRIDGE_CFG + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    os.replace(tmp, BRIDGE_CFG)


def _status():
    out = {'present': False, 'battery': -1, 'charging': False, 'firmware': '',
           'light_mode': 0, 'brightness': 0, 'gyro_output': 0, 'gyro_activation': 0,
           'ds4': bool(_load_cfg().get('ds4', True)), 'bridge': _systemctl('is-active', 't3pro-bridge')[0],
           'error': ''}
    if p.find_hidraw() is None:
        return out
    with _lock:
        try:
            with p.Tarantula(timeout=0.4) as t:
                info = t.device_info()
                raw = t.request(0x0A, 0x01)
                lp = t.get_light_param()
                mapping = t.get_motion_mapping()
        except (p.ProtocolError, OSError) as e:
            out['error'] = str(e)
            return out
    b = raw[9] if len(raw) > 9 else 0
    out.update({'present': True, 'firmware': info['firmware'],
                'battery': min(b & 0x7F, 100) if b != 0xFF else 100,
                'charging': b == 0xFF or bool(b & 0x80),
                'light_mode': lp['mode'], 'brightness': lp['brightness'],
                'gyro_output': mapping[2], 'gyro_activation': mapping[6]})
    return out


# --- Steam actions on back buttons -------------------------------------------
# A back button with a "button alone" PC shortcut is mapped on the pad to a
# signal key (L4 = F13 ... T3 = F21). Steps {"steam": "qam" | "menu"} are
# executed here, inside Steam's UI, so they work whatever app has keyboard focus.
EV_KEY = 1
KEY_F13 = 183
EV_FMT = 'llHHi'
EV_SZ = struct.calcsize(EV_FMT)
SIGNAL = {KEY_F13 + i: btn for i, btn in enumerate(p.SIGNAL_KEYS)}


def _dongle_keyboard():
    for name in sorted(os.listdir('/sys/class/input')):
        if not name.startswith('event'):
            continue
        base = f'/sys/class/input/{name}/device'
        try:
            vid = open(f'{base}/id/vendor').read().strip()
            pid = open(f'{base}/id/product').read().strip()
            dname = open(f'{base}/name').read().strip()
        except OSError:
            continue
        if vid == '3537' and pid == '103e' and dname.endswith('Keyboard'):
            try:
                return os.open(f'/dev/input/{name}', os.O_RDONLY | os.O_NONBLOCK)
            except OSError:
                return None
    return None


def _steam_action(btn):
    m = _load_cfg().get('button_macros', {}).get(btn)
    steps = m.get('steps', []) if isinstance(m, dict) else (m or [])
    for s in steps:
        if s.get('steam') in ('qam', 'menu'):
            return s['steam']
    return None


def _watch(loop, stop):
    fd = None
    while not stop.is_set():
        if fd is None:
            fd = _dongle_keyboard()
            if fd is None:
                stop.wait(3)
                continue
            decky.logger.info('watching the dongle keyboard for Steam actions')
        try:
            r, _, _ = select.select([fd], [], [], 1.0)
            if not r:
                continue
            data = os.read(fd, EV_SZ * 64)
        except BlockingIOError:
            continue
        except OSError:
            os.close(fd)
            fd = None
            continue
        for off in range(0, len(data) - EV_SZ + 1, EV_SZ):
            _, _, etype, code, value = struct.unpack_from(EV_FMT, data, off)
            if etype == EV_KEY and value == 1 and code in SIGNAL:
                action = _steam_action(SIGNAL[code])
                if action:
                    decky.logger.info(f'{SIGNAL[code]} -> steam {action}')
                    asyncio.run_coroutine_threadsafe(decky.emit('t3pro_steam', action), loop)
    if fd is not None:
        os.close(fd)


def _write(fn):
    with _lock:
        with p.Tarantula(timeout=0.4) as t:
            fn(t)
            t.save()


class Plugin:
    async def get_status(self):
        return await asyncio.get_running_loop().run_in_executor(None, _status)

    async def set_light(self, mode: int, brightness: int):
        def job(t):
            cur = t.get_light_param()
            t.set_light_param(brightness=max(0, min(100, int(brightness))), speed=cur['speed'],
                              mode=max(0, min(5, int(mode))))
        try:
            await asyncio.get_running_loop().run_in_executor(None, _write, job)
            return True
        except (p.ProtocolError, OSError) as e:
            decky.logger.error(f'set_light: {e}')
            return False

    async def set_gyro_mouse(self, on: bool):
        """Pad-side gyro: output Mouse (activation kept, 'always' if it was off),
        or output off."""
        def job(t):
            m = t.get_motion()
            m['output'] = 4 if on else 0
            if on and m['activation'] == 0:
                m['activation'] = 3
            t.set_motion(m)
        try:
            await asyncio.get_running_loop().run_in_executor(None, _write, job)
            return True
        except (p.ProtocolError, OSError) as e:
            decky.logger.error(f'set_gyro_mouse: {e}')
            return False

    async def set_ds4(self, on: bool):
        cfg = _load_cfg()
        cfg['ds4'] = bool(on)
        _save_cfg(cfg)
        ok, msg = _systemctl('restart', 't3pro-bridge')
        if not ok:
            decky.logger.error(f'restart bridge: {msg}')
        return ok

    async def log_ui(self, msg: str):
        decky.logger.info(f'ui: {msg}')

    async def _main(self):
        self._stop = threading.Event()
        threading.Thread(target=_watch, args=(asyncio.get_running_loop(), self._stop),
                         daemon=True).start()
        decky.logger.info('Tarantula Pro plugin loaded')

    async def _unload(self):
        if getattr(self, '_stop', None):
            self._stop.set()
