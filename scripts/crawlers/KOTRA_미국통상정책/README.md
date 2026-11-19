# KOTRA 미국통상정책 크롤러 V1.0

## 중요: 사이트 접근 정책

확인 시점에 KOTRA의 robots.txt는 `User-agent: *`, `Disallow: /`로 자동 수집을 금지합니다. 프로그램은 기본적으로 정책을 확인하고 수집을 중단합니다. **사이트 운영자의 사전 허가를 확인한 경우에만** `--ignore-robots`를 지정하십시오. 실제 목록 API, 상세 본문, 첨부파일의 통합 수집은 정책상 검증하지 않았으므로 허가 후 소량 시험과 파서 조정이 필요할 수 있습니다. 오프라인 모의 테스트의 성공은 실제 사이트 호환성을 보장하지 않습니다.

## 설치와 실행

1. Windows에 Python 3.9 이상을 설치하고 압축을 풀어 해당 폴더로 이동합니다.
2. 가상환경을 사용하지 않고 다음을 실행합니다.

```bat
python -m pip install -r requirements.txt
python run.py crawl --help
python -m unittest discover -s tests -v
```

3. `config.ini`에서 DB·첨부파일 경로를 확인하고 기존 DB를 백업합니다. 기본값은 `D:\SQLiteDB\smart_law_ai.db`, `D:\SQLiteDB\downloads\KOTRA\미국통상정책`입니다.
4. 사이트 운영자 허가가 있는 경우에만 아래 명령의 끝에 `--ignore-robots`를 추가할 수 있습니다.

```bat
python run.py crawl --year 2026 --week 38
python run.py crawl --start-date 20260301 --end-date 20260918
python run.py crawl --from 1 --to 10
python run.py crawl 1
python run.py crawl all
```

윈도 배치파일도 `run.bat crawl --from 1 --to 10` 형태로 같은 인자를 사용할 수 있습니다. 정책 확인을 포함한 기본 경로는 사이트 정책에 따라 중단될 수 있습니다. 기사 유형별 제외 필터는 적용하지 않습니다.

실행 예시, DB 테이블 상세, 재실행 및 장애 처리 방법은 동봉된 Word 사용가이드를 확인하십시오. 로그는 실행 폴더의 `logs\YYYY-MM-DD.log`에 기록됩니다.
