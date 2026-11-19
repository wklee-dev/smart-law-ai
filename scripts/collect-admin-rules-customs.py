# -*- coding: utf-8 -*-
import requests
import xml.etree.ElementTree as ET
import sqlite3

API_KEY = "hanjoo_api"
DB = r"D:\SQLiteDB\raw_rule.db"
GUBUN = "관세관련"

def get_text(node, tag):
    if node is None:
        return ""
    res = node.find(tag)
    if res is None:
        return ""
    return (res.text or "").strip() or "".join(res.itertext()).strip()

def get_admin_rule_details(sn):
    r = requests.get(
        "http://www.law.go.kr/DRF/adminRulService.do",
        params={"OC": API_KEY, "target": "admrul", "ADM": sn, "type": "XML"},
        timeout=15,
    )
    if r.status_code != 200:
        return None
    root = ET.fromstring(r.content)
    base = root.find("기본정보")
    if base is None:
        return None
    return {
        "law_id": sn,
        "law_name": get_text(base, "행정규칙명"),
        "law_type": get_text(base, "행정규칙종류명"),
        "promulgation_date": get_text(base, "발령일자"),
        "promulgation_number": get_text(base, "발령번호"),
        "department": get_text(base, "소관부처명"),
        "enforcement_date": get_text(base, "시행일자"),
        "content": get_text(root, "본문내용"),
    }

def save_row(info):
    conn = sqlite3.connect(DB)
    conn.execute(
        """INSERT OR REPLACE INTO raw
        (law_id, law_name, law_type, promulgation_date, promulgation_number,
         department, enforcement_date, content, gubun)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            info["law_id"],
            info["law_name"],
            info["law_type"],
            info["promulgation_date"],
            info["promulgation_number"],
            info["department"],
            info["enforcement_date"],
            info["content"],
            GUBUN,
        ),
    )
    conn.commit()
    conn.close()

# Search admin rules for 관세
r = requests.get(
    "http://www.law.go.kr/DRF/adminRulSearch.do",
    params={
        "OC": API_KEY,
        "target": "admrul",
        "query": "관세",
        "type": "XML",
        "display": 100,
    },
    timeout=15,
)
print("status", r.status_code, "len", len(r.content))
if r.status_code != 200 or not r.content.strip():
    print("empty response")
    raise SystemExit(1)

root = ET.fromstring(r.content)
items = root.findall(".//admrul")
print("found", len(items))

saved = 0
types = {}
for item in items:
    sn = item.findtext("행정규칙일련번호")
    kind = (item.findtext("행정규칙종류") or "").strip()
    name = (item.findtext("행정규칙명") or "")[:50]
    types[kind] = types.get(kind, 0) + 1
    if not sn:
        continue
    # filter 고시 훈령 공고 only
    if kind not in ("고시", "훈령", "공고", "예규"):
        continue
    info = get_admin_rule_details(sn)
    if info and info["law_name"]:
        save_row(info)
        saved += 1
        print(f"[+] {kind}: {info['law_name'][:55]}")

print("types in search:", types)
print("saved admin rules:", saved)
