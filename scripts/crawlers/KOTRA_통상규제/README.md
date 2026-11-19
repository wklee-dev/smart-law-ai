# KOTRA 통상·규제 크롤러 V1.0

상세 사용법과 SQLite 테이블 내역은 별도로 제공되는 Word 사용가이드를 확인하십시오.

**중요:** 확인 당시(2026-11-16) KOTRA `https://dream.kotra.or.kr/robots.txt`는 모든 자동 접근을 금지합니다. 접속 성공은 자동수집 허가가 아닙니다. 사용 전 KOTRA의 명시적 허가, 현재 이용조건 및 게시물별 저작권을 확인하십시오. 본 프로그램은 이 정책을 자동으로 준수하거나 허가를 확인하지 않습니다.

Windows에서 Python 3.9 이상을 설치한 후 `install.bat`을 실행합니다. 가상환경은 사용하지 않습니다. 예시:

```bat
python run.py crawl --year 2026 --week 38
python run.py crawl --start-date 20260301 --end-date 20260918
python run.py crawl --from 1 --to 10
python customs_crawler.py 1 10
python customs_crawler.py all
```

기본 DB는 `D:\SQLiteDB\smart_law_ai.db`, 첨부 경로는 `D:\SQLiteDB\downloads\KOTRA\통상규제\`, 로그는 압축 해제한 폴더의 `logs\YYYY-MM-DD.log`입니다. 다른 경로는 `config.ini`를 수정하거나 `--db`, `--downloads`, `--log-dir` 인자를 사용하십시오. 첫 실행 전 DB를 백업하고 저장 폴더 권한 및 여유 용량을 확인하십시오.

주차와 날짜 양끝은 포함되며 날짜만 입력한 경우 검색 결과 전체 페이지를 수집합니다. 페이지를 지정하면 날짜 필터가 적용된 결과의 해당 페이지를 수집합니다. 아무 조건이 없으면 `config.ini`의 기본 1페이지만 수집합니다. 게시물 상태, 폐지·제정 여부 등으로 별도 제외하지 않습니다.

진행 중 오류 발생 시 이미 저장한 데이터는 남으며 마지막 종료코드는 0(성공), 1(전체 중단), 2(일부 오류), 130(사용자 중단)입니다. 로그와 SQLite 첨부 상태를 확인하고 같은 명령을 재실행할 수 있습니다. 사이트가 변경되거나 네트워크가 차단되면 프로그램의 수정이 필요할 수 있습니다. 본문 이미지는 별도 다운로드하지 않으며 HTML의 URL로 보존합니다.
