# 조세심판원 보도자료 크롤링 프로그램 V1.4

첨부 설계서의 ‘소식 및 소통 → 보도자료’ 전체 페이지, 상세 본문과 모든 연결 첨부파일을 수집하는 Python 3.10+ 프로그램입니다. 날짜·제목·문구별 제외 조건은 없습니다. 같은 게시판의 `[참고자료]`나 ‘폐지제정’ 등이 들어간 제목도 제외하지 않습니다. 다른 소식 게시판이나 첨부파일 내부 텍스트 추출은 대상이 아닙니다.

V1.1에서는 `--pages` 옵션을 추가했습니다. **페이지를 지정하지 않으면 기존처럼 전체 페이지를 수집합니다.** V1.2에서는 `run_all.bat`의 시작·오류·종료 기록을 날짜별 LOG 파일에 남기도록 개선했습니다. V1.3은 가상환경을 생성·검사·사용하지 않고 설치된 시스템 Python으로 직접 실행합니다. 기존 DB 스키마(V1.0/버전 1), 저장 경로와 첨부파일 처리는 변경하지 않았습니다.

## V1.4 화면 진행 표시 및 기존 폴더 적용

V1.4는 `run_all.bat` 실행 직후부터 화면에 준비 단계와 진행 메시지를 표시합니다. 표준 라이브러리만 사용하는 `run_console.py`가 같은 시스템 Python으로 `crawler.py`를 `-u`(버퍼링 없이) 실행하고, 정상 출력과 오류 출력을 한 줄씩 화면과 날짜별 LOG에 동시에 전달합니다. 추가 패키지나 가상환경은 필요하지 않습니다.

표시 항목은 설정·수집 범위·robots·DB 준비, 목록 페이지 요청과 건수, 게시글 순번/전체와 제목, 처리 완료율과 성공·실패 수, 첨부 순번·파일명·수신 바이트·완료 용량입니다. 새 출력이 없을 때는 5초 간격으로 `[대기] 작업 실행 중`을 표시합니다. 이 대기 표시는 실행기가 아직 자식 프로세스를 기다리고 있다는 뜻이며, 다운로드가 진행 중이거나 작업이 성공했다는 뜻은 아닙니다. 첨부 수신 바이트는 실제 데이터 청크가 도착할 때 최대 2초 간격으로 표시합니다.

기존 프로그램이 실행 중이라면 먼저 해당 실행이 끝난 후 적용하세요. 기존 폴더에는 **`run_all.bat`, `crawler.py`를 교체하고 `run_console.py`를 새로 추가**해야 합니다. 세 파일을 함께 적용하세요. 직접 수정한 `config.json`, DB, 다운로드 폴더와 기존 LOG는 덮어쓰거나 삭제하지 마세요. 기존 필수 패키지가 설치되어 있으면 setup을 다시 실행할 필요가 없습니다.

PowerShell 실행 예시(운영기관의 수집 허가를 확인한 경우):

```powershell
.\run_all.bat --allow-disallowed --pages 1-5
```

페이지 지정 없이 전체를 수집하려면 `--pages 1-5`를 생략합니다. Ctrl+C 시 자식 프로세스의 정리를 기다리지만, 강제 종료 시 기존 잠금·파일 확인 절차는 그대로 필요합니다. 100%는 이번 실행 대상의 처리가 끝났다는 뜻이며 실패가 없거나 전체 게시판 수집이 끝났다는 뜻은 아닙니다. 선택 범위 및 JSON의 mode/status와 오류 통계를 함께 확인하세요.

## 수집 허가 확인

2026-10-30 확인한 공식 robots.txt는 `/mUser/community/` 자동 수집을 제한합니다. 기본 실행은 정책을 확인하고 종료 코드 3으로 중단합니다. 이 경우 게시판 수집과 DB 변경을 하지 않습니다. **운영기관의 수집 허가를 받은 경우에만** `--allow-disallowed`를 직접 지정하세요. 인증·CAPTCHA·접근권한 또는 기술적 차단을 우회하는 기능은 없습니다. robots.txt를 확인할 수 없는 경우도 중단합니다.

## 기본 저장 위치

| 항목 | 위치 |
|---|---|
| 기존 SQLite DB | `D:\SQLiteDB\smart_law_ai.db` |
| 첨부파일 | `D:\SQLiteDB\downloads\조세심판원\보도자료` |
| DB 온라인 백업 | DB 상위 폴더의 `backups` |
| 날짜별 실행 로그 | 압축 해제 폴더의 `LOG\YYYYMMDD_TaxTribunalPress.LOG` |
| JSON 실행 요약 | 압축 해제 폴더의 `LOG\<run_id>_summary.json` |

