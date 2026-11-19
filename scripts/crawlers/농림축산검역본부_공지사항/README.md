# 농림축산검역본부(동물검역본부) 공지사항 크롤러

농림축산검역본부 알림마당 **공지사항**(`type=7_depart`)을 페이지 범위로 수집하고,
본문과 첨부파일을 내려받으며, **수집 이력(SQLite)** 을 남겨 다음 실행 때 중복 수집을 자동으로 건너뛰는 파이썬 프로그램입니다.

기존 조세심판원 소식 크롤러와 동일한 방식(CLI 옵션 + 이력 DB + 첨부 다운로드 + 실행 리포트)으로 구성했습니다.
상세 사용법은 함께 제공되는 **Word 가이드**(`농림축산검역본부_공지사항_크롤러_사용가이드.docx`)에 정리되어 있습니다.

## 고정 저장 위치

| 구분 | 경로 |
| --- | --- |
| 이력 DB | `D:\SQLiteDB\smart_law_ai.db` |
| 다운로드(본문·첨부·리포트) | `D:\SQLiteDB\downloads` |

* 두 경로는 기본값으로 고정되어 있으며, 프로그램이 폴더를 자동 생성합니다.

### 기존 DB에 테이블만 추가됩니다

`smart_law_ai.db` 에 이미 다른 테이블(조세심판원 수집 이력 등)이 있어도 **기존 테이블은 조회·수정·삭제하지 않습니다.**
프로그램이 새로 만드는 객체는 아래 4개뿐입니다.

| 구분 | 이름 | 설명 |
| --- | --- | --- |
| 테이블 | `qia_notice_posts` | 공지사항 게시글 수집 이력 |
| 테이블 | `qia_notice_runs` | 실행 단위 로그 |
| 인덱스 | `idx_qia_notice_content` | 제목+등록일 중복 차단용(UNIQUE) |
| 인덱스 | `idx_qia_notice_date` | 등록일 정렬용 |

* 실행하는 SQL은 `CREATE TABLE IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS`, 우리 테이블에 대한
  `INSERT … ON CONFLICT DO UPDATE` / `SELECT` 뿐입니다. `DROP`·`ALTER`·`VACUUM` 은 사용하지 않습니다.
* `--reset-history` 는 `qia_notice_posts` 에서 `board_type='7_depart'`(공지사항) 행만 삭제합니다.
* 같은 이름의 테이블이 다른 구조로 이미 존재하면, 데이터를 건드리지 않고 안내 메시지를 출력한 뒤 중단합니다.

첫 실행 후 아래 질의로 추가된 객체만 확인할 수 있습니다.

```sql
SELECT type, name FROM sqlite_master WHERE name LIKE 'qia_notice%' OR name LIKE 'idx_qia_notice%';
```

---

## 1. 요구사항 대응표

| 요구사항 | 구현 내용 |
| --- | --- |
| 페이지 지정(from~to) | `--from-page` / `--to-page`, `--all`(전체), `--latest N`(최신 N페이지) |
| 다음 크롤링 시 이력 관리 | `D:\SQLiteDB\smart_law_ai.db` 의 `qia_notice_posts` 에 게시글 ID·제목·등록일·첨부·파일경로 기록 |
| 중복 내용 수집 방지 | ① 게시글 ID 이력 확인 ② 제목+등록일 해시(`content_key`) 로 내용 중복 차단(DB 유니크 인덱스) |
| 첨부파일 다운로드 | 상세 페이지의 첨부 링크를 모두 받아 `D:\SQLiteDB\downloads\공지사항\첨부파일\…` 에 저장(서버 원본 파일명 유지) |
| 저장 경로 규칙 | 게시판(화면) 이름 하위 폴더(`공지사항`)에 본문·첨부·리포트를 구분 저장 |

---

## 2. 설치

```bash
cd qia_notice_crawler
python -m pip install -r requirements.txt
```

* Python 3.9 이상 (Windows 기준 `py -3` 또는 `python`)
* 필요 패키지: `requests`, `beautifulsoup4`, `lxml`, `openpyxl`

---

## 3. 실행 방법

### 3-1. 기본 (최신 1페이지 = 10건)

```bash
python crawler.py
```

### 3-2. 페이지 범위 지정 (from ~ to)

```bash
python crawler.py --from-page 1 --to-page 5     # 1~5페이지 (50건)
python crawler.py -f 10 -t 10                   # 10페이지만
```

### 3-3. 전체 / 최신 N페이지

