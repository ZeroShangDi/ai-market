"""Install/start or stop the local voice LaunchAgent without storing secrets in its plist."""
import argparse
import os
from pathlib import Path
import plistlib
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stop', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    label = 'com.ai-market.voice'
    domain = 'gui/' + str(os.getuid())
    target = domain + '/' + label
    plist = Path.home() / 'Library/LaunchAgents' / (label + '.plist')
    loaded = subprocess.run(['launchctl', 'print', target], capture_output=True).returncode == 0
    if args.stop:
        if loaded:
            subprocess.run(['launchctl', 'bootout', target], check=True)
        plist.unlink(missing_ok=True)
        print('Mac voice service stopped; automatic launch disabled.')
        return
    if loaded:
        print('Mac voice service already registered; check model readiness before chatting.')
        return
    python = root / '.venv/bin/python'
    if not python.is_file() or not (root / '.env.local').is_file():
        raise SystemExit('Configure the existing virtual environment and .env.local first.')
    # Refuse to take over independently running workers, which could duplicate GPU models.
    import socket
    for port in (48083, 48084, 48085, 48086):
        with socket.socket() as probe:
            probe.settimeout(0.5)
            if probe.connect_ex(('127.0.0.1', port)) == 0:
                raise SystemExit('An existing voice worker is running; stop it before installing the service.')
    logs = root / '.local'
    logs.mkdir(exist_ok=True)
    log = logs / 'supervisor.log'
    log.touch(mode=0o600, exist_ok=True)
    log.chmod(0o600)
    plist.parent.mkdir(parents=True, exist_ok=True)
    settings = {
        'Label': label,
        'ProgramArguments': [str(python), str(root / 'scripts/run-mac.py')],
        'WorkingDirectory': str(root),
        'EnvironmentVariables': {'PATH': os.environ.get('PATH', '/usr/bin:/bin:/usr/sbin:/sbin')},
        'RunAtLoad': True,
        'KeepAlive': True,
        'ThrottleInterval': 30,
        'AbandonProcessGroup': False,
        'StandardOutPath': str(log),
        'StandardErrorPath': str(log),
    }
    plist.write_bytes(plistlib.dumps(settings))
    plist.chmod(0o600)
    subprocess.run(['launchctl', 'bootstrap', domain, str(plist)], check=True)
    print('Mac voice service registered; check model readiness before chatting.')


if __name__ == '__main__':
    main()