기존 사용자 테이블은 삭제하거나 변경하지 않습니다. `tt_press_schema`, `tt_press_posts`, `tt_press_attachments`, `tt_press_runs`, `tt_press_errors` 전용 테이블만 생성·관리합니다. 기존 동일 이름의 스키마가 다르면 중단합니다. 기존 DB가 없으면 기본 실행은 새 DB를 만들지 않습니다.

`config.json`에서 `db_path`와 `download_root`를 실제 환경에 맞게 바꾸세요. `download_root`에는 기본 루트만 입력합니다. `category_subdir` 배열의 `조세심판원`, `보도자료`가 자동 추가됩니다. JSON의 Windows 경로는 `D:\\SQLiteDB\\smart_law_ai.db`처럼 역슬래시를 두 번 써야 합니다. 상대 경로는 config.json 위치 기준입니다. Linux/macOS에서는 Windows 경로를 실제 절대 경로로 변경하고 BAT 대신 Python으로 실행하세요.

## LOG 폴더와 즉시 종료 확인

`run_all.bat`는 실행할 때마다 프로그램 폴더의 `LOG` 폴더를 만들고, Windows 로컬 날짜 기준으로 다음 파일에 **추가 기록**합니다. 기본 폴더명은 `LOG`이며 이전 설정으로 지정한 `logs` 폴더와 혼동하지 마세요.

```text
LOG\YYYYMMDD_TaxTribunalPress.LOG
예: LOG\20261030_TaxTribunalPress.LOG
```

같은 날 여러 번 실행하면 하나의 날짜 파일에 이어서 기록됩니다. 이 파일에는 배치 시작 시각·전달 인수·작업 폴더, Python 탐지·버전·필수 패키지 오류, Python의 설정/robots/DB 오류, 종료 코드와 종료 시각이 남습니다. 따라서 창이 바로 닫혀도 우선 날짜별 `.LOG` 파일을 열어 원인을 확인하세요.

기본 `config.json`의 `log_dir`도 `LOG`입니다. `LOG` 폴더를 만들거나 파일을 쓸 권한이 없으면 배치가 화면에 오류를 내고 비정상 종료합니다. 날짜별 `.LOG`는 사람이 보는 실행 기록이며, 게시글·첨부 오류 이력은 DB의 `tt_press_errors`, 실행 통계와 설정은 JSON 요약 및 `tt_press_runs`에서 함께 확인하세요. LOG 파일은 날짜별로 누적되므로 운영 환경에서는 보관 기간과 디스크 여유 공간을 관리하세요.

## 시스템 Python 직접 사용

V1.4도 독립 가상환경을 만들지 않습니다. `setup.bat`, `run_all.bat`, `run_retry.bat`, `run_tests.bat` 모두 설치된 시스템 Python을 `py -3` 명령으로 먼저 찾고, 사용할 수 없으면 `python` 명령을 사용합니다. Python 3.10 이상이 필요합니다. 기존에 프로젝트 폴더에 가상환경 폴더가 남아 있더라도 이를 참조하거나 삭제하지 않습니다.

`setup.bat`는 현재 Windows 계정의 사용자 패키지 영역에 다음 방식으로 패키지를 설치합니다.

```bat
py -3 -m pip install --user --upgrade pip
py -3 -m pip install --user -r requirements.txt
```

일반적으로 관리자 권한은 필요하지 않습니다. 다만 조직 정책이 `--user` 설치를 막거나, pip·네트워크 접근이 제한된 경우 설치가 실패할 수 있습니다. 이 경우 화면 오류와 설치 정책을 확인하거나 IT 담당자의 승인된 Python 패키지 설치 절차를 따르세요. `run_all.bat`은 Python 3.10 미탐지나 `requests`/`bs4` 패키지 미설치도 날짜별 LOG에 남기고 종료합니다.

## 실행 방법

Python 3.10 이상을 먼저 설치한 뒤 ZIP을 예를 들어 `C:\tax_tribunal_crawler`에 압축 해제합니다. 명령 프롬프트에서 해당 폴더로 이동해 아래 명령을 실행합니다.

