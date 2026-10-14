#!/usr/bin/env python3
"""Reuse an existing native APK; replace compiled web assets, version and icons locally."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile


def run(*args):
    result = subprocess.run([str(arg) for arg in args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('工具执行失败：' + str(args[0]) + '\n' + result.stdout[-3000:] + result.stderr[-3000:])
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--assets', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parent.parent
    project = repo / 'apps/call-phone-uni'
    baseline, assets, output = map(lambda value: Path(value).resolve(), [args.baseline, args.assets, args.output])
    hx = Path('/Applications/HBuilderX.app/Contents/HBuilderX/plugins')
    java, tools = hx / 'amazon-corretto/bin/java', hx / 'app-safe-pack'
    signer = tools / 'apksigner.jar'
    signing = json.loads((project / '.android-signing.local.json').read_text())
    manifest = json.loads((assets / 'manifest.json').read_text())
    version = manifest['version']
    if not (assets / 'app-service.js').is_file():
        raise RuntimeError('App 资源构建不完整')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='tongzige-offline-') as temp:
        temp = Path(temp)
        decoded = temp / 'decoded'
        run(java, '-jar', tools / 'apktool.jar', 'd', '-s', '-f', '-o', decoded, baseline)
        www = decoded / 'assets/apps' / manifest['id'] / 'www'
        runtime = json.loads((www / 'manifest.json').read_text())
        runtime['version'] = version
        shutil.rmtree(www)
        shutil.copytree(assets, www)
        (www / 'manifest.json').write_text(json.dumps(runtime, ensure_ascii=False, separators=(',', ':')))
        config = decoded / 'apktool.yml'
        text = config.read_text()
        text = re.sub(r'(?m)^(  versionCode:) .+$', lambda m: m[1] + ' ' + str(version['code']), text)
        text = re.sub(r'(?m)^(  versionName:) .+$', lambda m: m[1] + ' ' + version['name'], text)
        config.write_text(text)
        for density, size in [('drawable', 48), ('drawable-mdpi', 48), ('drawable-hdpi', 72), ('drawable-xhdpi', 96), ('drawable-xxhdpi', 144), ('drawable-xxxhdpi', 192)]:
            dest = decoded / 'res' / density
            dest.mkdir(exist_ok=True)
            shutil.copyfile(project / f'src/static/app-icons/{size}x{size}.png', dest / 'icon.png')
        run(java, '-jar', tools / 'apktool.jar', 'b', decoded, '-o', temp / 'unsigned.apk')
        run(tools / 'zipalign/zipalign', '-P', '16', '-f', '4', temp / 'unsigned.apk', temp / 'aligned.apk')
        store, key = temp / 'store-pass', temp / 'key-pass'
        for file, value in [(store, signing['storepassword']), (key, signing['certpassword'])]:
            file.write_text(value)
            file.chmod(0o600)
        run(java, '-jar', signer, 'sign', '--ks', (project / signing['certfile']).resolve(), '--ks-key-alias', signing['certalias'],
            '--ks-pass', 'file:' + str(store), '--key-pass', 'file:' + str(key), '--out', output, temp / 'aligned.apk')
    cert = lambda apk: re.findall(r'certificate SHA-256 digest: ([a-f0-9]+)', run(java, '-jar', signer, 'verify', '--print-certs', apk))
    if not cert(output) or cert(output) != cert(baseline):
        raise RuntimeError('签名证书与基准正式包不一致')
    with zipfile.ZipFile(baseline) as old, zipfile.ZipFile(output) as new:
        native = [name for name in old.namelist() if name.endswith(('.dex', '.so'))]
        if set(native) != {name for name in new.namelist() if name.endswith(('.dex', '.so'))} or any(old.read(name) != new.read(name) for name in native):
            raise RuntimeError('原生代码与基准包不一致')
        if new.testzip() is not None:
            raise RuntimeError('APK ZIP 完整性检查失败')
        prefix = 'assets/apps/' + manifest['id'] + '/www/'
        for file in assets.rglob('*'):
            if file.is_file() and file.name != 'manifest.json' and file.read_bytes() != new.read(prefix + file.relative_to(assets).as_posix()):
                raise RuntimeError('APK 中 App 资源与本次构建不一致')
    run(tools / 'zipalign/zipalign', '-c', '-P', '16', '4', output)
    print(f'已生成 {output}\n版本 {version["name"]}（{version["code"]}），原生代码和证书与基准一致。')
    print('SHA256: ' + hashlib.sha256(output.read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
