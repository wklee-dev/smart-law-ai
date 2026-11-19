# 관세법령정보포털 별표·서식 수집기

이 프로그램은 [관세법령정보포털 CLIP의 별표·서식](https://unipass.customs.go.kr/clip/lworsrch/openULS0106001Q.do) 공개 목록의 **전체 항목(법령 + 행정규칙)** 을 기본으로 조회합니다. 각 항목의 다운로드 열에 제공되는 **PDF** 및 **한글 파일(HWP/HWPX)** 을 내려받아 지정한 폴더에 저장하고, 수집 메타데이터와 파일 상태를 기존 SQLite 데이터베이스에 추가합니다. 포털의 `첨부파일` 팝업에 별도로 있는 모든 첨부파일은 요청 범위에 포함하지 않습니다.

## 구성 파일

| 파일 | 용도 |
| --- | --- |
| `clip_annex_crawler.py` | 실행 가능한 수집 프로그램입니다. |
| `requirements.txt` | 필요한 파이썬 패키지 목록입니다. |

## 설치

Python 3.9 이상을 준비한 뒤, 명령 프롬프트 또는 PowerShell에서 다음 명령을 실행합니다. 가상환경 사용은 선택 사항이지만, 다른 파이썬 프로그램과의 패키지 충돌을 줄일 수 있습니다.

```powershell
cd D:\작업폴더\clip_annex_crawler
py -m pip install -r requirements.txt
```

## 전체 수집 실행 및 건수 검증

문서에서 지정한 기본 저장 경로를 그대로 사용하려면 아래처럼 실행합니다. 기본값은 기존 SQLite DB `D:\SQLiteDB\smart_law_ai.db`와 파일 저장 폴더 `D:\SQLiteDB\ATTACH`입니다. 이 DB에는 기존 데이터가 있으므로, 최초 실행 전 날짜가 포함된 백업본을 생성하십시오.

```powershell
py clip_annex_crawler.py
```

기본 실행은 법령과 행정규칙을 모두 포함합니다. 2026-09-10 기준 포털의 전체 별표·서식은 **11,305건**이며, 법령은 8,517건, 행정규칙은 2,788건입니다. 포털 데이터는 수시로 변경될 수 있으므로 프로그램은 하드코딩한 숫자가 아니라 실행 시 포털이 반환한 총건수를 기준으로 검증합니다.

전체 범위에 필터·페이지 제한·`--max-records` 제한 없이 실행하면, 프로그램은 모든 페이지를 순회한 뒤 **포털 총건수, 실제 처리 행 수 및 고유 별표·서식 키 수가 같은지 자동 대조**합니다. 일치하지 않거나 조회 중 포털 총건수가 변경되거나 페이지가 불완전하거나 중복 키가 발견되면 오류 코드 2로 중단합니다. 따라서 부분 수집을 전체 정상 수집으로 오인하거나 서로 다른 포털 행이 같은 DB 행을 덮어쓰는 상황을 방지합니다.

포털에 요청 부담을 주지 않도록 각 요청 사이에 기본 0.25초의 간격을 둡니다. 전체 별표·서식 수가 많으므로 최초 전체 실행은 네트워크 상태와 파일 크기에 따라 시간이 걸릴 수 있습니다. 실행 로그에는 포털 총건수, 실제 처리 행 수, 고유 별표·서식 키 수, 처리 페이지 수, 검증 결과, 법종류별 건수 및 별표구분별 건수가 기록됩니다.

2026-09-10에 최종 코드로 수행한 전체 조회 검증에서는 **포털 총 11,305건 = 실제 처리 11,305건 = 고유 키 11,305건**으로 일치했습니다. 다운로드 제공 건수는 **22,501개**이며, PDF 11,196개와 HWP/HWPX 11,305개입니다. 즉, 전체 목록의 109건은 포털에 PDF 다운로드 ID가 없고 한글 파일만 제공됩니다. 이는 포털 원본의 파일 제공 차이이며, 프로그램은 존재하는 다운로드 ID만 요청하고 최종 로그에 PDF·한글 파일 수를 분리하여 표시합니다.

## 먼저 소량 시험하기

아래 명령은 첫 10개 별표·서식만 처리하므로, 경로·권한·네트워크를 검증할 때 적합합니다. 시험 후 같은 명령을 전체 실행 명령으로 바꾸면 됩니다.

```powershell
py clip_annex_crawler.py --max-records 10
```

파일을 저장하거나 DB를 수정하지 않고 조회 결과만 확인하려면 다음 명령을 사용합니다.

```powershell
py clip_annex_crawler.py --dry-run --max-records 10
```

전체 11,305건을 다운로드·DB 변경 없이 순회하며 포털 총건수 대조까지 수행하려면, `--max-records` 없이 아래 명령을 실행합니다. `--dry-run`에서는 행별 로그를 표시하지 않으므로, 전체 건수 검증에 적합합니다.

```powershell
py clip_annex_crawler.py --dry-run --delay 0
```

## 법종류·별표구분별 수집

기본값은 전체 법종류와 전체 별표구분입니다. `--law-classification`과 `--annex-form-type`을 사용하면 포털 화면의 법종류 및 별표구분과 동일한 기준으로 수집 범위를 제한할 수 있습니다. 필터를 사용하거나 특정 페이지를 지정한 실행은 의도적인 부분 수집이므로 최종 전체 건수 대조는 적용하지 않습니다.

| 수집 대상 | 실행 명령 | 2026-09-10 포털 기준 건수 |
| --- | --- | --- |
| 전체: 법령 + 행정규칙 | `py clip_annex_crawler.py` | 11,305건 |
| 법령만 | `py clip_annex_crawler.py --law-classification law` | 8,517건 |
| 행정규칙만 | `py clip_annex_crawler.py --law-classification admin` | 2,788건 |
| 전체 중 별표만 | `py clip_annex_crawler.py --annex-form-type annex` | 2,659건 |
| 전체 중 서식만 | `py clip_annex_crawler.py --annex-form-type form` | 8,621건 |
| 전체 중 별도만 | `py clip_annex_crawler.py --annex-form-type separate` | 7건 |
| 전체 중 부록만 | `py clip_annex_crawler.py --annex-form-type appendix` | 16건 |

전체 목록 순회 검증에서 포털의 별표구분 코드가 비어 있는 **2건**도 확인되었습니다. 이 2건은 포털 전체 11,305건에는 포함되어 있으나 별표·서식·별도·부록 필터 중 어느 하나로는 분류되지 않습니다. 프로그램은 이 항목을 누락시키지 않고 `미분류`로 집계하여 전체 수집에 포함합니다. 따라서 2026-09-10 검증 기준 별표구분 집계는 별표 2,659건, 서식 8,621건, 별도 7건, 부록 16건, 미분류 2건이며 합계는 11,305건입니다.

포털 화면에서 필터를 선택한 뒤 특정 페이지를 지정했다면, 동일한 `--law-classification` 및 `--annex-form-type` 옵션을 명령에도 함께 지정해야 화면의 페이지 번호와 수집 범위가 일치합니다.

## 특정 페이지 수집

`--start-page`와 `--end-page`로 포털 목록의 수집 범위를 지정할 수 있습니다. 시작·종료 페이지는 모두 포함합니다. 페이지 번호는 `--page-size`와 연결됩니다. 포털 웹 화면 기본 페이지 단위인 **10건 단위**의 페이지 번호와 동일하게 실행하려면 `--page-size 10`을 반드시 함께 지정하십시오. 기본값인 `--page-size 100`에서는 프로그램의 1페이지가 포털 화면의 10페이지 분량입니다.

| 수행 목적 | 실행 명령 | 처리 범위 |
| --- | --- | --- |
| 포털 화면 1페이지만 시험 조회 | `py clip_annex_crawler.py --page-size 10 --page 1 --dry-run` | 포털 화면 1페이지, DB·파일 미변경 |
| 포털 화면 5페이지만 수집 | `py clip_annex_crawler.py --page-size 10 --page 5` | 포털 화면 5페이지의 최대 10건 |
| 포털 화면 5~8페이지 수집 | `py clip_annex_crawler.py --page-size 10 --start-page 5 --end-page 8` | 포털 화면 5~8페이지, 최대 40건 |
| 100건 단위 프로그램 3페이지만 수집 | `py clip_annex_crawler.py --page-size 100 --start-page 3 --end-page 3` | 목록 201~300번째 행 범위 |
| 지정 페이지부터 마지막 페이지까지 수집 | `py clip_annex_crawler.py --page-size 10 --start-page 5` | 포털 화면 5페이지부터 마지막 페이지 |

`--end-page`가 `--start-page`보다 작으면 프로그램은 실행을 중단하고 오류를 표시합니다. 지정 범위에 포털의 마지막 페이지보다 큰 번호가 포함되면, 실제 마지막 페이지를 처리한 뒤 정상 종료합니다.

## 선택 옵션

| 옵션 | 설명 | 예시 |
| --- | --- | --- |
| `--db` | SQLite DB 경로를 변경합니다. | `--db "D:\SQLiteDB\smart_law_ai.db"` |
| `--attachment-dir` | PDF/HWP 저장 루트 폴더를 변경합니다. | `--attachment-dir "D:\SQLiteDB\ATTACH"` |
| `--page-size` | 포털 목록 1회 조회 건수입니다. 1–100 범위이며 기본값은 100입니다. | `--page-size 100` |
| `--start-page` | 처리할 첫 목록 페이지입니다. 기본값은 1입니다. 페이지 번호는 `--page-size` 기준입니다. | `--page-size 10 --start-page 5` |
| `--end-page` | 처리할 마지막 목록 페이지입니다. 시작 페이지를 포함하여 이 페이지까지 처리합니다. | `--page-size 10 --start-page 5 --end-page 8` |
| `--page` | 한 페이지 만 처리합니다. `--start-page N --end-page N`의 축약형이며 두 옵션과 함께 사용할 수 없습니다. | `--page-size 10 --page 5` |
| `--law-classification` | 법종류 필터입니다. `all`(기본값), `law`(법령), `admin`(행정규칙)을 사용합니다. | `--law-classification admin` |
| `--annex-form-type` | 별표구분 필터입니다. `all`(기본값), `annex`, `form`, `separate`, `appendix`를 사용합니다. | `--annex-form-type form` |
| `--delay` | 목록·파일 요청 사이의 대기 시간(초)입니다. 기본값은 0.25입니다. | `--delay 0.5` |
| `--law-name` | 법령명으로 포털 목록을 필터링합니다. | `--law-name "수입"` |
| `--form-title` | 별표/서식명으로 포털 목록을 필터링합니다. | `--form-title "신청서"` |
| `--max-records` | 시험 실행용 최대 목록 처리 건수입니다. | `--max-records 10` |
| `--dry-run` | 목록만 조회하고 다운로드·DB 쓰기를 하지 않습니다. | `--dry-run` |
| `--verbose` | HTTP 요청 등 상세 로그를 표시합니다. | `--verbose` |

## 저장 구조와 DB 추가 테이블

첨부 파일은 `ATTACH\pdf` 및 `ATTACH\hwp` 하위에 저장됩니다. 파일명에는 원래 표시된 파일명과 포털 첨부파일 ID가 함께 들어가므로, 같은 이름의 서식도 서로 덮어쓰지 않습니다. HWPX는 포털의 한글 다운로드 항목에 포함되며 `hwp` 폴더에 원래 확장자 `.hwpx`로 저장됩니다.

기존 `smart_law_ai.db`의 테이블이나 레코드는 수정·삭제하지 않습니다. 프로그램은 아래 테이블만 `CREATE TABLE IF NOT EXISTS` 방식으로 추가합니다. 즉, 동일한 이름의 전용 테이블이 아직 없을 때만 생성하며, 기존 업무 테이블에 `ALTER`, `UPDATE`, `DELETE`, `DROP` 문을 실행하지 않습니다.

| 테이블 | 내용 |
| --- | --- |
| `clip_annex_forms` | 행정규칙 별표·서식의 포털 키, 법령명, 서식명, 시행일자 및 원본 목록 JSON입니다. |
| `clip_annex_files` | PDF/HWP(HWPX) 첨부파일 ID, 저장 경로, 크기, SHA-256, 다운로드 상태 및 오류 기록입니다. |
| `clip_annex_crawl_runs` | 실행 시작·종료 시각과 건수 요약입니다. |

재실행해도 이미 정상적으로 저장된 파일은 다운로드하지 않고 SHA-256과 상태만 갱신합니다. 다운로드가 중간에 끊긴 `.part` 파일은 다음 실행에서 다시 시도합니다. 포털 오류나 특정 파일의 오류는 DB의 `clip_annex_files.last_error`에 남기고, 다음 파일 수집을 계속합니다.

## 결과 확인 예시

SQLite 도구에서 아래 SQL을 실행하면 파일 상태를 확인할 수 있습니다.

```sql
SELECT
    f.law_name,
    f.form_title,
    a.file_type,
    a.download_status,
    a.byte_size,
    a.stored_path,
    a.last_error
FROM clip_annex_forms AS f
JOIN clip_annex_files AS a ON a.form_key = f.form_key
ORDER BY a.downloaded_at DESC;
```

프로그램은 공용 포털의 공개 파일을 대상으로 하며, 포털의 운영 정책이나 접속 제한이 바뀌면 응답 형식 또는 접근 권한에 맞추어 조정이 필요할 수 있습니다.
