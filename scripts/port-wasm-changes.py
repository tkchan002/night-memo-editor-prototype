#!/usr/bin/env python3
"""Prepare a strict three-source port of CryptPad's Emscripten modifications.

Reference: ONLYOFFICE/core v9.3.0.140 (per CryptPad's README).
Modified: cryptpad/onlyoffice-x2t-wasm core/ at pinned recipe revision.
Target: *exact* Euro-Office core gitlink from selected DocumentServer release.

Creates text patch + new source file overlay. No automatic overwrite of the target
with an older core. Patches require zero fuzz. Refuses huge/unexpected diffs.
"""
import difflib, hashlib, json, pathlib, shutil, subprocess, sys
if len(sys.argv)!=5: raise SystemExit('usage: port-wasm-changes.py BASELINE MODIFIED OFFICIAL_CORE REPORT')
base, modified, official, report=map(pathlib.Path,sys.argv[1:])
work=report.parent/'wasm-port'; work.mkdir(exist_ok=True,parents=True)
objects=work/'new'; objects.mkdir(exist_ok=True)
patch=work/'core-changes.patch'

def tracked(root):
    # CryptPad's core is a git-tracked subdirectory, while baseline is a repo root.
    result=subprocess.run(['git','-C',str(root),'ls-files','-z'],capture_output=True,check=True)
    return {pathlib.Path(p.decode()) for p in result.stdout.split(b'\0') if p}

base_files=tracked(base)
modified_files=tracked(modified)
# cryptpad tracked source from repo subdir should be relative to /core.
if not modified_files: raise SystemExit('CryptPad core source does not contain tracked files')
new=[]; changed=[]; deleted=[]; skipped_binary=[]; diffs=[]; diff_bytes=0
for rel in sorted(base_files|modified_files):
    left=base/rel; right=modified/rel
    a=left.read_bytes() if left.is_file() else None
    b=right.read_bytes() if right.is_file() else None
    if a==b:continue
    if a is None:
        if b'\0' in b: skipped_binary.append(str(rel));continue
        output=objects/rel; output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(b)
        new.append(str(rel));continue
    if b is None:
        deleted.append(str(rel));continue
    if b'\0' in a[:8192] or b'\0' in b[:8192]:
        skipped_binary.append(str(rel));continue
    try:
        old=a.decode('utf-8'); current=b.decode('utf-8')
    except UnicodeDecodeError:
        skipped_binary.append(str(rel));continue
    if len(a)+len(b)>4_000_000: raise SystemExit(f'Refusing huge source delta for {rel}')
    lines=list(difflib.unified_diff(old.splitlines(keepends=True),current.splitlines(keepends=True),
      fromfile='a/'+str(rel),tofile='b/'+str(rel),n=3))
    if lines:
        diff=''.join(lines)
        # Some source files are missing final LF; patch can fail safely.
        diff_bytes+=len(diff.encode())
        if diff_bytes>20_000_000:raise SystemExit('CryptPad delta exceeds 20 MB; requires manual review')
        diffs.append(diff)
        changed.append(str(rel))
if not changed: raise SystemExit('No WASM adaptations detected; refusing to replace target core')
patch.write_text(''.join(diffs))
manifest={'baseline':'ONLYOFFICE/core v9.3.0.140','modified':'cryptpad/onlyoffice-x2t-wasm pinned subtree',
          'changed':changed,'new':new,'deleted':deleted,'skippedBinary':skipped_binary,
          'patchPath':str(patch),'newDir':str(objects),'coreTarget':str(official)}
report.write_text(json.dumps(manifest,indent=2)+'\n')
print(f'WASM delta: {len(changed)} modified text, {len(new)} added, {len(deleted)} deleted, {len(skipped_binary)} binary unchanged/not transplanted')
print('NOTE: Source-level port is experimental; differences are checked before compilation.')
