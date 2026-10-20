#!/usr/bin/env python3
"""Extract exactly three pinned CryptPad doctrenderer WASM stubs.

EuroOffice's staged core stays untouched. The stubs live outside /core in
Docker's build context, and the recipe adapter selects them only in the
isolated doctrenderer build stage. No bulk source transplant is permitted.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

RECIPE_COMMIT = '95f775fd3c42fae9e9af66ca072d3da3763e6c76'
SUBDIR = 'DesktopEditor/doctrenderer'
STUBS = {
    'doctrenderer_empty.cpp': 'doctrenderer.cpp',
    'docbuilder_empty.cpp': 'docbuilder.cpp',
    'docbuilder_p_empty.cpp': 'docbuilder_p.cpp',
}
MAX_FILE_SIZE = 512 * 1024


class CompatibilityError(Exception):
    pass


def git_bytes(repository, *args):
    result = subprocess.run(['git', '-C', str(repository), *args], capture_output=True)
    if result.returncode:
        message = result.stderr.decode('utf-8', 'replace').strip()
        raise CompatibilityError(f'git {" ".join(args)} failed: {message}')
    return result.stdout


def extract_stubs(recipe_path, official_core_path, expected_commit=RECIPE_COMMIT):
    recipe = Path(recipe_path).resolve()
    core = Path(official_core_path).resolve()
    out = recipe / 'wasm-compat'
    if not (recipe / '.git').exists():
        raise CompatibilityError('Expected a Git checkout for pinned CryptPad build tooling')
    head = git_bytes(recipe, 'rev-parse', 'HEAD').decode().strip()
    if head != expected_commit:
        raise CompatibilityError(f'Pinned CryptPad builder mismatch: {head} != {expected_commit}')
    if not re.fullmatch(r'[a-f0-9]{40}', expected_commit):
        raise CompatibilityError('Invalid pinned Git commit')
    if out.exists() or out.is_symlink():
        raise CompatibilityError('Compatibility output already exists; refuse overwrite')
    docdir = core / SUBDIR
    if core.is_symlink() or docdir.is_symlink() or not docdir.is_dir():
        raise CompatibilityError('Staged EuroOffice doctrenderer directory missing or unsafe')
    # Check all source targets first, including the next two cp operations.
    for target in STUBS.values():
        destination = docdir / target
        if not destination.is_file() or destination.is_symlink():
            raise CompatibilityError(f'Expected regular official EuroOffice source missing: {SUBDIR}/{target}')
    tmp = Path(tempfile.mkdtemp(prefix='.wasm-compat-tmp-', dir=recipe))
    metadata = []
    try:
        for source, target in STUBS.items():
            git_path = f'core/{SUBDIR}/{source}'
            listing = git_bytes(recipe, 'ls-tree', expected_commit, '--', git_path).decode('utf-8', 'replace').strip()
            match = re.fullmatch(r'100644 blob ([a-f0-9]{40})\t(.+)', listing)
            if not match or match.group(2) != git_path:
                raise CompatibilityError(f'Expected pinned regular-file WASM stub missing: {git_path}')
            length = int(git_bytes(recipe, 'cat-file', '-s', f'{expected_commit}:{git_path}').strip())
            if length < 100 or length > MAX_FILE_SIZE:
                raise CompatibilityError(f'Stub has unexpected size ({length}): {git_path}')
            data = git_bytes(recipe, 'show', f'{expected_commit}:{git_path}')
            if len(data) != length:
                raise CompatibilityError(f'Stub byte count mismatch: {git_path}')
            (tmp / source).write_bytes(data)
            metadata.append({
                'cryptpadPath': git_path,
                'dockerContextPath': f'wasm-compat/{source}',
                'dockerTarget': f'/core/{SUBDIR}/{target}',
                'gitBlob': match.group(1),
                'size': len(data),
                'sha256': hashlib.sha256(data).hexdigest(),
            })
        tmp.rename(out)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return {
        'schema': 1,
        'sourceMode': 'pinned-cryptpad-wasm-compatibility-only',
        'builderCommit': expected_commit,
        'officialCoreUnmodified': True,
        'fullCryptpadCoreImported': False,
        'stubCount': len(metadata),
        'stubs': metadata,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--recipe', required=True)
    p.add_argument('--official-core', required=True)
    p.add_argument('--report', required=True)
    args = p.parse_args()
    try:
        result = extract_stubs(args.recipe, args.official_core)
        report = Path(args.report)
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(result, indent=2) + '\n')
        print('STAGED three pinned doctrenderer WASM compatibility files (official core unchanged)')
        for entry in result['stubs']:
            print('  ', entry['cryptpadPath'], entry['sha256'])
    except (CompatibilityError, OSError, ValueError) as error:
        print(f'WASM COMPATIBILITY STAGING FAILED: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
