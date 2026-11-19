# 국민참여입법센터 통합입법예고 크롤러 V3

입법예고와 행정예고의 **전체 목록을 기간 조건으로 조회한 뒤**, 각 행의 소관부처 또는 기관명이 아래 고정 목록에 있을 때만 상세 본문과 첨부파일을 수집합니다. 검색 화면의 소관부처 콤보박스나 기관명 검색은 사용하지 않습니다. 기관 선택을 위한 실행 옵션도 없습니다. 프로그램 버전은 3.0.0입니다.

## 처리 대상

| 화면 | 판별할 목록 열 | 처리할 기관 |
|---|---|---|
| (부처)입법예고 | 소관부처 | 재정경제부, 관세청, 산업통상부, 국토교통부, 해양수산부, 식품의약품안전처, 기후에너지환경부, 농림축산식품부 |
| (부처)행정예고 | 기관 | 재정경제부, 산업통상부, 국토교통부, 해양수산부, 기후에너지환경부, 농림축산식품부 |

목록의 앞뒤 공백·줄바꿈을 정리하고, 법령종류나 공고번호는 기관명에서 분리하여 **정확히 일치하는 기관명**만 처리합니다. 행정예고의 관세청과 식품의약품안전처 항목은 제외합니다. 목록에 없는 다른 기관, 구 기관 명칭, 산하기관은 자동 포함하지 않습니다.

기관이 일치하지 않는 행은 상세 페이지를 요청하거나 파일을 다운로드하지 않습니다. 대상 기관이 없는 페이지여도 중단하지 않고 다음 페이지를 계속 읽습니다. 기간에 해당하는 마지막 목록 페이지까지 모두 순회한 후 대상 기관의 공고만 처리합니다.

## 설치와 업데이트

Windows Python 3.10 이상 환경에서 압축을 푼 프로젝트 폴더의 `run.py`, `src/`, `requirements.txt` 등을 기존 프로그램 폴더에 덮어씁니다. 실행 중인 크롤러가 있으면 먼저 종료한 뒤 업데이트하세요. 기존 DB와 첨부파일은 삭제하지 않습니다.

```bat
cd /d D:\Crawling\국민참여입법센터
python -m pip install -r requirements.txt
```

DB 경로는 **`D:\SQLiteDB\smart_law_ai.db`**, 첨부파일 저장 루트는 **`D:\SQLiteDB\downloads`**로 고정되어 있습니다. 경로를 입력하는 실행 옵션은 없습니다. 필요한 하위 폴더는 자동 생성하며, 이 업데이트가 기존 파일을 이동하거나 과거 DB의 `local_path`를 자동 변경하지는 않습니다.

## 기본 실행

```bat
REM 입법예고 8개 기관 + 행정예고 6개 기관을 목록에서 판별해 수집
python run.py crawl --start-date 20260301 --end-date 20261110

REM 주차 기준 (월요일~일요일)
python run.py crawl --year 2026 --week 46

REM 수집 이력 확인
python run.py history
```

별도의 기관 옵션 없이 위 명령으로 두 화면에 각각 8개·6개 목록 필터가 자동 적용됩니다. 기간 검색 기준은 입법예고의 **입법예고 시작일**, 행정예고의 **예고일자**입니다.

## 화면별 실행

```bat
REM 입법예고만 수집: 소관부처가 지정 8개 기관에 포함된 행만 처리
python run.py crawl --year 2026 --week 46 --notices legislation

REM 행정예고만 수집: 기관이 지정 6개 기관에 포함된 행만 처리
python run.py crawl --year 2026 --week 46 --notices administrative
```

## 실행 옵션

| 옵션 | 의미 | 기본값 |
|---|---|---|
| `--year` / `--week` | ISO 연도·주차, 둘 다 입력 | 직접 날짜 방식과 택일 |
| `--start-date` / `--end-date` | 실제 날짜 `YYYYMMDD` 8자리, 둘 다 입력 | 주차 방식과 택일 |
| `--notices` | `all`, `legislation`, `administrative` | `all` = 두 화면 |
| `--skip-downloads` | 본문·첨부 메타데이터만 수집 | 해제 |
| `--force-download` | 기존 성공 첨부파일도 다시 다운로드 | 해제 |
| `--max-items` | 필터 통과 공고의 화면별 상세 처리 상한. 목록은 전체 페이지를 읽음 | `0` = 통과 공고 전건 |
| `--delay` | HTTP 요청 간 최소 대기 초 | `0.35` |

직접 날짜와 주차를 섞거나, 시작일이 종료일보다 늦으면 입력 오류로 중단합니다. 기관 목록은 `src/national_law_notice_crawler.py`의 `LEGISLATION_MINISTRIES`와 `ADMINISTRATIVE_MINISTRIES`에 고정되어 있습니다.

## 이력·저장 구조

```text
D:\SQLiteDB\downloads\
├── (부처)입법예고\<공고일련번호>\<파일일련번호>_<원본파일명>
└── (부처)행정예고\<공고일련번호>\<파일일련번호>_<원본파일명>
```

DB의 기존 `nlc_ministry_legislation_notice`, `nlc_ministry_administrative_notice`, `nlc_notice_attachment`, `nlc_week_crawl_history`, `nlc_crawl_error`를 사용합니다. 고유 번호 기준으로 갱신하며, 과거에 수집한 비대상 기관의 공고를 삭제하지 않습니다.

기존 이력 테이블에 `requested_ministries` 컬럼을 자동 추가해 실제 적용한 두 화면의 기관 목록을 JSON 배열로 저장합니다. 실행하지 않은 화면은 빈 배열로 기록합니다. 이전 버전 이력의 SQL `NULL`은 기관 필터 이력 없음으로 유지하며, `period_type`의 주차/직접 기간 구분도 유지합니다.

실행 결과의 `listed`는 전체 목록 건수, `excluded`는 기관 필터 제외 건수, `discovered`는 통과 공고 건수, `completed`는 상세 처리 성공 건수입니다. DB 이력의 `discovered`와 `completed`도 필터 통과 공고를 기준으로 합니다. 기간 미적용, 페이지 반복, 건수 불일치, 기관 열 파싱 실패, 상세 본문 누락은 오류로 기록합니다. 한 화면의 목록 수집이 실패하더라도 다른 화면 수집은 시도합니다.

## 배치 파일

동봉한 `run.bat`는 프로그램 폴더로 이동해 인자를 전달합니다. 자동 전원 종료 명령은 포함하지 않습니다.

```bat
run.bat crawl --start-date 20260301 --end-date 20261110
run.bat crawl --year 2026 --week 46
run.bat history
```

외부 배치에서는 `python "D:\Crawling\국민참여입법센터\run.py" crawl ...`처럼 절대 경로를 사용할 수 있습니다. `run.py`뿐 아니라 같은 폴더의 `src/`도 함께 업데이트해야 합니다. 0이 아닌 종료 코드가 나오면 오류 이력을 확인하고, 전원 종료는 모든 작업 성공을 확인한 뒤 실행하세요.

## 검증

```bat
python -m unittest discover -s tests -v
```

`tools/live_smoke_test.py`는 운영 DB와 분리된 임시 폴더에서 두 화면의 기관 필터와 화면별 상세 1건·첨부파일 수집을 검증하는 선택적 도구입니다. 실행 시 공개 포털에 실제 HTTP 요청을 보내며 임시 DB와 파일은 종료 시 삭제합니다. 평소에는 위 단위 테스트만 실행하면 됩니다.
