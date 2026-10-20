#!/usr/bin/env python3
import pathlib,sys
if len(sys.argv)!=3: raise SystemExit('usage: combine-dockerfile.py recipe destination')
recipe=pathlib.Path(sys.argv[1]).read_text()
dest=pathlib.Path(sys.argv[2]); addition=dest.read_text()
if 'FROM base AS build' not in recipe or 'COPY core /core' not in recipe: raise SystemExit('Unexpected recipe Dockerfile layout')
if 'FROM scratch AS eurooffice-converter-export' in recipe: raise SystemExit('Already patched')
dest.write_text(recipe+'\n'+addition)
