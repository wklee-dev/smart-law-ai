# 한국관세무역개발원 국내 관세무역동향 크롤러

상세한 설치·실행법과 SQLite 컬럼 설명은 함께 제공한 Word 사용가이드를 참고하세요. Windows의 Python 3.9 이상에서 가상환경 없이 실행합니다.

## 시작

1. 기존 `D:\SQLiteDB\smart_law_ai.db`를 먼저 백업합니다. 다른 경로를 쓰려면 `--db-path`를 지정하세요. 기존 DB가 없는 경우에만 `--create-db`를 추가합니다.
2. 압축을 풀고 해당 폴더에서 `install_requirements.bat`을 실행하거나 `python -m pip install --user -r requirements.txt`를 실행합니다.
3. 예를 들어 다음 명령으로 1페이지의 목록, 본문과 첨부파일을 수집합니다.

```bat
python run.py crawl --page 1
```

## 실행 예시

```bat
python run.py crawl --year 2026 --week 38
python run.py crawl --start-date 20260301 --end-date 20260918
python run.py crawl --from-page 1 --to-page 10
python run.py crawl --page 1 --stage list
python run.py crawl --page 1 --stage detail
python run.py crawl --page 1 --stage detail --refresh
python customs_crawler.py --from 1 --to 10
python customs_crawler.py 1 10
python customs_crawler.py 1
python customs_crawler.py
python customs_crawler.py all
run_crawler.bat --page 1
```

`customs_crawler.py`를 인수 없이 실행하면 `config.ini`에 지정한 시작·끝 페이지를 사용하며 기본값은 1페이지입니다. `all`은 전체 페이지를 뜻하므로 오래 걸릴 수 있습니다. 주차는 ISO 주차(월요일~일요일)이고 날짜 경계는 양끝 포함입니다. 페이지와 날짜를 함께 지정하면 두 조건을 모두 적용합니다. 단계는 기본 `all`(1+2단계), `list`(1단계), `detail`(저장된 목록으로 2단계)입니다. 기본적으로 완료된 상세는 건너뛰고 `--refresh`로 다시 가져옵니다. 목록은 최신순을 전제로 지정 기간보다 오래된 페이지에 도달하면 자동으로 중단합니다.

DB에 `kctdi_trade_articles`와 `kctdi_trade_attachments` 테이블을 별도로 만들며, 다른 테이블을 수정하지 않습니다. 첨부는 기본적으로 `D:\SQLiteDB\downloads\관세무역개발원\무역동향`에 저장합니다. `--download-dir`은 `downloads`에 해당하는 상위 디렉터리를 변경합니다. 로그는 프로그램 폴더의 `logs\YYYY-MM-DD.log`입니다. 본문 원문 HTML과 텍스트를 보관합니다.

Windows 외 환경에서는 `--db-path`, `--download-dir`을 둘 다 지정해야 합니다. 예: `python run.py crawl --page 1 --db-path /tmp/trade.db --download-dir /tmp/downloads --create-db`.

실행 전에 사이트의 이용조건, 크롤링 정책과 저작권을 확인하세요. 사이트 구조나 접속 정책이 바뀌면 크롤러 수정이 필요할 수 있습니다. 실패한 상세 글은 오류 상태로 보존되며 같은 명령을 다시 실행하면 재시도합니다. `--stage detail`의 페이지 조건은 게시글이 마지막으로 저장된 목록 페이지를 기준으로 하므로, 새 글이 추가되어 페이지가 이동했다면 목록 단계를 먼저 다시 실행하세요. 첨부가 삭제된 게시글을 재수집하면 DB의 첨부 정보는 갱신되지만 예전 로컬 파일은 자동 삭제하지 않습니다.

첨부의 실제 저장 파일명은 충돌 방지를 위해 식별자와 파일 해시를 포함하며, 긴 원래 이름은 일부 잘릴 수 있습니다. 전체 원래 파일명은 DB의 `original_filename` 컬럼에서 확인할 수 있습니다. `content_html`은 정제하지 않은 원본 HTML이므로 웹 화면에 표시할 때에는 별도로 안전하게 정제해야 합니다.

선택 사항: `python -m unittest test_crawler test_site_parser`로 오프라인 회귀 테스트를 실행할 수 있습니다. 별도 HTML 샘플을 제공하지 않는 기본 배포본에서는 실사이트 HTML 파일 기반 테스트 2건이 건너뛰어집니다.
