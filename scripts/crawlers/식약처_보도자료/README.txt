식약처 보도자료 크롤러 V1.0 — 빠른 시작

1. ZIP 파일을 쓰기 가능한 폴더에 압축 해제합니다.
2. Windows에 Python 3.8 이상이 설치되어 있는지 확인합니다. 별도 패키지 설치나 가상환경은 필요 없습니다.
3. 기존 DB D:\SQLiteDB\smart_law_ai.db가 존재하는지 확인하고 백업합니다.
   다른 경로를 사용하려면 config.ini의 db를 수정합니다.
4. run_crawler.bat을 더블클릭하면 기본 설정인 1페이지를 수집합니다.

명령 프롬프트에서 프로그램 폴더로 이동한 다음 실행 예시:
  run_crawler.bat --from 1 --to 10
  python mfds_crawler.py 1 10
  python mfds_crawler.py 1
  python mfds_crawler.py all
  python mfds_crawler.py

인수 없이 실행하면 config.ini의 start_page와 end_page 설정을 사용합니다.
첨부파일: D:\SQLiteDB\downloads\식약처\보도자료
로그파일: 프로그램 폴더\logs\YYYY-MM-DD.log

페이지의 모든 게시물과 첨부파일을 수집합니다. 웹 본문과 첨부파일 원본을 저장하지만 첨부파일 내부 텍스트를 별도로 추출하지는 않습니다. 오류가 나면 로그를 확인하고 해당 범위를 다시 실행하세요.

같은 이름의 mfds_press_articles, mfds_press_attachments 테이블이 이미 있는지 먼저 확인하세요. 자세한 실행 방법, DB 테이블 상세 및 오류 조치는 동봉된 Word 실행 가이드를 참조하세요.
