#!/usr/bin/env python3
"""Merge CryptPad adaptations into the exact release core, failing closed.

Regular files: Git merge-file (3-way). Symlinks: compare link TARGET strings,
never dereference; only relative in-tree links may be installed. All conflicts
are detected before mutating target source files or symlinks.
"""
import json
import hashlib
import difflib
import os
import pathlib
import shutil
import stat
import subprocess
import sys
from wasm_symlink_policy import validate_target

if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and sys.argv[3] != '--check'):
    raise SystemExit('usage: apply-wasm-port.py TARGET REPORT [--check]')
check_only = len(sys.argv) == 4

target = pathlib.Path(sys.argv[1]).resolve()
report = pathlib.Path(sys.argv[2]).resolve()
manifest = json.loads(report.read_text())
if manifest.get('format') != 3:
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


def safe(root, name, allow_leaf_symlink=False):
    rel = pathlib.PurePosixPath(name)
    if rel.is_absolute() or '..' in rel.parts or not rel.parts or rel == pathlib.PurePosixPath('.'):
        raise SystemExit(f'Unsafe port path: {name}')
    path = root.joinpath(*rel.parts)
    if (path.is_symlink() and not allow_leaf_symlink) or any(
        p.is_symlink() for p in path.parents if p != root and root in p.parents
    ):
        raise SystemExit(f'Unexpected symlink within core source: {path}')
    return path


def read_regular(path):
    if path.is_symlink():
        raise SystemExit(f'Unexpected symlink file: {path}')
    return path.read_bytes() if path.is_file() else None


# Each genuine compatibility conflict is accompanied by source identities and
# compact three-way review inputs. Byte-capped copies prevent multi-GB artifacts.
MAX_REVIEW_BYTES = 1_000_000
MAX_DIFF_BYTES = 100_000

