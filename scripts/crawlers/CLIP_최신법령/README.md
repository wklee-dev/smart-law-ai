# 관세법령정보포털 최신법령 수집기 V2.0

**`crawl_latest_laws.py`는 관세법령정보포털(CLIP)의 공개 최신법령 목록을 수집하여 기존 SQLite 운영 DB `D:\SQLiteDB\smart_law_ai.db`에 누적하는 파이썬 프로그램입니다.** 법령 본문, 법령명, 시행일·공포일, PDF·HWP 첨부파일, 신규 등록 이력 및 수집 체크포인트를 함께 관리합니다.

> **기존 데이터 보호 원칙**  
> `smart_law_ai.db`는 이미 데이터가 있는 운영 DB입니다. 수집기는 기존 업무 테이블이나 기존 행을 조회·삭제·수정·이관하지 않습니다. 새 데이터는 `latest_` 접두어를 가진 전용 테이블에만 추가 또는 갱신됩니다. 최초 실행 전에 DB 전체 백업본을 만들고, 같은 이름의 전용 테이블이 이미 있다면 본 문서의 구조와 일치하는지 먼저 확인하십시오.

## 1. 핵심 기능

| 기능 | 동작 |
| --- | --- |
| 최초 전체 수집 | 체크포인트가 없고 페이지를 지정하지 않으면 최신법령 전체 페이지를 수집합니다. |
| 페이지 선택 수집 | `--pages 1`, `--pages 1,3-5`처럼 포털 목록 페이지를 지정하여 필요한 페이지의 모든 법령을 수집합니다. |
| 자동 증분 수집 | 첫 전체 수집이 정상 완료된 뒤, 페이지를 지정하지 않고 다시 실행하면 저장된 최상단 법령 체크포인트까지 목록을 비교하여 새로 등록된 법령만 수집합니다. |
| 신규 법령명 이력 | 증분 수집에서 확인된 법령명·시행일·공포일을 `latest_law_new_registrations`에 기록하고 화면에 출력합니다. |
| 최근 신규 법령명 조회 | `--show-latest-names` 또는 `최근신규법령명_조회.bat`로 포털에 접속하지 않고 DB의 최근 신규 법령명을 조회합니다. |
| 첨부파일 저장 | PDF·HWP는 `D:\SQLiteDB\ATTACH\최신법령\법령번호_공포관리번호\`에 저장하고, DB에는 상대 경로·SHA-256·상태를 기록합니다. |
| 기존 DB 잠금 대기 | 다른 프로그램의 일시적 DB 사용에는 최대 30초 동안 잠금 해제를 기다립니다. DB를 장시간 사용하는 프로그램과 동시 실행하지 마십시오. |

## 2. 저장 위치와 패키지 파일

| 항목 | 기본 위치 또는 파일 | 용도 |
| --- | --- | --- |
| 운영 데이터베이스 | `D:\SQLiteDB\smart_law_ai.db` | 기존 업무 데이터와 최신법령 전용 테이블이 함께 있는 SQLite DB입니다. |
| 첨부파일 루트 | `D:\SQLiteDB\ATTACH` | 최신법령 첨부파일의 실제 저장 위치입니다. |
| `crawl_latest_laws.py` | 패키지 폴더 | 수집, 증분 비교, 신규 법령명 조회를 수행하는 메인 프로그램입니다. |
| `최초_전체수집.bat` | 패키지 폴더 | 최초 기준선 생성 또는 전체 재수집을 명시적으로 실행합니다. |
| `매일_신규법령수집.bat` | 패키지 폴더 | 저장된 기준선 이후의 신규 법령만 수집합니다. 기준선이 없으면 안전하게 오류로 종료합니다. |
| `선택페이지_수집.bat` | 패키지 폴더 | 실행 중 페이지 번호 또는 범위를 입력해 선택 수집합니다. |
| `최근신규법령명_조회.bat` | 패키지 폴더 | 최근 7일간 DB에 기록된 신규 법령명을 출력합니다. |
| `run_crawler.bat` | 패키지 폴더 | 페이지 미지정 기본 모드입니다. 최초에는 전체 수집, 이후에는 증분 수집으로 동작합니다. |

## 3. 기존 `smart_law_ai.db` 사전 점검

SQLite DB는 단일 파일이므로, 최초 운영 수집 전에 `smart_law_ai.db` 파일을 날짜가 포함된 별도 이름으로 복사하십시오. 다른 애플리케이션이 WAL 모드로 DB를 사용한다면 해당 시스템이 안내하는 일관성 있는 백업 절차를 따르십시오.

| 점검 항목 | 확인 기준 | 권장 조치 |
| --- | --- | --- |
| DB 백업 | 운영 DB 원본과 같은 시점의 백업본 존재 | 프로그램을 실행하지 않는 상태에서 DB 파일 전체를 복사합니다. |
| 테이블명 충돌 | `latest_laws`, `latest_law_attachments`, `latest_law_crawl_runs`, `latest_law_sync_state`, `latest_law_new_registrations` 존재 여부 | 동일 테이블이 있으면 9절의 키·컬럼 구조를 대조합니다. 구조가 다르면 실행하지 마십시오. |
| 동시 사용 | 다른 프로그램이 DB에 장기 쓰기 작업을 하는지 여부 | 정기 수집 시간과 업무 시스템의 쓰기 작업 시간을 분리합니다. |
| 쓰기 권한 | 실행 계정의 DB와 `ATTACH` 폴더 생성·수정 권한 | 테스트 DB에서 먼저 제한 실행합니다. |
| 저장 공간 | DB·첨부파일·백업을 함께 보관할 공간 | 전체 수집 전 충분한 여유 공간을 확보합니다. |

## 4. 설치와 최초 검증

Windows에서 Python 3.11 이상을 설치한 후, 패키지 폴더에서 다음 명령을 한 번 실행합니다.

```bat
cd C:\경로\clip_latest_laws_crawler
py -3 -m pip install -r requirements.txt
```

운영 DB에 적용하기 전에 아래 명령으로 별도 테스트 DB에 법령 1건만 저장하십시오. `--limit`이 들어간 시험 실행은 체크포인트를 만들거나 변경하지 않으므로 운영 증분 기준선에 영향을 주지 않습니다.

```bat
py -3 crawl_latest_laws.py ^
  --db "D:\SQLiteDB\smart_law_ai_test.db" ^
  --attach-dir "D:\SQLiteDB\ATTACH_test" ^
  --pages 1 ^
  --limit 1 ^
  --max-attachments-per-law 1