```bash
python crawler.py --all        # 전체 페이지(현재 약 529쪽, 자동 계산)
python crawler.py --latest 3   # 최신 3페이지
```

### 3-4. 재실행 (중복 자동 제외)

```bash
python crawler.py -f 1 -t 3    # 이미 받은 글은 "기수집"으로 건너뜀
```

### 3-5. 이력 확인 · 내보내기

```bash
python crawler.py --list-history 30    # 최근 30건 이력 출력
python crawler.py --export xlsx        # 누적 이력 전체를 엑셀로 저장
python crawler.py --export csv         # CSV로 저장
```

### 3-6. 저장 없이 신규 글만 확인

```bash
python crawler.py -f 1 -t 2 --dry-run
```

### 3-7. 이력 초기화 (처음부터 다시 받기)

```bash
python crawler.py --reset-history          # 확인 프롬프트
python crawler.py --reset-history --yes    # 즉시 초기화
```

---

## 4. 주요 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `-f, --from-page` | 1 | 시작 페이지 |
| `-t, --to-page` | 시작 페이지 | 마지막 페이지 |
| `-a, --all` | - | 전체 페이지 수집(전체 쪽수 자동 반영) |
| `-n, --latest` | - | 최신 N페이지 수집 |
| `-d, --downloads` | `D:\SQLiteDB\downloads` | 본문·첨부·리포트 저장 폴더 |
| `--db` | `D:\SQLiteDB\smart_law_ai.db` | 이력 DB 파일 |
| `--delay` | 1.0 | 요청 사이 대기(초) |
| `--timeout` | 20 | 요청 타임아웃(초) |
| `--retries` | 3 | 실패 시 재시도 횟수 |
| `--workers` | 3 | 상세 페이지 동시 수집 수(1이면 순차) |
| `--no-attachments` | - | 첨부파일 다운로드 생략 |
| `--no-body` | - | 본문 파일 저장 생략 |
| `--force` | - | 이력 무시하고 재수집(첨부도 다시 받음) |
| `--no-content-dedupe` | - | 제목+등록일 내용 중복 검사 해제 |
| `--stop-on-known` | - | 이미 아는 글만 있는 페이지에서 조기 종료 |
| `--dry-run` | - | 저장/다운로드 없이 신규 목록만 출력 |
| `--reset-history` | - | 이력 초기화 |
| `--list-history [N]` | 20 | 최근 N건 이력 출력 |
| `--export {csv,xlsx,all}` | - | 누적 이력 내보내기 |
| `--type` | `7_depart` | 게시판 구분값(다른 게시판으로 확장 시) |
| `-v, --verbose` | - | 상세 로그 |

---

## 5. 저장 구조

```
D:\SQLiteDB\
├── smart_law_ai.db                       # 수집 이력(중복 방지의 기준)
└── downloads\
    ├── logs\
    │   └── crawl_20261104.log            # 실행 로그
    └── 공지사항\
        ├── 본문\
        │   ├── 2026-10-14_67141_공사용 관급자재 선정 심의 결과 알림(…).md
        │   └── 2026-10-14_67141_공사용 관급자재 선정 심의 결과 알림(…)_본문.html
        ├── 첨부파일\
        │   └── 2026-10-14_67141_공사용 관급자재 선정 심의 결과 알림(…)\
        │       └── 관급자재 선정 심의결과.hwpx
        └── 수집리포트\
            ├── 20261104_083800_신규수집_1-2p.csv      # 실행별 신규 수집 목록
            └── 20261104_084346_수집이력전체.xlsx      # --export 결과
```

* 본문 `.md` : 제목·담당부서·작성자·등록일·조회수·원문 URL·첨부 경로·본문 텍스트
* 본문 `_본문.html` : 원본 서식 보존용(HWP 에디터 JSON 주석은 제거, 상대경로는 절대 URL로 변환)
* 첨부 폴더명 : `등록일_게시글ID_제목(40자)` — 같은 글의 첨부가 한곳에 모입니다.
* 신규 수집 리포트는 **그 실행에서 새로 받은 글만** 기록합니다(엑셀에서 바로 열리도록 UTF-8 BOM).

---

## 6. 중복 방지 로직

1. **게시글 ID 검사** — `qia_notice_posts` 의 기본키 `(board_type, post_id)`. 이미 있으면 상세 페이지 요청조차 하지 않습니다.
2. **내용 해시 검사** — `sha1(제목정규화 + 등록일)`. 게시글이 재등록되어 ID가 바뀌어도 같은 내용이면 건너뜁니다.
   * `(board_type, content_key)` 에 UNIQUE 인덱스가 걸려 있어 동시 실행·예외 상황에서도 중복 저장이 불가능합니다.
   * 제목이 같은 다른 글을 받아야 한다면 `--no-content-dedupe` 로 끌 수 있습니다.
