#!/usr/bin/env python3
"""Stage a three-source x2t WASM port without constructing a giant text patch.

BASELINE is ONLYOFFICE/core at the version documented by the pinned CryptPad
recipe. MODIFIED is CryptPad's pinned /core subtree. OFFICIAL is the specific
EuroOffice release's core. Only changed paths are staged; apply-wasm-port.py
merges them against OFFICIAL without replacing its full source tree.
"""
import json
import pathlib
import shutil
import subprocess
import sys

if len(sys.argv) != 5:
    raise SystemExit('usage: port-wasm-changes.py BASELINE MODIFIED OFFICIAL_CORE REPORT')

base, modified, official, report = (pathlib.Path(x).resolve() for x in sys.argv[1:])
work = report.parent / 'wasm-port'
old_dir, new_dir = work / 'baseline', work / 'cryptpad'


def tracked(root):
    result = subprocess.run(
        ['git', '-C', str(root), 'ls-files', '--stage', '-z'],
        capture_output=True, check=True,
    )
    paths = {}
    for record in result.stdout.split(b'\0'):
        if not record:
            continue
        metadata, raw_path = record.split(b'\t', 1)
        mode, object_id, _stage = metadata.decode('ascii').split(' ')
        name = pathlib.Path(raw_path.decode('utf-8', 'surrogateescape'))
        if name.is_absolute() or '..' in name.parts or not name.parts:
            raise SystemExit(f'Unsafe tracked file: {name}')
        if name in paths:
            raise SystemExit(f'Unexpected staged conflict entry: {name}')
        paths[name] = (mode, object_id)
    return paths


def content(root, name, mode):
    if mode is None or mode == '160000':
        return None
    if mode == '120000':
        raise SystemExit(f'Symlink change requires manual review: {name}')
    if mode not in ('100644', '100755'):
        raise SystemExit(f'Unsupported Git mode {mode} for {name}')
    source = root / name
    if not source.is_file() or source.is_symlink():
        raise SystemExit(f'Missing/non-regular tracked file: {source}')
    return source.read_bytes()


base_files = tracked(base)
modified_files = tracked(modified)
if not modified_files:
    raise SystemExit('Pinned CryptPad core source contains no tracked files')

# Re-running a port cannot leak stale files from an earlier run.
if work.exists():
    shutil.rmtree(work)
old_dir.mkdir(parents=True)
new_dir.mkdir(parents=True)

changed, added, deleted, gitlinks = [], [], [], []
file_modes = {}
staged_bytes = 0
for rel in sorted(set(base_files) | set(modified_files)):
    old_entry = base_files.get(rel)
    new_entry = modified_files.get(rel)
    old_mode = old_entry[0] if old_entry else None
    new_mode = new_entry[0] if new_entry else None
    # Git index objects are immutable at the pinned source commits. Skip identical
    # objects before reading files, especially unchanged symlinks/submodules.
    if old_entry is not None and old_entry == new_entry:
        if old_mode == '160000':
            gitlinks.append(str(rel))
        continue
    if old_mode == '160000' or new_mode == '160000':
        if old_entry != new_entry:
            raise SystemExit(f'CryptPad modifies Git submodule pointer: {rel}; manual source review required')
        gitlinks.append(str(rel))
        continue
    old = content(base, rel, old_mode)
    new = content(modified, rel, new_mode)
    if old == new and old_mode == new_mode:
        continue
    file_modes[str(rel)] = {'baseline': old_mode, 'cryptpad': new_mode}
    if old is not None and new is not None:
        changed.append(str(rel))
    elif old is None and new is not None:
        added.append(str(rel))
    elif old is not None and new is None:
        deleted.append(str(rel))
    else:
        raise SystemExit(f'Unsupported file-mode difference: {rel}')
    staged_bytes += len(old or b'') + len(new or b'')
    if staged_bytes > 300_000_000:
        raise SystemExit('Source delta exceeds 300 MB; manual source-version review required')
    if old is not None:
        dest = old_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(old)
    if new is not None:
        dest = new_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(new)

if not changed and not added and not deleted:
    raise SystemExit('No CryptPad adaptations detected; source-port cannot proceed')

manifest = {
    'format': 2,
    'baseline': 'ONLYOFFICE/core v9.3.0.140',
    'modified': 'cryptpad/onlyoffice-x2t-wasm pinned subtree',
    'coreTarget': str(official),
    'baselineDir': str(old_dir),
    'modifiedDir': str(new_dir),
    'changed': changed,
    'new': added,
    'deleted': deleted,
    'gitlinksUnmodified': gitlinks,
    'stagedBytes': staged_bytes,
    'fileModes': file_modes,
}
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Prepared three-way WASM port: {len(changed)} modified, {len(added)} added, '
      f'{len(deleted)} deleted files; {staged_bytes:,} staged bytes')
print('This is a source-port attempt, not proof that the resulting C++ can compile.')
