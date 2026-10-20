#!/usr/bin/env python3
"""Apply ported WASM source modifications to a copy of tagged Euro-Office core.
No fuzzy merges and no replacement of entire directories from older core.
"""
import json, pathlib, subprocess, shutil, sys
if len(sys.argv)!=3:raise SystemExit('usage: apply-wasm-port.py TARGET REPORT')
target=pathlib.Path(sys.argv[1]); manifest=json.loads(pathlib.Path(sys.argv[2]).read_text())
patch=pathlib.Path(manifest['patchPath'])
# Check all mandatory patch hunks on latest source before changing it.
if not patch.is_file():raise SystemExit('WASM source patch is absent')
check=['patch','--directory='+str(target),'--strip=1','--batch','--forward','--fuzz=0','--dry-run','--input='+str(patch)]
r=subprocess.run(check,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
if r.returncode:
    print(r.stdout[-10000:]); raise SystemExit('WASM port does not apply cleanly to this release. No old converter will be substituted.')
subprocess.run([*check[:-2],'--fuzz=0','--input='+str(patch)],check=True)
newdir=pathlib.Path(manifest['newDir'])
for name in manifest['new']:
    src=newdir/name; dst=target/name
    if dst.exists(): raise SystemExit(f'Added CryptPad file already exists in current core: {name}; manual merge required')
    dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
for name in manifest['deleted']:
    dst=target/name
    # Deletions require a manual merge because the target can have changed.
    if dst.exists(): raise SystemExit(f'CryptPad deletes {name}; automatic deletion is unsafe on new core')
print('Strict WASM source port applied successfully; compile still required.')
