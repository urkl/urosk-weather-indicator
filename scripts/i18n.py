#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
# SPDX-License-Identifier: Apache-2.0
#
# Translation tooling without external dependencies (only the Python standard library),
# so translations can be built on systems without GNU gettext installed.
#
#   scripts/i18n.py extract            src/**/*.js → po/urosk-weather-indicator.pot
#   scripts/i18n.py update             merge the template into every po/<lang>.po
#   scripts/i18n.py compile <outdir>   po/<lang>.po → <outdir>/<lang>/LC_MESSAGES/<domain>.mo
#   scripts/i18n.py check              fail if a translation is missing or the template is stale
"""Extract, merge and compile gettext catalogs for the extension."""

import re
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOMAIN = "urosk-weather-indicator"
SOURCES = ROOT / "src"
PO_DIR = ROOT / "po"
TEMPLATE = PO_DIR / f"{DOMAIN}.pot"

STRING = r"'((?:[^'\\]|\\.)*)'"
CALLS = [
    (re.compile(r"\b(?:_|N_)\(\s*" + STRING + r"\s*\)"), False),
    (re.compile(r"\bngettext\(\s*" + STRING + r"\s*,\s*" + STRING), True),
]


def unescape_js(text):
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), text)


def escape_po(text):
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\t", "\\t")


def unescape_po(text):
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), text)


def extract():
    """Returns {(msgid, msgid_plural): [references]} in source order."""
    entries = {}
    for path in sorted(SOURCES.rglob("*.js")):
        text = path.read_text(encoding="utf-8")
        for pattern, plural in CALLS:
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                msgid = unescape_js(match.group(1))
                key = (msgid, unescape_js(match.group(2)) if plural else None)
                entries.setdefault(key, []).append(f"{path.relative_to(ROOT)}:{line}")
    return entries


def po_string(keyword, text):
    return f'{keyword} "{escape_po(text)}"\n'


def write_template(entries):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M+0000")
    out = [
        f"# Translation template for {DOMAIN}.\n",
        "# SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>\n",
        "# SPDX-License-Identifier: Apache-2.0\n",
        "#\n",
        'msgid ""\n',
        'msgstr ""\n',
        f'"Project-Id-Version: {DOMAIN}\\n"\n',
        f'"POT-Creation-Date: {now}\\n"\n',
        '"MIME-Version: 1.0\\n"\n',
        '"Content-Type: text/plain; charset=UTF-8\\n"\n',
        '"Content-Transfer-Encoding: 8bit\\n"\n',
        "\n",
    ]
    for (msgid, plural), refs in entries.items():
        out.append(f"#: {' '.join(refs)}\n")
        out.append(po_string("msgid", msgid))
        if plural is None:
            out.append('msgstr ""\n\n')
        else:
            out.append(po_string("msgid_plural", plural))
            out.append('msgstr[0] ""\nmsgstr[1] ""\n\n')
    TEMPLATE.write_text("".join(out), encoding="utf-8")


def parse_po(path):
    """Returns (header, {(msgid, msgid_plural): [msgstr…]}) of a po file."""
    entries, header = {}, ""
    current, field = {}, None

    def flush():
        if "msgid" in current:
            key = (current["msgid"], current.get("msgid_plural"))
            values = [current.get(f"msgstr[{i}]") for i in range(10) if f"msgstr[{i}]" in current]
            entries[key] = values or [current.get("msgstr", "")]
        current.clear()

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            if not line and "msgid" in current and field is not None:
                flush()
                field = None
            continue
        match = re.match(r'^(msgid_plural|msgid|msgstr(?:\[\d+\])?)\s+"(.*)"$', line)
        if match:
            if match.group(1) == "msgid" and "msgid" in current:
                flush()
            field = match.group(1)
            current[field] = unescape_po(match.group(2))
        elif line.startswith('"') and field:
            current[field] += unescape_po(line[1:-1])
    flush()
    header = entries.pop(("", None), [""])[0]
    return header, entries


