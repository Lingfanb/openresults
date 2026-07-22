#!/usr/bin/env python3
"""Reject private data, broken local references, and unsafe files before Pages deploys."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".md", ".mjs", ".svg", ".txt", ".xml", ".yaml", ".yml"}
PRIVATE_PATTERNS = {
    "GitHub token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"),
    "authorization secret": re.compile(r"(?i)\b(?:authorization|api[-_]?key|access[-_]?token)\s*[:=]\s*['\"]?(?:bearer\s+)?[A-Za-z0-9_./+-]{16,}"),
    "Linux home path": re.compile(r"(?<![\w.])/home/[A-Za-z0-9._-]+/"),
    "macOS home path": re.compile(r"(?<![\w.])/Users/[A-Za-z0-9._-]+/"),
    "Windows home path": re.compile(r"(?i)\b[A-Z]:\\Users\\[^\\\s]+\\"),
    "localhost URL": re.compile(r"(?i)https?://(?:localhost|127\.0\.0\.1)(?::\d+)?"),
    "private IPv4 URL": re.compile(r"https?://(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?"),
}
REFERENCE_PATTERNS = {
    ".html": re.compile(r"(?:href|src|poster)\s*=\s*['\"]([^'\"]+)['\"]", re.IGNORECASE),
    ".svg": re.compile(r"(?:href|src|poster)\s*=\s*['\"]([^'\"]+)['\"]", re.IGNORECASE),
    ".md": re.compile(r"!?\[[^\]]*\]\(([^)\s]+)(?:\s+['\"][^)]*['\"])?\)"),
    ".css": re.compile(r"url\(\s*['\"]?([^'\")]+)", re.IGNORECASE),
}


def local_target(raw: str, source: Path) -> Path | None:
    value = unquote(raw.strip())
    if not value or value.startswith(("#", "data:", "mailto:", "tel:", "javascript:", "/")):
        return None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or value.startswith("//"):
        return None
    if not parsed.path or any(token in parsed.path for token in ("{{", "}}", "<%", "%>")):
        return None
    return (source.parent / parsed.path).resolve()


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    if not root.is_dir():
        print(f"error: not a directory: {root}", file=sys.stderr)
        return 2

    errors: list[str] = []
    warnings: list[str] = []
    files = [path for path in root.rglob("*") if path.is_file() and ".git" not in path.parts]
    for path in files:
        name = path.relative_to(root).as_posix()
        if path.is_symlink():
            errors.append(f"{name}: symlinks are not allowed")
            continue
        if path.stat().st_size > 100 * 1024 * 1024:
            warnings.append(f"{name}: file is larger than 100 MiB")
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"{name}: text file is not valid UTF-8")
            continue

        for label, pattern in PRIVATE_PATTERNS.items():
            for match in pattern.finditer(content):
                line = content.count("\n", 0, match.start()) + 1
                errors.append(f"{name}:{line}: contains {label}")

        reference_pattern = REFERENCE_PATTERNS.get(path.suffix.lower())
        if reference_pattern:
            for match in reference_pattern.finditer(content):
                raw = match.group(1)
                target = local_target(raw, path)
                if target is None:
                    continue
                try:
                    target.relative_to(root)
                except ValueError:
                    errors.append(f"{name}: reference escapes site root: {raw}")
                    continue
                if not target.exists():
                    errors.append(f"{name}: missing referenced file: {raw}")

    for warning in warnings:
        print(f"warning: {warning}")
    for error in errors:
        print(f"error: {error}", file=sys.stderr)
    print(f"audit: {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