```

정상 실행 후 테스트 DB에는 최신법령 전용 테이블 5개가 생기고, `ATTACH_test\최신법령` 아래에 PDF 또는 HWP가 저장됩니다. 명령 창에 `Completed: ... errors=0`이 출력되고 종료 코드가 `0`이면 검증에 성공한 것입니다.

## 5. 실행 방법

### 5.1 최초 전체 수집: 기준선 생성

최초 운영 수집은 **반드시 전체 수집**으로 시작하십시오. 전체 페이지를 끝까지 정상 수집한 경우에만 포털 최신 목록의 최상단 법령을 체크포인트로 저장합니다.

```bat
py -3 crawl_latest_laws.py --full
```

또는 탐색기에서 `최초_전체수집.bat`를 실행합니다. 이 작업은 법령 수와 첨부파일 수에 따라 시간이 걸릴 수 있습니다. `--limit`, `--no-attachments` 옵션을 붙인 시험 실행은 전체 기준선을 만들기 위한 실행으로 사용하지 마십시오.

`최초_전체수집.bat`는 파이썬의 진행 로그를 **실시간으로 창에 표시**하면서 `logs\clip_latest_laws_full.log`에도 UTF-8로 저장합니다. PowerShell 파이프 또는 `Tee-Object`를 사용하지 않고 크롤러가 콘솔과 로그 파일에 직접 기록하므로, 정상 `INFO` 로그가 PowerShell 오류처럼 표시되지 않습니다. 정상 종료 코드 `0`인 경우에만 PC 종료가 60초 후 예약됩니다. 예약 후 종료를 취소하려면 명령 프롬프트 또는 PowerShell에서 `shutdown /a`를 실행하십시오. 자동 종료를 사용하지 않으려면 배치 파일의 `set "SHUTDOWN_AFTER_SUCCESS=1"`을 `set "SHUTDOWN_AFTER_SUCCESS=0"`으로 바꾼 뒤 실행합니다. 수집 오류가 나면 종료가 예약되지 않으므로 로그를 확인할 수 있습니다.

### 5.2 페이지 선택 수집

선택 수집은 특정 포털 목록 페이지에 있는 법령 전체를 가져옵니다. 페이지는 1부터 시작하며, 쉼표와 하이픈을 조합해 지정할 수 있습니다.

| 목적 | 명령 예시 | 수집 범위 |
| --- | --- | --- |
| 첫 페이지 | `py -3 crawl_latest_laws.py --pages 1` | 목록 1페이지의 모든 법령 |
| 여러 페이지 | `py -3 crawl_latest_laws.py --pages 1,3-5` | 1·3·4·5페이지의 모든 법령 |
| 세 번째 페이지만 | `py -3 crawl_latest_laws.py --pages 3` | 목록 3페이지의 모든 법령 |

`선택페이지_수집.bat`를 실행하면 페이지 입력 창이 표시됩니다. 선택 수집한 각 법령의 **법령명, 시행일, 공포일**은 `latest_laws`에 저장되고, 선택한 페이지 범위·처리 결과는 `latest_law_crawl_runs`에 남습니다. 선택 수집은 전체 목록의 기준선을 변경하지 않습니다. 이 원칙은 일부 페이지만 수집한 결과가 이후 일일 증분 수집에서 다른 신규 법령을 놓치지 않도록 하기 위함입니다.

### 5.3 페이지를 지정하지 않는 기본 실행

페이지를 지정하지 않고 실행하면 상태에 따라 자동으로 다음과 같이 동작합니다.

| DB 상태 | 실행 방식 | 결과 |
| --- | --- | --- |
| 전체 기준선 없음 | 전체 수집 | 포털 전체 목록·본문·첨부파일을 수집하고, 정상 완료 시 최상단 법령을 기준선으로 저장합니다. |
| 전체 기준선 있음 | 증분 수집 | 포털 목록 첫 페이지부터 기존 기준선 법령을 찾을 때까지 비교합니다. 기준선보다 앞에 있는 법령만 신규로 수집합니다. |

```bat
py -3 crawl_latest_laws.py
```

이 기본 명령은 `run_crawler.bat`에서도 사용됩니다. 이미 첫 전체 수집이 완료된 환경에서는 일일 실행 명령으로 사용해도 됩니다. 운영 안정성을 위해 일일 작업 스케줄러에는 기준선 없음을 오류로 처리하는 `매일_신규법령수집.bat` 등록을 권장합니다.

### 5.4 명시적 증분 수집

체크포인트가 반드시 존재해야 하는 일일 자동 실행에는 아래 명령을 사용합니다. 기준선이 없는 상태에서 실행하면 전체 수집으로 전환하지 않고 오류로 종료하므로, 초기화 누락을 발견할 수 있습니다.

```bat
py -3 crawl_latest_laws.py --incremental
```

### 5.5 최근 신규 등록 법령명 조회

최근 7일 이내에 증분 수집으로 탐지된 법령명, 시행일, 공포일을 DB에서만 조회합니다. 이 조회는 포털에 접속하지 않고 DB 스키마나 기존 데이터를 변경하지 않습니다.

```bat
py -3 crawl_latest_laws.py --show-latest-names --new-name-days 7 --new-name-limit 100
```

JSON 형식이 필요하면 다음처럼 실행합니다.

```bat
py -3 crawl_latest_laws.py --show-latest-names --new-name-days 30 --name-output json
```

## 6. 일일 수집 운영 방법

첫 전체 수집이 **오류 없이 정상 종료**한 뒤, `매일_신규법령수집.bat`를 Windows 작업 스케줄러에 등록합니다. 이 배치 파일은 `--incremental`을 사용하므로 전체 기준선이 없을 때 안전하게 종료합니다.

| 접근 방식 | 장단점 | 비용 | 설정 난이도 |
| --- | --- | --- | --- |
| `매일_신규법령수집.bat` 수동 실행 | 가장 단순하며 실행 전후 로그와 DB 상태를 직접 확인할 수 있습니다. 자동 실행은 되지 않습니다. | 추가 비용 없음 | 낮음 |
| Windows 작업 스케줄러에 배치 파일 등록 | PC가 켜져 있을 때 매일 같은 시간에 신규 법령을 자동 수집합니다. 실행 계정의 DB·첨부파일 쓰기 권한과 네트워크 연결이 필요합니다. | 추가 비용 없음 | 중간 |

작업 스케줄러 등록 절차는 다음과 같습니다.

1. Windows 검색에서 **작업 스케줄러**를 열고 **기본 작업 만들기**를 선택합니다.
2. 이름은 `CLIP 최신법령 일일 증분 수집`처럼 식별하기 쉽게 입력하고, 트리거는 매일 원하는 시간으로 설정합니다.
3. 동작은 **프로그램 시작**을 선택하고 프로그램/스크립트에 `매일_신규법령수집.bat`의 전체 경로를 지정합니다.
4. 실행 계정이 `D:\SQLiteDB\smart_law_ai.db`와 `D:\SQLiteDB\ATTACH`에 쓸 수 있는지 확인합니다.
5. 등록 직후 작업 스케줄러의 **실행**으로 한 번 시험하고, `logs\clip_latest_laws_daily.log`와 `latest_law_crawl_runs`를 확인합니다.

## 7. 실행 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--db` | `D:\SQLiteDB\smart_law_ai.db` | 대상 SQLite DB 파일입니다. 지정 경로는 기존 운영 DB이므로 백업 후 사용하십시오. |
| `--attach-dir` | `D:\SQLiteDB\ATTACH` | 첨부파일 저장 루트입니다. |
| `--law-type` | `all` | `all` 전체, `A01` 법률, `A02` 시행령, `A03` 시행규칙을 수집합니다. |
| `--pages` | 없음 | 목록 페이지 선택입니다. 예: `1`, `1,3-5`입니다. `--full`, `--incremental`과 함께 사용할 수 없습니다. |
| `--full` | 꺼짐 | 체크포인트와 관계없이 전체 목록을 다시 수집합니다. |
| `--incremental` | 꺼짐 | 저장된 체크포인트 이후의 신규 법령만 수집합니다. 기준선이 없으면 오류입니다. |
| `--refresh-existing` | 꺼짐 | 기존 최신법령 행도 본문과 첨부파일 상태를 다시 확인합니다. |
| `--show-latest-names` | 꺼짐 | 수집하지 않고 DB의 최근 신규 법령명을 출력합니다. |
| `--new-name-days` | `7` | 신규 법령명 조회 기간(일)입니다. |
| `--new-name-limit` | `100` | 신규 법령명 최대 출력 수입니다. |
| `--name-output` | `table` | 신규 법령명 출력 형식입니다. `table` 또는 `json`을 선택합니다. |
| `--log-file` | 없음 | 실행 로그를 UTF-8 파일로 직접 저장합니다. 배치 파일은 이 옵션을 사용하여 진행 로그를 화면과 로그 파일에 동시에 표시합니다. |
| `--no-attachments` | 꺼짐 | 첨부파일 없이 목록·본문·메타데이터만 저장합니다. |
| `--download-external-links` | 꺼짐 | CLIP가 외부 URL로 제공한 별도 첨부파일도 저장합니다. |
| `--page-size` | `100` | 목록 요청당 법령 수입니다. 10, 20, 30, 50, 100만 허용됩니다. |
| `--throttle` | `0.25` | 요청 사이 대기 시간(초)입니다. 포털 부하를 위해 0보다 큰 값을 유지하십시오. |
| `--limit` | 없음 | 테스트용 최대 법령 수입니다. 지정하면 체크포인트를 만들거나 변경하지 않습니다. |
| `--max-attachments-per-law` | `0` | 법령당 첨부파일 최대 수입니다. 0은 제한 없이 모두 저장합니다. |
| `--timeout` | `45` | HTTP 요청별 제한시간(초)입니다. |

