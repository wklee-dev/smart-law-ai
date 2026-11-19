# Tax Tribunal Decision-Case Collector

- **Version** : V1.2
- **Source** : Tax Tribunal (https://www.tt.go.kr) -> Decision cases -> **Customs** (`semok=90`)
- **Target DB** : `D:\SQLiteDB\smart_law_ai.db` (existing DB reused, new tables only)
- **New table prefix** : `tb_tt_`

---

## 1. Collection flow

```
[Stage 1] LIST                                  [Stage 2] DETAIL
/mUser/dem/demList.do?semok=90&pageNumber=N          /mUser/dem/demView.do?semok=90&dem_no=...
        |                                                    |
        +- decision date / claim no / decision type          +- document no / category / type / date
        +- title / list summary                              +- attachment (HWP) metadata
        +- dem_no (site key)                                 +- /mUser/common/xmlViewer.do?dem_no=..
                 |                                                    |
        tb_tt_case_list (staging)                    [claim_no][semok][type][title][summary]
                                                     [related law][ref][followed][order][reason]
                                                                      |
                                          tb_tt_case / tb_tt_case_body / tb_tt_attach
```

## 2. Install

```bat
pip install -r requirements.txt
```

## 3. Batch files (run one at a time)

| No | File | Mode | Description |
|---|---|---|---|
| 01 | `01_init_db.bat` | init-db | Create new tables (tb_tt_*) + backup. Run once first. |
| 02 | `02_check_db.bat` | check-db | Show existing/new tables and collection status (read-only). |
| 03 | `03_list_test.bat` | list | Collect 1 list page only (10 rows) - connectivity test. |
| 04 | `04_list_all.bat` | list | Collect the whole list (414 pages / 4,140 rows). |
| 05 | `05_detail_test.bat` | detail | Collect 10 details only - parsing test. |
| 06 | `06_detail_all.bat` | detail | Collect all pending details (body + metadata). |
| 07 | `07_full_all.bat` | full | Full collection: list + detail. |
| 08 | `08_resume.bat` | resume | Continue pending details after an interruption. |
| 09 | `09_stats.bat` | stats | Show collection status. |
| 10 | `10_export_csv.bat` | export | Export collected cases to CSV (UTF-8 BOM). |
| - | `run.bat` | any | Generic launcher: `run.bat <mode> [options]`. |

Recommended order: **01 -> 02 -> 03 -> 05 -> 07 (or 04 then 06) -> 09 -> 10**

## 4. Command line

```bat
python run_crawl.py init-db
python run_crawl.py check-db
python run_crawl.py list   --max-pages 3
python run_crawl.py detail --limit 100
python run_crawl.py full
python run_crawl.py resume
python run_crawl.py stats
python run_crawl.py export --out .\export
```

Options: `-c/--config`, `--semok`, `--start-page`, `--max-pages`, `--limit`, `--force`,
`--no-backup`, `--out`

## 5. Folder layout

```
tt_tribunal_crawler/
├── 01_init_db.bat ... 10_export_csv.bat   one batch file per mode
├── run.bat                                generic launcher
├── run_crawl.py                           CLI entry point
├── config.ini                             settings (DB path / delay / target category)
├── requirements.txt                       dependencies
├── README.md                              this file
├── sql/
│   └── schema.sql                         new-table DDL (CREATE TABLE IF NOT EXISTS)
└── tt_crawler/
    ├── __init__.py                        version info
    ├── config.py                          settings loader / category master
    ├── util.py                            logging, text normalization
    ├── http_client.py                     HTTP fetcher (retry / delay)
    ├── list_parser.py                     list page parser
    ├── detail_parser.py                   detail page and body viewer parser
    ├── db.py                              SQLite persistence (existing tables untouched)
    └── pipeline.py                        per-mode execution logic
```

## 6. Safety rules

1. **The existing DB path is never changed** (`D:\SQLiteDB\smart_law_ai.db`).
2. **No DROP / ALTER / DELETE** is executed against existing tables.
3. New tables are created with `CREATE TABLE IF NOT EXISTS` only, separated by the
   `tb_tt_` prefix.
4. `init-db` creates a timestamped backup in `backup_dir` (default `D:\SQLiteDB\backup`).
5. A configurable delay (`delay_sec`, default 1.0s) plus retries keeps the load on the
   source server low.
6. Collection can be interrupted and continued with `resume` (collected rows are skipped).

## 7. Notes

- Customs (90) currently reports **4,140 rows / 414 pages** (site totals, 2026-10).
- Category codes (site menu):
  - National : Corporate 20 / Income 12 / VAT 50 / Capital Gains 11 /
    Inheritance-Gift 40 / Customs 90 / Others 99
  - Local : Local 95 (all) = Acquisition 96 + Property 97 + Others 98
  - 95 is the sum of 96/97/98, so combining them duplicates rows.
- To also download the HWP attachments, set `download_attach = true` in `config.ini`.
- Scraped document content (titles, reasoning, category labels) stays in the source
  language; only the tool source, logs and batch files are English.