#!/usr/bin/env python3
"""Safely transplant CryptPad's changes using a three-way, per-file merge.

Merge order: target release (ours), upstream baseline (ancestor), and CryptPad
adaptations (theirs). Identical/already-present edits are accepted; genuine
conflicts fail without modifying ANY target files. No conflict markers enter a
successful build. This avoids newline-dependent unified patch corruption.
"""
import json
import pathlib
import stat
import shutil
import subprocess
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: apply-wasm-port.py TARGET REPORT')

target = pathlib.Path(sys.argv[1]).resolve()
report = pathlib.Path(sys.argv[2]).resolve()
manifest = json.loads(report.read_text())
if manifest.get('format') != 2:
    raise SystemExit('Unsupported source-port manifest: regenerate with port-wasm-changes.py')
if not target.is_dir():
    raise SystemExit('Target source directory is missing')
old_dir = pathlib.Path(manifest['baselineDir']).resolve()
new_dir = pathlib.Path(manifest['modifiedDir']).resolve()
work = report.parent / 'wasm-port'
stage = work / 'merged'
conflicts_dir = work / 'conflicts'
for root in (stage, conflicts_dir):
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)


def safe(root, name):
    rel = pathlib.PurePosixPath(name)
    if rel.is_absolute() or '..' in rel.parts or not rel.parts:
        raise SystemExit(f'Unsafe port path: {name}')
    path = root.joinpath(*rel.parts)
    if path.is_symlink() or any(p.is_symlink() for p in path.parents if p != root and root in p.parents):
        raise SystemExit(f'Unexpected symlink within core source: {path}')
    return path


def read_regular(path):
    if path.is_symlink():
        raise SystemExit(f'Unexpected symlink file: {path}')
    return path.read_bytes() if path.is_file() else None


operations = []
permission_operations = []
conflicts = []
already_present = []
merged_files = []
for name in manifest['changed'] + manifest['new'] + manifest['deleted']:
    output = safe(target, name)
    a_path = safe(old_dir, name)
    b_path = safe(new_dir, name)
    ours = read_regular(output)
    original = read_regular(a_path)
    incoming = read_regular(b_path)
    if name in manifest['changed'] and (original is None or incoming is None):
        raise SystemExit(f'Missing prepared merge source: {name}')
    if name in manifest['new'] and incoming is None:
        raise SystemExit(f'Missing prepared new source: {name}')
    if name in manifest['deleted'] and original is None:
        raise SystemExit(f'Missing prepared deleted source: {name}')

    modes = manifest['fileModes'][name]
    old_mode = modes['baseline']
    new_mode = modes['cryptpad']
    existing_mode = format(stat.S_IMODE(output.stat().st_mode), 'o') if ours is not None else None
    def check_permissions():
        if new_mode is None or old_mode == new_mode:
            return True
        wanted = '755' if new_mode == '100755' else '644'
        original_mode = '755' if old_mode == '100755' else '644' if old_mode else None
        if existing_mode not in (None, wanted, original_mode):
            conflicts.append({'file': name, 'reason': 'core file permissions changed independently'})
            return False
        permission_operations.append((name, int(wanted, 8)))
        return True
    if not check_permissions():
        continue
    if ours == incoming:
        already_present.append(name)
        continue
    if ours == original:
        operations.append((name, incoming))
        continue
    if original is None or incoming is None or ours is None:
        conflicts.append({'file': name, 'reason': 'file added/deleted differently in EuroOffice'})
        continue
    if b'\0' in ours or b'\0' in original or b'\0' in incoming:
        conflicts.append({'file': name, 'reason': 'binary file changed on both sides'})
        continue
    # GNU git merge-file accepts files without a trailing newline, handles
    # already-applied edits, and emits conflicts as exit status 1.
    merged = subprocess.run(
        ['git', 'merge-file', '--diff3', '-p', '--', str(output), str(a_path), str(b_path)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if merged.returncode == 0:
        operations.append((name, merged.stdout))
        merged_files.append(name)
    elif 0 < merged.returncode <= 127:
        preview = safe(conflicts_dir, name + '.merge')
        preview.parent.mkdir(parents=True, exist_ok=True)
        preview.write_bytes(merged.stdout)
        conflicts.append({'file': name, 'reason': 'overlapping source edits; manual merge required',
                          'preview': str(preview)})
    else:
        details = merged.stderr.decode('utf-8', 'replace')[:2000]
        raise SystemExit(f'git merge-file failed unexpectedly for {name}: {details}')

results = {
    'format': 2,
    'status': 'conflict' if conflicts else 'ready',
    'alreadyPresent': already_present,
    'merged': merged_files,
    'changesPlanned': len(operations),
    'conflicts': conflicts,
}
result_path = report.parent / 'wasm-port-results.json'
result_path.write_text(json.dumps(results, indent=2) + '\n')
if conflicts:
    print(f'WASM source port: {len(already_present)} already present, '
          f'{len(merged_files)} merged, {len(conflicts)} conflict(s).', file=sys.stderr)
    for item in conflicts[:30]:
        print(f"  CONFLICT {item['file']}: {item['reason']}", file=sys.stderr)
    if len(conflicts) > 30:
        print(f'  ... and {len(conflicts)-30} more', file=sys.stderr)
    print(f'No target source was modified. See {result_path} and merge previews '
          'in the GitHub Actions diagnostic artifact.', file=sys.stderr)
    raise SystemExit(1)

# Stage outputs first, then apply after every path has merged successfully.
for name, data in operations:
    if data is not None:
        dest = safe(stage, name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
for name, data in operations:
    dest = safe(target, name)
    if data is None:
        dest.unlink(missing_ok=True)
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(safe(stage, name), dest)
        if name in manifest['new']:
            new_mode = manifest['fileModes'][name]['cryptpad']
            dest.chmod(0o755 if new_mode == '100755' else 0o644)
for name, mode in permission_operations:
    path = safe(target, name)
    if path.is_file():
        path.chmod(mode)

results['status'] = 'applied'
result_path.write_text(json.dumps(results, indent=2) + '\n')
print(f'Applied WASM three-way port: {len(operations)} changed, '
      f'{len(already_present)} already present, {len(merged_files)} auto-merged, 0 conflicts.')
print('Source compatibility and WASM compilation remain unverified until build/test passes.')