## 8. 증분 체크포인트와 신규 법령명 관리

전체 수집이 정상 종료되면 목록의 최상단 법령이 `latest_law_sync_state`에 저장됩니다. 이후 증분 수집은 포털 목록의 1페이지부터 시작하여 이 체크포인트를 찾을 때까지 필요한 페이지만 읽습니다. 체크포인트보다 앞에 있는 법령은 새로 등록된 법령으로 처리되어 본문·첨부파일을 수집하고 `latest_law_new_registrations`에 기록됩니다.

| 상황 | 체크포인트 처리 | 신규 법령명 처리 |
| --- | --- | --- |
| 최초 전체 수집 정상 완료 | 목록 최상단 법령을 새 기준선으로 저장 | 기준선 생성 목적이므로 신규 이력에 넣지 않음 |
| 일일 증분 수집에서 신규 확인 | 신규 항목 처리 후 목록 최상단 법령으로 기준선 이동 | 법령명·시행일·공포일·상세 URL·탐지시각을 기록하고 화면 출력 |
| 증분 수집에서 신규 없음 | 같은 체크포인트를 다시 확인 | `신규 등록 법령명: 없음` 출력 |
| 오류 또는 `--limit` 사용 | 체크포인트를 움직이지 않음 | 다음 실행에서 같은 신규 후보를 다시 확인하여 누락을 방지 |
| 과거 체크포인트가 포털 목록에서 사라짐 | 현재 목록 전체를 비교한 뒤 로컬 DB에 없는 법령만 신규로 처리 | 로컬 DB에 없는 신규 법령만 이력에 기록 |

