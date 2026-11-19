================================================================================
 대한민국 전자관보 품목분류 고시 크롤러 - 사용 안내서 (v1.0)
================================================================================

1. 개요
   대한민국 전자관보(https://gwanbo.go.kr)의 기본검색 기능을 이용하여 관세청
   품목분류 관련 고시를 자동으로 검색·수집하고, 원문 PDF 다운로드, 본문
   텍스트 추출 및 SQLite 데이터베이스 저장을 일괄 처리하는 프로그램입니다.

2. 시스템 요구사항
   - Python 3.10 이상 (3.12 권장)
   - Windows 10/11 (D:\ 드라이브 권장, 없으면 config.json에서 경로 수정)
   - 인터넷 연결 (별도 가상환경 불필요)

3. 설치 (최초 1회, 명령 프롬프트에서)
   > pip install -r requirements.txt
   * requests, pypdf 2개 패키지만 설치합니다. 가상환경 없이 바로 실행됩니다.

4. 실행 방법 (선택 1~5)
   [방법 1] 전체 수집 (기본)
     - run_crawler.bat 더블클릭
     - 또는: python gwanbo_crawler.py

   [방법 2] 1페이지만 수집 (빠른 테스트)
     - run_crawler_page1.bat 더블클릭
     - 또는: python gwanbo_crawler.py --page 1

   [방법 3] 페이지 범위(From ~ To) 수집
     - run_crawler_range.bat 더블클릭 후 시작/종료 페이지 입력
     - 또는: python gwanbo_crawler.py --from-page 1 --to-page 5

   [방법 4] 폴백 검색어(「품목분류」) 수집
     - run_crawler_fallback.bat 더블클릭
     - 또는: python gwanbo_crawler.py --keyword "품목분류"

   [방법 5] 사전 검색 건수만 확인 (다운로드 없음)
     - python gwanbo_crawler.py --dry-run

5. 저장 경로
   - DB 파일     : D:\SQLiteDB\smart_law_ai.db  (기존 DB에 TB_GWANBO_* 테이블 추가)
   - 첨부파일/PDF: D:\SQLiteDB\downloads\대한민국 전자관보\
   - 본문 텍스트 : D:\SQLiteDB\downloads\대한민국 전자관보\ (파일명.txt)
   - 로그 파일   : logs\YYYYMMDD.log (예: logs\20261110.log)

6. 설정 변경 (config.json)
   키워드, DB경로, 다운로드 폴더, 요청 간격, 타임아웃 등은 config.json에서
   자유롭게 변경할 수 있으며, CLI 인자가 항상 우선 적용됩니다.

7. 주요 옵션
   --page N            단일 페이지 수집
   --from-page N       시작 페이지
   --to-page M         종료 페이지
   --all               전체 페이지 수집
   --keyword "단어"    1차 검색어 변경
   --db 경로           DB 파일 위치 변경
   --download-dir 경로 첨부파일 저장 폴더 변경
   --dry-run           수집 없이 결과만 확인
   --no-skip           이미 수집된 건도 재다운로드

8. 중단 후 재실행
   기본적으로 이미 DB와 파일시스템에 존재하는 건은 자동으로 스킵하므로,
   프로그램이 중간에 중단되더라도 언제든 다시 실행하면 이어서 수집됩니다.

9. 주의사항
   - 전자관보 서버의 부하를 줄이기 위해 요청 간 2초의 대기 시간이 적용되어
     있습니다. 연속 다량 요청 시 일시적으로 느려질 수 있습니다.
   - 해외 IP나 VPN을 사용할 경우 접속이 불안정할 수 있으므로 가급적 국내
     일반 인터넷 환경에서 실행하십시오.
================================================================================
