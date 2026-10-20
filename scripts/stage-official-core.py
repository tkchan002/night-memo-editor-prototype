#!/usr/bin/env python3
"""Stage the release-matched EuroOffice core and only explicitly approved patches."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

HEX40 = re.compile(r'[a-f0-9]{40}\Z')
HEX64 = re.compile(r'[a-f0-9]{64}\Z')
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]*\.patch\Z')
SAFE_PATH = re.compile(r'[A-Za-z0-9_./+@-]+\Z')

class StagingError(Exception):
    pass

def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True)
    if result.returncode:
        raise StagingError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()

def parse_patch_paths(data):
    paths = []
    for line in data.splitlines():
        if line.startswith('diff --git '):
            match = re.fullmatch(r'diff --git a/(.+) b/(.+)', line)
            if not match or match.group(1) != match.group(2):
                raise StagingError('Patch renames and malformed diff headers are forbidden')
            path = match.group(1)
            if (not SAFE_PATH.fullmatch(path) or path.startswith('/') or
                any(part in ('', '.', '..', '.git') for part in path.split('/'))):
                raise StagingError(f'Unsafe patch path: {path}')
            paths.append(path)
        if line.startswith(('new file mode 120000', 'old mode 120000', 'new mode 120000')):
            raise StagingError('Patching symlinks is not permitted automatically')
    if not paths:
        raise StagingError('Patch has no file-level diffs')
    return sorted(set(paths))

def validate_plan(core, manifest_file, patches_dir, expected_sha):
    if not HEX40.fullmatch(expected_sha):
        raise StagingError('Expected official core commit must be exactly 40 lowercase hexadecimal characters')
    if not (core / '.git').exists():
        raise StagingError('The official source must be a Git checkout')
    actual_sha = git(core, 'rev-parse', 'HEAD')
    if actual_sha != expected_sha:
        raise StagingError(f'Official source SHA mismatch: expected {expected_sha}, got {actual_sha}')
    if git(core, 'status', '--porcelain', '--untracked-files=no'):
        raise StagingError('Official source has modified tracked files')
    manifest = json.loads(manifest_file.read_text())
    if not isinstance(manifest, dict) or manifest.get('schema') != 1 or not isinstance(manifest.get('patches'), list):
        raise StagingError('Unsupported patch manifest schema')
    entries = manifest['patches']
    if entries and manifest.get('coreCommit') != expected_sha:
        raise StagingError('Patches are not approved for this exact official core commit')
    if len(entries) != len({e.get('file') for e in entries if isinstance(e, dict)}):
        raise StagingError('Duplicate patch filenames in manifest')
    validated = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise StagingError('Patch entry must be an object')
        name, digest, allowed = entry.get('file'), entry.get('sha256'), entry.get('allowedPaths')
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise StagingError(f'Invalid patch filename: {name}')
        if not isinstance(digest, str) or not HEX64.fullmatch(digest):
            raise StagingError(f'Invalid SHA-256 for {name}')
        if not isinstance(allowed, list) or not allowed or not all(isinstance(v, str) for v in allowed):
            raise StagingError(f'Patch {name} requires an explicit allowedPaths array')
        patch = patches_dir / name
        if not patch.is_file() or patch.is_symlink():
            raise StagingError(f'Patch missing or symlink: {name}')
        if sha256(patch) != digest:
            raise StagingError(f'Patch integrity SHA-256 mismatch: {name}')
        paths = parse_patch_paths(patch.read_text())
        if set(paths) != set(allowed):
            raise StagingError(f'Patch {name} touches {paths}, not approved {allowed}')
        validated.append({'file': name, 'sha256': digest, 'paths': paths, 'absolute': str(patch.resolve())})
    return validated

def stage(source, output, manifest_path, patches_dir, expected_sha, report_path):
    source = Path(source).resolve()
    output = Path(output).resolve()
    manifest_path = Path(manifest_path).resolve()
    patches_dir = Path(patches_dir).resolve()
    report_path = Path(report_path).resolve()
    if output == source or source in output.parents or output in source.parents:
        raise StagingError('Source and staged core paths must not overlap')
    entries = validate_plan(source, manifest_path, patches_dir, expected_sha)
    if output.exists():
        raise StagingError(f'Staging output already exists (do not overwrite): {output}')
    try:
        shutil.copytree(source, output, symlinks=True, ignore=shutil.ignore_patterns('.git'))
        for entry in entries:
            patch = entry['absolute']
            for args in (['git', 'apply', '--check', '--binary', patch], ['git', 'apply', '--binary', patch]):
                result = subprocess.run(args, cwd=output, capture_output=True, text=True)
                if result.returncode:
                    raise StagingError(f"Patch {entry['file']} failed ({' '.join(args[2:])}): {result.stderr.strip()}")
        report = {
          'schema': 1, 'sourceMode': 'official-eurooffice-first',
          'officialCoreCommit': expected_sha,
          'sourceModifiedInPlace': False,
          'cryptpadModifiedCoreImported': False,
          'patchCount': len(entries),
          'patches': [{k: entry[k] for k in ('file', 'sha256', 'paths')} for entry in entries],
        }
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + '\n')
        return report
    except BaseException:
        shutil.rmtree(output, ignore_errors=True)
        raise

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--manifest', required=True)
    p.add_argument('--patches-dir', required=True)
    p.add_argument('--core-sha', required=True)
    p.add_argument('--report', required=True)
    a = p.parse_args()
    try:
        report = stage(a.source, a.output, a.manifest, a.patches_dir, a.core_sha, a.report)
        print('STAGED official EuroOffice core', report['officialCoreCommit'],
              'explicit patches:', report['patchCount'])
    except (StagingError, OSError, ValueError, json.JSONDecodeError) as e:
        print(f'EUROOFFICE CORE STAGING FAILED: {e}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