## 9. 전용 테이블 구조

### 9.1 `latest_laws`: 법령 본문과 메타데이터

`latest_laws`는 최신법령 1건의 목록 정보와 전문을 보관합니다. `law_id`와 `pmgt_dt_tp_no`가 복합 기본 키이며, 법령명·시행일·공포일은 각각 `law_name`, `enforcement_date`, `promulgation_date`에 저장됩니다.

| 컬럼 | 형식 | 설명 |
| --- | --- | --- |
| `law_id`, `pmgt_dt_tp_no` | TEXT | 포털 법령번호와 공포관리번호입니다. 복합 기본 키입니다. |
| `law_name` | TEXT | 법령 한글명입니다. |
| `law_type_code`, `law_type_name` | TEXT | 법률·시행령·시행규칙 등의 유형 코드와 명칭입니다. |
| `category_code`, `category_name` | TEXT | 포털이 제공하는 분야 코드와 명칭입니다. |
| `jurisdiction_code`, `jurisdiction_name` | TEXT | 소관부처 코드와 명칭입니다. |
| `enforcement_date` | TEXT | 시행일입니다. 포털 `YYYYMMDD` 형식을 `YYYY-MM-DD`로 저장합니다. |
| `promulgation_date` | TEXT | 공포일입니다. 포털 `YYYYMMDD` 형식을 `YYYY-MM-DD`로 저장합니다. |
| `revision_type_code`, `revision_type_name` | TEXT | 제정·개정·폐지 등의 코드와 명칭입니다. |
| `revision_reason_html` | TEXT | 제개정 이유 HTML을 위한 예약 컬럼입니다. 현재 별도 탭 자료는 자동 수집하지 않아 빈 문자열일 수 있습니다. |
| `law_body_html`, `law_body_text` | TEXT | 원본 법령본문 HTML과 검색·분석용 텍스트입니다. |
| `list_payload_json` | TEXT | 목록 API가 제공한 원본 법령 레코드 JSON입니다. |
| `detail_url` | TEXT | CLIP 상세 페이지 URL입니다. |
| `content_sha256` | TEXT | 본문 HTML의 SHA-256 해시입니다. |
| `crawled_at`, `updated_at` | TEXT | 마지막 수집·갱신 시각(UTC ISO-8601)입니다. |

