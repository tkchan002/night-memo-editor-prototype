#!/usr/bin/env python3
"""Audit pinned CryptPad *build tooling* and generate an inspectable Docker adapter.

The bundled CryptPad /core tree is never used. The adapter defines the absent
`gumbo` stage from the pinned recipe, built from its `html` dependency stage.
No EuroOffice source is rewritten here.
"""
import argparse
import hashlib
import glob
import shlex
import json
from pathlib import Path
import re
import subprocess
import sys

RECIPE_COMMIT = '95f775fd3c42fae9e9af66ca072d3da3763e6c76'
CONVERTER_EXPORT = '''
# Local EuroOffice-first adapter: export the two artifacts from one build.
FROM scratch AS eurooffice-converter-export
COPY --from=build /core/build/bin/linux_64/x2t.js /x2t.js
COPY --from=build /core/build/bin/linux_64/x2t.wasm /x2t.wasm
'''
DOCTRENDERER_STUBS = {
    'doctrenderer_empty.cpp': 'doctrenderer.cpp',
    'docbuilder_empty.cpp': 'docbuilder.cpp',
    'docbuilder_p_empty.cpp': 'docbuilder_p.cpp',
}
GUMBO_STAGE = '''
# Local EuroOffice-first adapter: pinned recipe referenced "gumbo" but
# did not declare that stage. The original "html" stage fetches gumbo-parser
# from EuroOffice's official Common/3dParty/html/fetch.py.
FROM html AS gumbo
WORKDIR /core/Common/3dParty/html/gumbo-parser
RUN . /emsdk/emsdk_env.sh \\
    && autoreconf -fi \\
    && emconfigure ./configure --disable-shared \\
    && emmake make \\
    && install -Dm644 .libs/libgumbo.a /usr/local/lib/libgumbo.a \\
    && cp -a /core/Common/3dParty/html/gumbo-parser /gumbo-parser
'''


def build_recipe(dockerfile):
    if not re.search(r'(?m)^FROM base AS build$', dockerfile):
        raise ValueError('Expected pinned CryptPad build stage missing')
    if not re.search(r'(?m)^COPY core /core$', dockerfile):
        raise ValueError('Expected source COPY missing (refuse recipe drift)')
    if 'FROM scratch AS eurooffice-converter-export' in dockerfile:
        raise ValueError('Output adapter already present')
    if not re.search(r'(?m)^COPY --from=gumbo\s', dockerfile):
        raise ValueError('Expected Gumbo dependency changed; review adapter')
    if re.search(r'(?m)^FROM \S+ AS gumbo$', dockerfile):
        raise ValueError('Gumbo stage now exists upstream; review obsolete adapter')
    result = dockerfile.replace('FROM base AS fb2file', GUMBO_STAGE + '\nFROM base AS fb2file', 1)
    if result == dockerfile:
        raise ValueError('Expected fb2file stage missing')
    # The upstream recipe uses three _empty.cpp compatibility implementations
    # which do not exist in the *official* EuroOffice source. The three pinned
    # CryptPad files are staged separately into wasm-compat/; COPY replaces
    # the normal implementation only inside Docker's doctrenderer build stage.
    # This leaves the original staged official core completely untouched.
    for stub, target in DOCTRENDERER_STUBS.items():
        original = (f'RUN cp /core/DesktopEditor/doctrenderer/{stub} '
                    f'/core/DesktopEditor/doctrenderer/{target}')
        replacement = (f'COPY wasm-compat/{stub} '
                       f'/core/DesktopEditor/doctrenderer/{target}')
        if result.count(original + '\n') != 1:
            raise ValueError(f'Expected exact pinned doctrenderer command missing or duplicated: {original}')
        result = result.replace(original + '\n', replacement + '\n', 1)
    if re.search(r'(?m)^RUN cp /core/DesktopEditor/doctrenderer/\S+_empty\.cpp', result):
        raise ValueError('Unreviewed WASM doctrenderer stub found')
    result += CONVERTER_EXPORT
    validate_reachable_stages(result)
    return result


def validate_reachable_stages(recipe, target='eurooffice-converter-export'):
    stages = {}
    active = None
    for line in recipe.splitlines():
        header = re.match(r'^FROM\s+(\S+)\s+AS\s+([\w-]+)', line, re.I)
        if header:
            base, active = header.groups()
            if active in stages:
                raise ValueError(f'Duplicate stage: {active}')
            stages[active] = set([base]) if base in stages else set()
        if active:
            for dependency in re.findall(r'COPY\s+--from=([\w-]+)', line):
                stages[active].add(dependency)
    if target not in stages:
        raise ValueError(f'Missing Docker target: {target}')
    todo, checked = [target], set()
    while todo:
        stage = todo.pop()
        if stage in checked:
            continue
        checked.add(stage)
        if stage not in stages:
            raise ValueError(f'Docker recipe references undefined internal stage: {stage}')
        todo.extend(stages[stage] - checked)
    return sorted(checked)