def snapshot(data):
    if data is None:
        return {'present': False}
    return {'present': True, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def write_review(name, reason, baseline=None, cryptpad=None, eurooffice=None,
                 kind='regular-file'):
    # The path originates in validated Git tracked entries or the validated
    # manifest; use safe() even though this diagnostic is in a fresh folder.
    folder = safe(conflicts_dir, name + '.inputs')
    folder.mkdir(parents=True, exist_ok=True)
    sources = {'baseline': baseline, 'cryptpad': cryptpad, 'eurooffice': eurooffice}
    identities = {key: snapshot(value) for key, value in sources.items()}
    for label, data in sources.items():
        if data is not None and len(data) <= MAX_REVIEW_BYTES:
            (folder / label).write_bytes(data)
    for label, data in (('cryptpad', cryptpad), ('eurooffice', eurooffice)):
        if baseline is None or data is None or len(data) > MAX_DIFF_BYTES or len(baseline) > MAX_DIFF_BYTES:
            continue
        try:
            old = baseline.decode('utf-8').splitlines(keepends=True)
            new = data.decode('utf-8').splitlines(keepends=True)
        except UnicodeDecodeError:
            continue
        diff = difflib.unified_diff(old, new, fromfile='baseline', tofile=label)
        (folder / ('baseline-to-' + label + '.diff')).write_text(''.join(diff))
    return {'file': name, 'reason': reason, 'kind': kind,
            'sources': identities, 'reviewDirectory': str(folder)}


operations = []
link_operations = []
permission_operations = []
conflicts = []
already_present = []
merged_files = []

for name in manifest['changed'] + manifest['new'] + manifest['deleted']:
    output = safe(target, name, allow_leaf_symlink=True)
    a_path = safe(old_dir, name)
    b_path = safe(new_dir, name)
    if output.is_symlink() or (output.exists() and not output.is_file()):
        conflicts.append(write_review(name, 'core path has an unexpected file type or symlink'))
        continue
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
    if new_mode is not None and old_mode != new_mode:
        wanted = '755' if new_mode == '100755' else '644'
        original_mode = '755' if old_mode == '100755' else '644' if old_mode else None
        if existing_mode not in (None, wanted, original_mode):
            conflicts.append(write_review(name, 'core file permissions changed independently', original, incoming, ours))
            continue
        permission_operations.append((name, int(wanted, 8)))
    if ours == incoming:
        already_present.append(name)
        continue
    if ours == original:
        operations.append((name, incoming))
        continue
    if original is None or incoming is None or ours is None:
        conflicts.append(write_review(name, 'file added/deleted differently in EuroOffice', original, incoming, ours))
        continue
    if b'\0' in ours or b'\0' in original or b'\0' in incoming:
        conflicts.append(write_review(name, 'binary file changed on both sides', original, incoming, ours))
        continue
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
        entry = write_review(name, 'overlapping source edits; manual merge required', original, incoming, ours)
        entry['preview'] = str(preview)
        conflicts.append(entry)
    else:
        details = merged.stderr.decode('utf-8', 'replace')[:2000]
        raise SystemExit(f'git merge-file failed unexpectedly for {name}: {details}')

# Mode 120000 represents a Git symlink; never treat it as the bytes of the
# referenced file, never chmod it, and never overwrite a different target.
for name in manifest['links']:
    path = safe(target, name, allow_leaf_symlink=True)
    entry = manifest['linkTargets'][name]
    old_link, new_link = entry['baseline'], entry['cryptpad']
    modes = manifest['fileModes'][name]
    if modes['baseline'] != ('120000' if old_link is not None else None) or \
       modes['cryptpad'] != ('120000' if new_link is not None else None):
        raise SystemExit(f'Invalid symlink manifest mode: {name}')
    # Both the old and new link must be safe; resolving them may pass through
    # other symlinks in the official source, which is checked as well.
    for label, value in (('baseline', old_link), ('cryptpad', new_link)):
        if value is not None:
            try:
                validate_target(target, name, value)
            except ValueError as exc:
                conflicts.append(write_review(name, f'{label} symlink is unsafe: {exc}', (old_link or '').encode() if old_link is not None else None, (new_link or '').encode() if new_link is not None else None, kind='symlink'))
                break
    else:
        if path.is_symlink():
            current_link = os.readlink(path)
        elif not os.path.lexists(path):
            current_link = None
        else:
            conflicts.append(write_review(name, 'official core has non-symlink at symlink path', kind='symlink'))
            continue
        if current_link == new_link:
            already_present.append(name)
        elif current_link == old_link:
            link_operations.append((name, new_link))
        else:
            entry = write_review(name, 'EuroOffice changed symlink independently',
                                 old_link.encode() if old_link is not None else None,
                                 new_link.encode() if new_link is not None else None,
                                 current_link.encode() if current_link is not None else None,
                                 kind='symlink')
            entry.update({'baseline': old_link, 'cryptpad': new_link, 'official': current_link})
            conflicts.append(entry)

results = {
    'format': 3,
    'status': 'conflict' if conflicts else 'ready',
    'alreadyPresent': already_present,
    'merged': merged_files,
    'changesPlanned': len(operations),
    'symlinkChangesPlanned': len(link_operations),
    'conflicts': conflicts,
    'checkOnly': check_only,
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
    summary_lines = [
        'EuroOffice / CryptPad WASM SOURCE-COMPATIBILITY REVIEW',
        '=====================================================',
        f'{len(conflicts)} incompatible file(s). This is a source-version porting task, NOT a test failure.',
        'No source changes were made. Do not automatically prefer CryptPad or EuroOffice for every conflict.',
        'Inspect wasm-port-results.json, then individual *.inputs directories:',
        '  baseline    = original ONLYOFFICE core v9.3.0.140',
        '  cryptpad    = CryptPad-patched source',
        '  eurooffice  = exact release-pinned EuroOffice source',
        '  baseline-to-*.diff = changes on each branch',
        'Input copies larger than 1 MB are omitted; SHA-256 identities are still recorded.',
        '',
    ]
    for item in conflicts:
        summary_lines.append(item['file'] + ' :: ' + item['reason'])
    summary_file = work / 'review-summary.txt'
    summary_file.write_text('\n'.join(summary_lines) + '\n')
    print(f'No target source was modified. Review {summary_file} and {result_path} '
          'in the GitHub Actions diagnostics artifact.', file=sys.stderr)
    raise SystemExit(1)

if check_only:
    print(f'Dry-run source compatibility: {len(operations)} file changes, '
          f'{len(link_operations)} symlink changes, {len(already_present)} already present; '
          'no target file modified.')
    raise SystemExit(0)

# Stage all new regular file contents and link objects before modifying target.
for name, data in operations:
    if data is not None:
        dest = safe(stage, name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
for name, link in link_operations:
    if link is not None:
        dest = safe(stage, name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        os.symlink(link, dest)

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
for name, link in link_operations:
    dest = safe(target, name, allow_leaf_symlink=True)
    if link is None:
        dest.unlink(missing_ok=True)
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        os.replace(safe(stage, name, allow_leaf_symlink=True), dest)
for name, mode in permission_operations:
    path = safe(target, name)
    if path.is_file():
        path.chmod(mode)

results['status'] = 'applied'
result_path.write_text(json.dumps(results, indent=2) + '\n')
print(f'Applied WASM three-way port: {len(operations)} regular changes, '
      f'{len(link_operations)} symlink changes, {len(already_present)} already present, '
      f'{len(merged_files)} auto-merged, 0 conflicts.')
print('Source compatibility and WASM compilation remain unverified until build/test passes.')