`promulgation_date`, `category_code`, `jurisdiction_code`에 인덱스가 생성됩니다.

### 9.2 `latest_law_attachments`: 첨부파일 파일과 상태

| 컬럼 | 형식 | 설명 |
| --- | --- | --- |
| `law_id`, `pmgt_dt_tp_no`, `attachment_id` | TEXT | 법령 복합 키와 포털 첨부파일 식별자입니다. 세 컬럼이 복합 기본 키입니다. |
| `attachment_label`, `attachment_kind` | TEXT | 포털 표시 제목과 `pdf`, `hwp`, `external` 등의 획득 유형입니다. |
| `source_url`, `original_filename` | TEXT | 다운로드 원본 URL과 HTTP 응답 기준 파일명입니다. |
| `saved_relative_path` | TEXT | `ATTACH` 루트 기준 상대 경로입니다. |
| `content_type`, `byte_size`, `sha256` | TEXT/INTEGER | MIME 형식, 파일 크기, 실제 저장 파일의 SHA-256입니다. |
| `status`, `error_message` | TEXT | `downloaded`, `failed`, `unavailable` 상태와 오류 사유입니다. |
| `downloaded_at`, `updated_at` | TEXT | 다운로드 및 마지막 상태 갱신 시각(UTC ISO-8601)입니다. |

