"""Shared validation of source-tree symlink targets for the WASM port.

Git symlinks are stored as paths, not dereferenceable file contents. A link
must be relative and stay within the source tree, even through other symlinks.
This is not a general-purpose symlink rewriting policy.
"""
import pathlib
import posixpath


def validate_target(root, name, value):
    root = pathlib.Path(root).resolve()
    name = pathlib.PurePosixPath(str(name))
    if not value or '\0' in value or posixpath.isabs(value):
        raise ValueError(f'Unsafe symlink target for {name}: {value!r}')
    normalized = posixpath.normpath(posixpath.join(str(name.parent), value))
    if normalized in ('.', '..') or normalized.startswith('../') or normalized.startswith('/'):
        raise ValueError(f'Symlink escapes source tree: {name} -> {value!r}')
    try:
        resolved = (root / normalized).resolve(strict=False)
    except (RuntimeError, OSError) as exc:
        raise ValueError(f'Symlink resolution failed for {name}: {exc}') from exc
    if not resolved.is_relative_to(root):
        raise ValueError(f'Symlink resolves outside source tree: {name} -> {value!r}')
    return value