def update():
    template_entries = extract()
    for po in sorted(PO_DIR.glob("*.po")):
        header, translations = parse_po(po)
        lines = ["# " + po.stem + " translation of " + DOMAIN + ".\n",
                 "# SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>\n",
                 "# SPDX-License-Identifier: Apache-2.0\n#\n",
                 'msgid ""\nmsgstr ""\n']
        lines += [f'"{escape_po(part)}\\n"\n' for part in header.split("\n") if part]
        lines.append("\n")
        for key, refs in template_entries.items():
            msgid, plural = key
            values = translations.get(key, [""] * (1 if plural is None else 4))
            lines.append(f"#: {' '.join(refs)}\n")
            lines.append(po_string("msgid", msgid))
            if plural is None:
                lines.append(po_string("msgstr", values[0]))
            else:
                lines.append(po_string("msgid_plural", plural))
                for i, value in enumerate(values):
                    lines.append(po_string(f"msgstr[{i}]", value))
            lines.append("\n")
        po.write_text("".join(lines), encoding="utf-8")
        print(f"updated {po.relative_to(ROOT)}")


def write_mo(path, header, entries):
    messages = {"": header}
    for (msgid, plural), values in entries.items():
        if not any(values):
            continue
        key = msgid if plural is None else f"{msgid}\0{plural}"
        messages[key] = "\0".join(values)
    keys = sorted(messages)
    ids = [k.encode("utf-8") for k in keys]
    strs = [messages[k].encode("utf-8") for k in keys]
    n = len(keys)
    offset_ids = 7 * 4
    offset_strs = offset_ids + n * 8
    data_start = offset_strs + n * 8
    id_table, str_table, blob = [], [], b""
    for item in ids:
        id_table.append((len(item), data_start + len(blob)))
        blob += item + b"\0"
    for item in strs:
        str_table.append((len(item), data_start + len(blob)))
        blob += item + b"\0"
    output = struct.pack("<7I", 0x950412DE, 0, n, offset_ids, offset_strs, 0, 0)
    output += b"".join(struct.pack("<2I", *entry) for entry in id_table)
    output += b"".join(struct.pack("<2I", *entry) for entry in str_table)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(output + blob)


def compile_all(outdir):
    for po in sorted(PO_DIR.glob("*.po")):
        header, entries = parse_po(po)
        target = Path(outdir) / po.stem / "LC_MESSAGES" / f"{DOMAIN}.mo"
        write_mo(target, header, entries)
        print(f"compiled {po.relative_to(ROOT)} → {target}")


def check():
    entries = extract()
    problems = []
    if not TEMPLATE.exists():
        problems.append("template missing, run scripts/i18n.py extract")
    else:
        _, template = parse_po(TEMPLATE)
        if set(template) != set(entries):
            problems.append("template is stale, run scripts/i18n.py extract && scripts/i18n.py update")
    for po in sorted(PO_DIR.glob("*.po")):
        _, translations = parse_po(po)
        for key in entries:
            if not any(translations.get(key, [""])):
                problems.append(f"{po.name}: missing translation for {key[0]!r}")
    for problem in problems:
        print(problem, file=sys.stderr)
    print(f"{len(entries)} strings, {len(list(PO_DIR.glob('*.po')))} translations, {len(problems)} problems")
    return 1 if problems else 0


def main(argv):
    command = argv[1] if len(argv) > 1 else ""
    if command == "extract":
        entries = extract()
        write_template(entries)
        print(f"{len(entries)} strings → {TEMPLATE.relative_to(ROOT)}")
    elif command == "update":
        update()
    elif command == "compile" and len(argv) > 2:
        compile_all(argv[2])
    elif command == "check":
        return check()
    else:
        print(__doc__ + "\nusage: scripts/i18n.py extract|update|compile <outdir>|check", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