| 목적 | 명령 | 설명 |
|---|---|---|
| 최초 설치 | `setup.bat` | 시스템 Python 3.10+ 확인 후 현재 사용자 패키지 영역에 `requirements.txt` 설치 |
| 기본 실행 | `run_all.bat` | 전체 모드. 현재 robots 정책에서는 중단 |
| 수집 허가 후 전체 실행 | `run_all.bat --allow-disallowed` | 전체 목록·상세·첨부 수집 |
| 수집 허가 후 특정 페이지 | `run_all.bat --allow-disallowed --pages 3` | 3페이지만 수집 |
| 수집 허가 후 페이지 범위 | `run_all.bat --allow-disallowed --pages 2-4` | 2~4페이지 수집(양 끝 포함) |
| 수집 허가 후 여러 페이지 | `run_all.bat --allow-disallowed --pages "1,3,5"` | 1·3·5페이지만 수집 |
| 수집 허가 후 혼합 지정 | `run_all.bat --allow-disallowed --pages "1,3-5"` | 1·3·4·5페이지만 수집 |
| 수집 허가 후 실패 재처리 | `run_retry.bat --allow-disallowed` | 기존 실패·미완료·첨부 생략 게시글만 재처리 |
| 수집 허가 후 진단 | `run_all.bat --allow-disallowed --max-pages 1` | 첫 페이지만 수집. 전체 완료 아님 |
| 수집 허가 후 본문 진단 | `run_all.bat --allow-disallowed --max-pages 1 --no-download` | 첫 페이지 본문만 저장. 전체 완료 아님 |
| 별도 테스트 DB 신규 생성 | `run_all.bat --allow-disallowed --create-db` | config.json의 새 DB 경로를 먼저 지정한 경우만 사용 |
| 명시적 DB 백업 | `run_all.bat --allow-disallowed --backup-db` | 자동 백업 설정과 무관하게 기존 DB 백업 |
| 다른 설정 파일 | `run_all.bat --config "config_test.json" --allow-disallowed` | 마지막 --config 인수가 적용됨 |
| 오프라인 자동 테스트 | `run_tests.bat` | 네트워크 요청 없는 unittest 실행 |
| 옵션 보기 | `py -3 crawler.py --help` | `py -3`이 없으면 `python crawler.py --help` 사용 |

`--pages`의 별칭은 `--page`입니다. 페이지는 1 이상의 정수이며, 지정한 페이지를 오름차순으로 처리하고 중복은 제거합니다. 한 번에 최대 10,000개를 지정할 수 있습니다. 잘못된 형식·0·음수·역순 범위는 실행 전에 종료 코드 2로 거부합니다. 존재하지 않는 페이지나 요청과 다른 페이지가 반환되면 정상 성공으로 처리하지 않습니다. 선택하지 않은 1페이지나 다른 페이지를 추가 조회하지 않습니다.

`--pages`는 `--retry-failed` 또는 `--max-pages`와 함께 사용할 수 없습니다. `--no-download`와는 함께 사용할 수 있으며 이 경우 첨부파일을 수집하지 않습니다. 기존 `--retry-failed`와 `--max-pages`의 동시 사용도 금지됩니다. 선택·진단·재처리 모드의 종료 코드 0은 전체 게시판 수집 완료를 의미하지 않습니다. `--retry-failed`는 실패한 목록 페이지에서 아직 발견하지 못한 게시글은 복구하지 못하므로 그런 경우 전체 모드를 다시 실행하세요.

BAT 파일의 내용과 이름은 영어입니다. Windows CMD에서 실행하면 UTF-8 코드 페이지를 사용하고 시스템 Python의 종료 코드를 그대로 반환합니다. 실행 배치파일은 독립 가상환경을 생성·검사·사용하지 않습니다. Windows 실제 BAT 실행은 제공 환경에서 검증하지 못했으므로 운영 전 사용자 환경에서 점검하세요.

## 저장 및 반복 실행

게시글의 키는 `tt:press:ref_c:279`처럼 사이트 고유 ID를 사용합니다. 화면 번호 `rownum`이나 제목은 키로 사용하지 않습니다. 상세 링크에서 `ref_c`가 없으면 `board_num`을 사용합니다. 재실행 시 UPSERT로 동일 게시글의 중복 행을 만들지 않습니다. 전체 실행은 기존 성공 건도 다시 방문하고 모든 첨부파일도 다시 다운로드하여 같은 URL에서 바뀐 파일을 반영합니다.

첨부파일명은 `press_{ID종류}_{게시글ID}_{순번2자리}_{첨부키8자리}_{안전한원본파일명}`입니다. 예: `press_ref_c_279_01_ab12cd34_보도자료.hwp`. 한글 원본 파일명은 DB의 `original_filename`에 별도 보존합니다. 파일명에서 Windows 금지 문자·경로 이동 문자를 정리하고 긴 이름은 해시를 붙여 줄입니다. 첨부키 해시로 같은 이름의 파일 충돌을 방지합니다.

본문 텍스트, 본문 HTML, 상세 페이지 원문 HTML을 DB에 저장합니다. 첨부파일의 SHA-256과 바이트 크기를 기록합니다. `.part` 임시 파일이 정상 다운로드된 경우에만 최종 파일로 바꾸며, 실패 시 이전 파일은 보존합니다. HTML 오류 화면·0바이트·크기 불일치는 실패로 기록됩니다. 기본 첨부 제한은 200 MiB이며 초과 시 설정을 조정하여 재시도할 수 있습니다. 링크가 사라진 첨부는 `active=0`으로 남기고 파일이나 기존 행을 삭제하지 않습니다.

