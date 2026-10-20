#!/usr/bin/env python3
"""Audit pinned CryptPad *build tooling* and generate an inspectable Docker adapter.

The bundled CryptPad /core tree is never used. The adapter defines the absent
`gumbo` stage from the pinned recipe, built from its `html` dependency stage.
No EuroOffice source is rewritten here.
"""
import argparse
import hashlib
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


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--recipe', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--report', required=True)
    a = p.parse_args()
    root = Path(a.recipe).resolve()
    cmd = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], capture_output=True, text=True)
    if cmd.returncode or cmd.stdout.strip() != RECIPE_COMMIT:
        raise SystemExit('CryptPad recipe checkout does not match pinned commit')
    source = (root / 'Dockerfile').read_text()
    modified = build_recipe(source)
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
            'Export x2t.js and x2t.wasm from the same build stage',
        ],
        'reachableStages': validate_reachable_stages(modified),
    }
    report_file = Path(a.report)
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report_file.write_text(json.dumps(report, indent=2) + '\n')
    print('Prepared pinned builder adapter, required stages:', len(report['reachableStages']))

if __name__ == '__main__':
    main()
