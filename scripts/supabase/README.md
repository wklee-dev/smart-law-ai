# Hanjoo → Supabase 업로드

빈 Supabase 프로젝트에 로컬 `D:\SQLiteDB\smart_law_ai.db`의 Hanjoo 조회 테이블(81개)을 올립니다.  
비밀번호·`service_role` 키는 **채팅·코드·커밋에 넣지 마세요.**

## 1. Dashboard 준비

1. Project Settings → Database → **Session pooler(5432)** 연결 문자열 확인, DB 비밀번호 확보  
2. Storage → New bucket → 이름 `law-files` → **Public 해제**  
3. Storage → Settings → 업로드 파일 크기 **500MB 이상**

## 2. 테이블 만들기 (스키마)

1. `create_hanjoo_tables.sql` 내용을 복사  
2. Supabase → **SQL Editor** → New query → 붙여넣기 → Run  

이미지 BLOB(`image_data`)은 테이블에 넣지 않습니다. 나중에 Storage 키만 채웁니다.

## 3. 데이터 업로드 (본인 터미널)

```powershell
cd D:\CursorProject\smart-law-ai
pip install psycopg2-binary

# 1) Connect → Session pooler URI 복사. [YOUR-PASSWORD] 는 지우지 않아도 됨
$env:SUPABASE_DB_URL = "postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:5432/postgres"

# 2) 비밀번호는 따로 (인코딩·대괄호 넣지 말 것)
$env:SUPABASE_DB_PASSWORD = Read-Host "DB Password" -MaskInput

# 연결·건수만 확인
python scripts\upload-hanjoo-to-supabase.py --dry-run

# 작은 테이블로 시험
python scripts\upload-hanjoo-to-supabase.py --only laws,law_versions,law_articles

# 전체 (이미 같은 건수면 건너뜀)
python scripts\upload-hanjoo-to-supabase.py --skip-existing
```

연결은 **Session mode pooler 포트 5432**를 쓰세요. Transaction pooler(6543)는 COPY에 맞지 않습니다.  
비밀번호에 `@ # ! [ ]` 가 있어도 `SUPABASE_DB_PASSWORD`로 따로 넣으면 됩니다.

## 4. 다음 (파일 Storage)

첨부·이미지 파일 업로드 스크립트는 스키마·DB 적재가 끝난 뒤 진행합니다.