## 완료 확인 및 종료 코드

| 코드 | 의미 |
|---|---|
| 0 | 선택한 실행 모드에서 오류 없이 종료 |
| 1 | 부분 실패, 페이지 반복 또는 전체 건수 불일치 |
| 2 | 설정·DB·스키마 등 실행 오류 |
| 3 | robots 제한 또는 robots 확인 실패 |
| 130 | 사용자 중단 |

`LOG/*_summary.json`에서 `mode=full`, `status=success`, `expected_posts=discovered_posts`, `failed_posts=0`, `attachments_failed=0`을 확인해야 전체 완료로 판단할 수 있습니다. 진단 옵션 없이 실행했는지도 확인하세요. 오류는 날짜별 LOG 및 `tt_press_errors`에 남습니다. robots 중단은 DB 변경 전이므로 `tt_press_runs`에 기록되지 않고 날짜별 LOG/JSON에만 남습니다.

페이지 지정 시 `mode=selected_pages`, `requested_pages=[...]`로 JSON 요약에 기록합니다. `tt_press_runs`의 `mode`와 `notes`에도 지정 범위를 기록합니다. 이 모드의 `expected_posts`는 선택 페이지에서 발견한 건수이며 게시판 전체 건수와 비교하지 않습니다. 선택 페이지 중 목록 처리에 실패한 페이지가 있으면 `expected_posts=null`로 기록합니다. 오류 없는 선택 범위 완료는 전체 게시판 완료와 구분하세요.

기본 HTTP 요청 간격은 1.5초(설정 최소 1초), 일시 통신 오류 재시도는 최초 요청 후 최대 3회입니다. 첨부 스트리밍 실패는 전체 다운로드를 다시 시도합니다. TLS 인증서 검증은 해제할 수 없습니다.

## 백업 및 장애 대응

기존 DB가 있으면 기본적으로 실행 전 SQLite 온라인 백업을 만듭니다. DB 백업에는 다운로드 폴더가 포함되지 않습니다. 첨부파일은 별도 백업하세요. 백업 파일을 복원하기 전 DB를 사용하는 프로그램을 중지하고 현재 파일도 보관하세요. 백업과 사라진 첨부파일의 자동 정리 기능은 없으므로 저장 공간을 관리해야 합니다.

동시 실행은 `smart_law_ai.db.tt_press.lock` 파일로 방지합니다. 비정상 종료 후 이 파일이 남았다면 실제 크롤러 프로세스가 종료됐는지 확인한 경우에만 수동 삭제하세요. 실행 중에는 삭제하지 마세요.

## 검증 범위

실제 저장된 공식 목록·상세 HTML을 파싱하여 전체 표시 47건/5페이지, 첫 페이지 10건과 최신 상세 본문의 끝부분 및 첨부 링크 구조를 확인했습니다. 사이트 값은 바뀔 수 있습니다. 전체 47건의 운영 수집은 수행하지 않았으며, 사용자의 실제 DB 파일도 제공되지 않아 그 DB에서의 실행은 검증하지 못했습니다. 자동 테스트는 동봉된 테스트 파일과 `run_tests.bat`로 실행할 수 있습니다.

2026-11-04 Linux/Python 3.12.3 시스템 Python에서 V1.4의 오프라인 자동 테스트 48개가 모두 통과했습니다. 기존 기능 외에 실제 하위 프로세스 출력의 실시간 전달·화면/로그 일치·대기 표시·종료 코드·인수 보존·인자 오류와 게시글/첨부 진행 메시지를 검증했습니다. 실제 사이트 요청 없이 임시 DB와 fake HTTP로 검증한 결과이며 Windows BAT 실제 실행은 검증하지 못했습니다.

테이블의 모든 컬럼, 설정 상세 및 운영 절차는 동봉한 한글 Word 실행 가이드 V1.4를 참조하세요.

## 공식 출처

- 목록: https://www.tt.go.kr/mUser/community/pressList.do
- 상세 예시: https://www.tt.go.kr/mUser/community/pressView.do?board_idx=press&ref_c=279&pageNumber=1&rownum=47
- 정책: https://www.tt.go.kr/robots.txt

배포 파일명: `tax_tribunal_crawler_v1_4.zip`. 기존 폴더용 수정 파일 ZIP은 `tax_tribunal_progress_patch_v1_4.zip`입니다. 전체 배포 ZIP에는 소스, 설정, SQL, BAT, 테스트와 Word 가이드를 포함하며 실제 DB, 로그 및 실제 첨부파일은 포함하지 않습니다.