`status`에 인덱스가 있어 실패한 파일을 확인할 수 있습니다. `status='downloaded'`이면서 실제 파일이 존재하면 다음 실행에서 다시 내려받지 않습니다.

### 9.3 `latest_law_crawl_runs`: 실행 이력

| 컬럼 | 형식 | 설명 |
| --- | --- | --- |
| `run_id`, `started_at`, `finished_at` | TEXT | 실행 UUID와 시작·종료 시각입니다. |
| `configuration_json` | TEXT | 수집 범위, 페이지, 옵션을 보관한 JSON입니다. |
| `run_mode`, `selected_pages_csv` | TEXT | `full`, `incremental`, `selected_pages` 모드와 선택 페이지 범위입니다. |
| `listed_count`, `processed_count`, `skipped_existing_count`, `law_saved_count` | INTEGER | 목록 확인·상세 처리·기존 건너뜀·법령 저장 건수입니다. |
| `attachment_downloaded_count`, `attachment_skipped_count`, `external_attachment_saved_count` | INTEGER | 파일 처리 건수입니다. |
| `list_pages_read`, `checkpoint_found` | INTEGER | 목록에서 실제 읽은 페이지 수와 증분 기준선 발견 여부입니다. |
| `new_law_count`, `new_law_names_json` | INTEGER/TEXT | 실행 중 탐지한 신규 법령 수와 법령명·일자 목록 JSON입니다. |
| `checkpoint_before_json`, `checkpoint_after_json` | TEXT | 실행 전후 체크포인트의 JSON 스냅샷입니다. |
| `error_count`, `errors_json` | INTEGER/TEXT | 오류 수와 오류 메시지 배열입니다. |

### 9.4 `latest_law_sync_state`: 전체 목록 증분 기준선

| 컬럼 | 형식 | 설명 |
| --- | --- | --- |
| `state_key` | TEXT | 기준선 키입니다. 현재 전체 최신법령용으로 `CLIP_NEWEST_LAWS_ALL`을 사용합니다. |
| `checkpoint_law_id`, `checkpoint_pmgt_dt_tp_no`, `checkpoint_law_name` | TEXT | 일일 증분 비교의 기준이 되는 포털 목록 최상단 법령 식별자와 이름입니다. |
| `checkpoint_enforcement_date`, `checkpoint_promulgation_date` | TEXT | 체크포인트 법령의 시행일·공포일입니다. |
| `checkpoint_list_page`, `baseline_mode` | INTEGER/TEXT | 체크포인트가 있었던 페이지와 전체 기준선 방식입니다. |
| `initialized_at`, `last_full_crawl_at`, `last_incremental_check_at` | TEXT | 기준선 생성·마지막 전체 수집·마지막 증분 확인 시각입니다. |
| `last_successful_run_id`, `last_new_law_count`, `last_list_total_count`, `updated_at` | TEXT/INTEGER | 마지막 정상 실행, 신규 건수, 포털 목록 총 건수, 갱신 시각입니다. |

### 9.5 `latest_law_new_registrations`: 신규 등록 법령명 이력

| 컬럼 | 형식 | 설명 |
| --- | --- | --- |
| `law_id`, `pmgt_dt_tp_no` | TEXT | 새로 탐지된 법령의 복합 기본 키입니다. |
| `law_name`, `law_type_name` | TEXT | 법령명과 유형입니다. |
| `enforcement_date`, `promulgation_date` | TEXT | 시행일과 공포일입니다. |
| `detail_url` | TEXT | 포털 상세 URL입니다. |
| `first_detected_at`, `last_detected_at` | TEXT | 처음·마지막 증분 수집에서 탐지된 시각입니다. |
| `first_detected_run_id`, `last_detected_run_id` | TEXT | 처음·마지막 탐지 실행 ID입니다. |
| `first_detected_list_page`, `detection_count` | INTEGER | 최초 탐지 목록 페이지와 재탐지 횟수입니다. 오류 재시도 시 횟수가 늘 수 있습니다. |