def audit_docker_inputs(context_dir, dockerfile):
    """Fail before expensive Docker builds when a local COPY source is absent."""
    context = Path(context_dir).resolve()
    missing = []
    count = 0
    # Fold Docker instruction continuations but leave RUN commands unexamined.
    logical = re.sub(r'\\\s*\n\s*', ' ', dockerfile)
    for number, line in enumerate(logical.splitlines(), start=1):
        if not re.match(r'^\s*COPY\s+', line, re.I):
            continue
        payload = re.sub(r'^\s*COPY\s+', '', line, flags=re.I).strip()
        if payload.startswith('['):
            arguments = __import__('json').loads(payload)
        else:
            arguments = shlex.split(payload, comments=True)
        if not isinstance(arguments, list) or len(arguments) < 2:
            raise ValueError(f'Invalid Docker COPY instruction near line {number}')
        # Docker accepts option flags before COPY source entries; --from uses
        # another build stage (not an input from our local build context).
        while arguments and arguments[0].startswith('--'):
            flag = arguments.pop(0)
            if flag == '--from':
                if not arguments:
                    raise ValueError('Docker COPY --from has no value')
                arguments.pop(0)
                arguments = []
                break
            if flag.startswith('--from='):
                arguments = []
                break
            if flag in ('--chown', '--chmod'):
                if not arguments:
                    raise ValueError(f'Docker COPY {flag} has no value')
                arguments.pop(0)
        if not arguments:
            continue
        if len(arguments) < 2:
            raise ValueError(f'Docker COPY missing destination near line {number}')
        for raw in arguments[:-1]:
            if not isinstance(raw, str):
                raise ValueError('Docker COPY path must be a string')
            name = raw.lstrip('/')
            if (not name or '$' in name or name.startswith('../') or
                '/..' in name.split('*')[0].split('?')[0] or '\x00' in name):
                raise ValueError(f'Docker COPY path requires manual review: {raw}')
            pattern = context / name
            paths = glob.glob(str(pattern), recursive=False)
            if not paths:
                missing.append(f'COPY {raw} (Dockerfile line {number})')
            else:
                for item in paths:
                    candidate = Path(item).resolve()
                    if candidate != context and context not in candidate.parents:
                        raise ValueError(f'Docker COPY input escapes context: {raw}')
                count += len(paths)
    if missing:
        example = '\n  '.join(missing[:25])
        raise ValueError(f'Missing {len(missing)} Docker local COPY sources:\n  {example}')
    return count


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--recipe', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--report', required=True)
    p.add_argument('--context', required=True, help='full prepared Docker build context')
    a = p.parse_args()
    root = Path(a.recipe).resolve()
    cmd = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], capture_output=True, text=True)
    if cmd.returncode or cmd.stdout.strip() != RECIPE_COMMIT:
        raise SystemExit('CryptPad recipe checkout does not match pinned commit')
    source = (root / 'Dockerfile').read_text()
    modified = build_recipe(source)
    input_count = audit_docker_inputs(a.context, modified)
    out = Path(a.out)
    out.write_text(modified)
    report = {
        'schema': 1,
        'builderRecipe': f'cryptpad/onlyoffice-x2t-wasm@{RECIPE_COMMIT}',
        'builderOnly': True,
        'modifiedCryptpadCoreImported': False,
        'sourceDockerfileSha256': hashlib.sha256(source.encode()).hexdigest(),
        'adaptedDockerfileSha256': hashlib.sha256(modified.encode()).hexdigest(),
        'adapterOperations': [
            'Add missing Gumbo Emscripten dependency stage from HTML source fetch',
            'Copy exactly three SHA-recorded pinned WASM doctrenderer stubs into Docker stage only',
            'Export x2t.js and x2t.wasm from the same build stage',
        ],
        'reachableStages': validate_reachable_stages(modified),
        'dockerLocalCopyInputsAudited': input_count,
    }
    report_file = Path(a.report)
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report_file.write_text(json.dumps(report, indent=2) + '\n')
    print('Prepared pinned builder adapter, required stages:', len(report['reachableStages']))

if __name__ == '__main__':
    main()
