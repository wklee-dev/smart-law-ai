# 커서(Cursor IDE) 연동 가이드 V3

이 문서는 `openlaw` 프로젝트를 커서(Cursor IDE) 환경에 반영하고 실행하기 위한 가이드입니다.

## 1. 프로젝트 개요
국가법령정보 OPEN API를 활용하여 법령 정보를 수집하고 SQLite 데이터베이스에 적재하는 파이썬 크롤링 프로젝트입니다.
커서 UI에서 `gwanselaw_list` 테이블의 법령 목록을 조회하고, 선택한 법령ID를 기반으로 12개 API를 호출하는 구조로 설계되었습니다.

## 2. 파일 구조
- `db_init.py`: 12개 대상 API의 응답 필드를 분석하여 표준 영문 컬럼명으로 설계된 SQLite 테이블 생성 스크립트입니다.
- `law_crawler.py`: 특정 법령ID를 입력받아 12개 API를 순차 호출하고 DB에 적재하는 메인 크롤러입니다.
- `.env`: API 인증키(`OPEN_API_KEY`) 등 민감한 환경변수를 관리합니다.
- `국가법령정보_OPEN_API_설계서_V3.md`: 전체 프로젝트 아키텍처 및 데이터베이스 스키마 설계서입니다.

## 3. 커서(Cursor) 환경 설정

### 3.1. 필수 패키지 설치
커서의 터미널을 열고 다음 명령어를 실행하여 필수 패키지를 설치합니다.
```bash
pip install requests python-dotenv
```

### 3.2. 환경 변수 설정
프로젝트 루트 디렉토리에 `.env` 파일을 생성하거나 확인하고, API 인증키를 설정합니다.
```env
OPEN_API_KEY=hanjoo_api
```

### 3.3. 데이터베이스 초기화
최초 1회 실행하여 12개의 테이블을 생성합니다. (경로: `D:\SQLiteDB\smart_law_ai.db`)
```bash
python db_init.py
```

## 4. 커서 UI 연동 방법

커서에서 파이썬 스크립트를 실행하여 법령 데이터를 수집하는 두 가지 방법입니다.

### 방법 A: 파이썬 함수 직접 호출 (추천)
커서 내부의 UI 로직이나 다른 파이썬 스크립트에서 `law_crawler.py`의 함수를 임포트하여 사용합니다.

```python
import sqlite3
from law_crawler import crawl_by_law_id

# 1. DB 연결 및 gwanselaw_list 조회
conn = sqlite3.connect(r'D:\SQLiteDB\smart_law_ai.db')
cursor = conn.cursor()
cursor.execute("SELECT law_id, law_nm FROM gwanselaw_list")
rows = cursor.fetchall()
conn.close()

# 2. 커서 UI에서 사용자가 선택한 법령ID 획득 (예: 첫 번째 항목)
selected_law_id = rows[0][0]

# 3. 선택된 법령ID로 12개 API 크롤링 실행
crawl_by_law_id(selected_law_id)
```

### 방법 B: 명령줄(CLI) 실행
커서의 터미널이나 쉘 실행 모듈을 통해 인자를 전달하여 실행합니다.
```bash
python law_crawler.py --law_id 280367
```

## 5. 로깅 및 유지보수
- 크롤링 실행 결과와 오류 내역은 `LOG/YYYYMMDD_국가법령정보공동활용.log` 파일에 저장됩니다.
- 12개 API 중 현재 예시로 구현된 `crawl_efyd_list` 외의 나머지 11개 API 함수는 `law_crawler.py` 내부의 주석을 참고하여 추가 구현이 필요합니다.
