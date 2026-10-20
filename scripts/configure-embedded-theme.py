#!/usr/bin/env python3
"""Apply a minimal, checked Modern Light setting to pinned Ranuts source.

Only the embedded document editor gets theme-white. Standalone Ranuts
retains its upstream theme preference behavior.

Usage:
    python3 scripts/configure-embedded-theme.py --check PATH
    python3 scripts/configure-embedded-theme.py --apply PATH

Never use broad text replacement: every anchor must appear exactly once.
A version change with different upstream code must fail loudly.
"""
import argparse
from pathlib import Path
import sys

ANCHOR = "export const UI_THEME_STORAGE_KEY = 'ui-theme-id';"
OLD_RETURN = '  return resolveEditorUiTheme(DEFAULT_UI_THEME);'
OLD_OBSERVER = (
    "if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {"
)
EMBEDDED_THEME = '''const EMBED_UI_THEME = 'theme-white';

function isEmbeddedEditor(): boolean {
  if (typeof window === 'undefined') return false;
  // Also support Ranuts's standalone ?embed=1 route.
  const query = new URLSearchParams(window.location.search);
  return window.parent !== window || ['1', 'true', ''].includes(query.get('embed') ?? 'absent');
}
'''
NEW_RETURN = '  if (isEmbeddedEditor()) return EMBED_UI_THEME;\n' + OLD_RETURN
NEW_OBSERVER = OLD_OBSERVER[:-3] + ' && !isEmbeddedEditor()) {'


def transform(text: str) -> str:
    # An already transformed input is valid ONLY when all changes match.
    finished = (
        EMBEDDED_THEME in text
        and NEW_RETURN in text
        and NEW_OBSERVER in text
        and text.count(EMBEDDED_THEME) == 1
        and text.count(NEW_RETURN) == 1
        and text.count(NEW_OBSERVER) == 1
    )
    if finished:
        return text
    # Prevent any half-applied changes or an accidental second insertion.
    if 'const EMBED_UI_THEME' in text or 'isEmbeddedEditor()' in text:
        raise ValueError('Partial or unexpected theme changes detected; refusing to alter source')
    for name, old in [('theme storage key', ANCHOR), ('theme return', OLD_RETURN),
                      ('site-theme observer', OLD_OBSERVER)]:
        if text.count(old) != 1:
            raise ValueError(f'Expected one {name} anchor, found {text.count(old)}; inspect pinned upstream')
    # Keep upstream declarations and comments otherwise identical.
    text = text.replace(ANCHOR, ANCHOR + '\n' + EMBEDDED_THEME, 1)
    text = text.replace(OLD_RETURN, NEW_RETURN, 1)
    text = text.replace(OLD_OBSERVER, NEW_OBSERVER, 1)
    return text


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument('--check', action='store_true', help='Verify anchors without changing source')
    modes.add_argument('--apply', action='store_true', help='Update editor theme without touching other code')
    p.add_argument('path', type=Path)
    args = p.parse_args()
    try:
        raw = args.path.read_bytes()
        if b'\r\n' in raw:
            raise ValueError('Unexpected CRLF in upstream theme source')
        source = raw.decode('utf-8')
        modified = transform(source)
        if args.check:
            if modified == source:
                print(f'PASS: Modern Light already configured: {args.path}')
            else:
                print(f'PASS: Pinned theme source accepts deterministic Modern Light transform: {args.path}')
        elif modified != source:
            args.path.write_text(modified, encoding='utf-8')
            print(f'PASS: Embedded editor Modern Light configured: {args.path}')
        else:
            print(f'PASS: Theme configuration already applied: {args.path}')
        return 0
    except (OSError, UnicodeError, ValueError) as exc:
        print(f'ERROR: Embedded theme configuration failed: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