## 10. 읽기 전용 상태 확인 SQL

아래 SQL은 `SELECT`만 사용하는 읽기 전용 쿼리입니다. DB Browser for SQLite, SQLiteStudio, DBeaver 등에서 실행할 수 있습니다. 운영 DB에 익숙하지 않은 사용자는 `INSERT`, `UPDATE`, `DELETE`, `DROP` 문을 실행하지 마십시오.

### 최근 신규 등록 법령명

```sql
SELECT law_name, law_type_name, enforcement_date, promulgation_date,
       first_detected_at, detail_url
FROM latest_law_new_registrations
ORDER BY first_detected_at DESC, promulgation_date DESC
LIMIT 100;
```

### 현재 증분 체크포인트

```sql
SELECT checkpoint_law_name, checkpoint_enforcement_date,
       checkpoint_promulgation_date, last_full_crawl_at,
       last_incremental_check_at, last_new_law_count
FROM latest_law_sync_state
WHERE state_key = 'CLIP_NEWEST_LAWS_ALL';
```

### 최근 실행 이력

```sql
SELECT started_at, finished_at, run_mode, selected_pages_csv,
       list_pages_read, listed_count, law_saved_count,
       new_law_count, error_count
FROM latest_law_crawl_runs
ORDER BY started_at DESC, rowid DESC
LIMIT 30;
```

### 실패한 첨부파일

```sql
SELECT law_id, pmgt_dt_tp_no, attachment_label, attachment_kind,
       status, error_message, updated_at
FROM latest_law_attachments
WHERE status <> 'downloaded'
ORDER BY updated_at DESC;
```

## 11. 오류 대응

| 증상 | 가능한 원인 | 권장 조치 |
| --- | --- | --- |
| 종료 코드 `0` | 정상 완료 | `latest_law_crawl_runs`의 최근 행과 로그를 확인합니다. |
| 종료 코드 `2` | 포털 통신 실패 또는 예상하지 못한 응답 | 네트워크·포털 상태를 확인한 뒤 나중에 다시 실행합니다. |
| 종료 코드 `3` | 일부 법령 또는 첨부파일 오류 | `errors_json`과 로그를 확인하고 증분 수집을 다시 실행합니다. 체크포인트는 이동하지 않습니다. |
| `database is locked` | 다른 애플리케이션이 30초 이상 DB를 사용 | 해당 프로그램의 DB 작업을 끝낸 뒤 다시 실행합니다. |
| 증분 기준선 없음 | 전체 수집 정상 완료 전 `--incremental` 실행 | `최초_전체수집.bat` 또는 `--full`로 전체 수집을 먼저 완료합니다. |
| 선택 페이지 오류 | 잘못된 형식 또는 포털 마지막 페이지보다 큰 값 | `1`, `1,3-5` 형식을 사용하고 현재 마지막 페이지 범위를 확인합니다. |
| 최근 신규 법령명 이력 없음 | 증분 수집에서 신규 법령이 없거나 전체 기준선만 생성됨 | `신규 등록 법령명: 없음`은 정상 결과입니다. |

## 12. 검증 결과

실제 포털에 대해 `--pages 1 --limit 1 --no-attachments`로 선택 페이지 수집을 검증했습니다. **공공기록물 관리에 관한 법률 시행규칙**의 법령명·시행일·공포일·본문이 테스트 DB에 정상 저장되었습니다. 추가로 모의 DB 검사에서 기존 업무 테이블과 행을 보존하면서 전용 테이블만 추가하는지, 최초 전체 수집·선택 페이지 수집·일일 증분 수집·신규 법령명 이력·스키마 확장·읽기 전용 법령명 조회가 모두 동작하는지 확인했습니다.

## References

[1]: https://unipass.customs.go.kr/clip/index.do "관세법령정보포털 CLIP"
[2]: https://unipass.customs.go.kr/clip/lworsrch/openULS0101047Q.do?lworKcd=all "관세법령정보포털 최신법령 전체 목록"
