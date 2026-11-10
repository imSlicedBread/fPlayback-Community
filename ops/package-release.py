#!/usr/bin/env python3
"""Produce a reproducible, credential-free distribution ZIP and SHA256 checksum."""
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import json
import sys

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
require_ytdlp = '--require-yt-dlp' in sys.argv
binary = root / 'tools/yt-dlp.exe'
manifest = root / 'tools/yt-dlp-manifest.json'
if require_ytdlp and (not binary.exists() or not manifest.exists()):
    raise SystemExit('Refusing to publish Windows release without prebundled verified yt-dlp.exe')
if binary.exists():
    if not manifest.exists():
        raise SystemExit('yt-dlp executable has no release checksum manifest')
    expected = json.loads(manifest.read_text(encoding='utf8'))['sha256']
    actual = sha256(binary.read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit(f'Bundled yt-dlp SHA-256 mismatch: {actual}')
    for legal in ('LICENSE', 'THIRD_PARTY_LICENSES.txt'):
        if not (root / 'tools/yt-dlp-licenses' / legal).exists():
            raise SystemExit(f'Missing bundled yt-dlp notice: {legal}')

out = root / 'dist'
out.mkdir(exist_ok=True)
archive = out / f'Playback-v{version}.zip'
files = []
for name in ('README.md', 'LICENSE', 'SECURITY.md', 'TRADEMARKS.md',
             'CHANGELOG.md', 'package.json', 'server.js', 'start-player.bat', 'start-player.sh',
             'INSTALL-AUTO-START.bat', 'UNINSTALL-AUTO-START.bat', 'CHECK-AUTO-START.bat',
             'UPDATE-PLAYBACK.bat'):
    files.append(root / name)
for folder in ('docs', 'lib', 'public', 'ops', 'test', 'tools', '.github'):
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and not p.name.endswith('.download'))
# Native plugin binaries and corresponding build sources ship in the separate
# plugin packages. The station includes its guide, license and JS controller.
plugin = root / 'obs-plugin'
for name in ('README.md', 'LICENSE', 'watch-controller.js'):
    files.append(plugin / name)
with ZipFile(archive, mode='w', compression=ZIP_DEFLATED, compresslevel=9) as z:
    update_files = []
    for file in sorted(files):
        relative = file.relative_to(root).as_posix()
        info = ZipInfo(f'Playback/{relative}', date_time=(2026, 10, 16, 0, 0, 0))
        info.create_system = 3
        info.external_attr = ((0o755 if relative in ('start-player.sh', 'ops/package-release.py', 'ops/bundle-yt-dlp.py') else 0o644) << 16)
        info.compress_type = ZIP_DEFLATED
        contents = file.read_bytes()
        z.writestr(info, contents, compress_type=ZIP_DEFLATED, compresslevel=9)
        update_files.append({'path': relative, 'sha256': sha256(contents).hexdigest()})
    info = ZipInfo('Playback/UPDATE-MANIFEST.json', date_time=(2026, 10, 16, 0, 0, 0))
    info.create_system = 3
    info.external_attr = 0o644 << 16
    z.writestr(info, json.dumps({'version': version, 'files': update_files}) + '\n',
               compress_type=ZIP_DEFLATED, compresslevel=9)
checksum = sha256(archive.read_bytes()).hexdigest()
(out / f'{archive.name}.sha256').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
print(f'{archive} ({archive.stat().st_size} bytes)')
print(f'SHA-256 {checksum}')
if not binary.exists(): print('NOTE: This is a source-only ZIP. Windows official GitHub release ZIP includes bundled yt-dlp.exe.')