3. **첨부파일 재다운로드 방지** — 같은 경로에 파일이 있으면 크기 확인 후 건너뜁니다(`--force` 시 재다운로드).

실행 결과는 콘솔과 로그에 아래처럼 요약됩니다.

```
 수집 결과 요약
   · 처리 페이지      : 2
   · 확인한 게시글    : 20
   · 신규 수집        : 4
   · 기수집 건너뜀    : 16
   · 내용 중복 건너뜀 : 0
   · 첨부파일 처리    : 5
   · 실패             : 0
   · 누적 수집 건수   : 24
```

---

## 7. 정기 실행(작업 스케줄러 / 크론)

매일 오전 8시에 최신 2페이지를 확인하며 신규 글만 받는 경우:

```bat
@echo off
cd /d C:\qia_notice_crawler
python crawler.py --latest 2 >> D:\SQLiteDB\downloads\logs\cron.log 2>&1
```

* Windows: `작업 스케줄러` → 기본 작업 만들기 → 매일 08:00 → 위 `.bat` 실행
* Linux/macOS: `0 8 * * * cd /path/qia_notice_crawler && python3 crawler.py --latest 2`

---

## 8. 폴더 구성(소스)

```
qia_notice_crawler/
├── crawler.py                # CLI 진입점 · 수집 흐름 제어
├── qia_crawler/
│   ├── config.py             # 사이트 URL·게시판 상수, 저장 경로 기본값, Settings
│   ├── http_client.py        # 세션 재사용 · 재시도 · 요청 간 딜레이
│   ├── parser.py             # 목록/상세 HTML 파싱(첨부 링크 포함)
│   ├── history.py            # SQLite 이력 관리(중복 차단, 실행 로그)
│   ├── downloader.py         # 첨부 다운로드(파일명 처리·중복 회피)
│   ├── writer.py             # 본문 MD/HTML 저장, CSV·XLSX 리포트
│   └── utils.py              # 파일명 안전화, 제목 정규화, HTML→텍스트
├── requirements.txt
├── README.md
└── 농림축산검역본부_공지사항_크롤러_사용가이드.docx
```

---

## 9. 참고 사항

* **대상 URL**
  * 목록 `https://www.apqa.go.kr/animal/prevent/listwebQiaCom.do?type=7_depart&pager.offset=<(페이지-1)×10>`
  * 상세 `https://www.apqa.go.kr/viewwebQiaCom.do?id=<글번호>&type=7_depart`
  * 첨부 `https://www.apqa.go.kr/downloadwebQiaCom.do?id=<첨부번호>`
* 사이트 응답이 1건당 3~6초로 느린 편입니다. `--workers 3` 을 기본으로 두었고, 서버 부담을 줄이려면 `--workers 1 --delay 1.5` 로 조정하세요.
* 실행 중 `Ctrl+C` 로 멈춰도 그때까지 저장된 글은 이력에 남아 다음 실행에서 건너뜁니다.
* `--force` 는 이미 받은 글도 다시 받아 본문·이력을 갱신합니다(첨부는 새 이름으로 추가 저장).
* 같은 경로(`/animal/prevent/listwebQiaCom.do`)를 쓰는 다른 게시판은 `--type` 만 바꿔 사용할 수 있습니다.
  ```bash
  python crawler.py --type 6_18_1bdsm --board-name 보도설명자료 -f 1 -t 2   # 보도/설명자료
  python crawler.py --type 6_18_2cygg --board-name 채용공고     -f 1 -t 2   # 채용공고
  python crawler.py --type 6_18_3zbgg --board-name 입찰공고     -f 1 -t 2   # 입찰공고
  ```
  (정보자료·동식물 해외직구 자료실은 목록 경로가 달라 `config.py` 의 `LIST_PATH` 수정이 필요합니다.)
* 사이트 구조가 바뀌면 `qia_crawler/parser.py` 의 선택자(`table.list01`, `table.view01`, `a[href*='downloadwebQiaCom']`)를 확인하세요.
* 리눅스/맥에서 테스트할 때는 `D:` 드라이브가 없으므로 `--db`, `-d` 옵션으로 경로를 지정하거나 환경변수 `QIA_DB_PATH`, `QIA_DOWNLOAD_DIR` 를 사용하세요.
