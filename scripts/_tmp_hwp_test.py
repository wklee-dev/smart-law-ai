# -*- coding: utf-8 -*-
import re
import sys
import zlib
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import olefile

sys.stdout.reconfigure(encoding="utf-8")


def utf16_strings(data: bytes) -> str:
    s = data.decode("utf-16-le", errors="ignore")
    out = []
    for ch in s:
        o = ord(ch)
        if ch in "\n\r":
            out.append("\n")
        elif ch == "\t":
            out.append(" ")
        elif (
            0x20 <= o <= 0x7E
            or 0xAC00 <= o <= 0xD7A3
            or 0x3131 <= o <= 0x318E
            or o
            in (
                0x3000,
                0x201C,
                0x201D,
                0x2018,
                0x2019,
                0x00B7,
                0x2022,
                0x300C,
                0x300D,
            )
        ):
            out.append(ch)
        elif ch in "·•○●※【】〔〕<>()[]{}.,;:%/-~'\"“”‘’":
            out.append(ch)
    text = "".join(out)
    text = re.sub(r"[^\S\n]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_hwp(path: Path) -> str:
    if path.suffix.lower() == ".hwpx":
        return extract_hwpx(path)
    if not olefile.isOleFile(str(path)):
        return ""
    ole = olefile.OleFileIO(str(path))
    chunks = []
    try:
        entries = [e for e in ole.listdir() if e and e[0] == "BodyText"]
        entries.sort(key=lambda e: e[1] if len(e) > 1 else "")
        for entry in entries:
            data = ole.openstream(entry).read()
            raw = None
            for wbits in (-15, 15):
                for off in (0, 1, 2, 4, 5, 16):
                    try:
                        raw = zlib.decompress(data[off:], wbits)
                        break
                    except Exception:
                        continue
                if raw is not None:
                    break
            if raw is None:
                raw = data
            t = utf16_strings(raw)
            if t:
                chunks.append(t)
    finally:
        ole.close()
    return re.sub(r"\n{3,}", "\n\n", "\n\n".join(chunks)).strip()


def extract_hwpx(path: Path) -> str:
    texts = []
    with zipfile.ZipFile(path) as z:
        names = sorted(
            n for n in z.namelist() if "section" in n.lower() and n.endswith(".xml")
        )
        for n in names:
            root = ET.fromstring(z.read(n))
            for el in root.iter():
                tag = el.tag.rsplit("}", 1)[-1]
                if tag in ("t", "char", "T") and el.text:
                    texts.append(el.text)
                elif el.text and re.search(r"[가-힣A-Za-z]", el.text):
                    texts.append(el.text)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(texts)).strip()


# sample bilateral
root = Path(r"D:/SQLiteDB/attachments/조약협정")
# find a 양자 hwp - from db
import sqlite3

conn = sqlite3.connect(r"D:/SQLiteDB/smart_law_ai.db")
row = conn.execute(
    """
    SELECT a.relative_path, a.file_name, t.category_name
    FROM clip_treaty_attachments a
    JOIN clip_treaties t ON t.trty_srno=a.trty_srno
    WHERE t.category_name='양자조약' AND a.relative_path IS NOT NULL
    LIMIT 1
    """
).fetchone()
print("row", row)
if row:
    p = Path(r"D:/SQLiteDB") / row[0].replace("\\", "/")
    print("exists", p.exists(), p)
    t = extract_hwp(p)
    print("chars", len(t))
    print(t[:800])
conn.close()
