# Smart Law AI 운영 전 최종 체크리스트

운영 배포 전 수동·자동 검증 결과를 기록한다.  
자동 검증:

- `python -m vector.operations.final_verification`
- `node scripts/final-production-check.mjs`

DB 검증이 `SKIP`이면 아래 Supabase·pgvector 항목을 수동으로 반드시 확인한다.

---

## 1. 빌드 정보

- [ ] 배포 대상 브랜치/커밋 해시 기록
- [ ] 릴리스 버전/태그 기록
- [ ] `RAG_VERSION` / `RAG_BUILD` 확인
- [ ] 운영 URL 확인
- [ ] `npm run build` 성공

## 2. 환경변수

- [ ] `.env.local` Git 제외 확인
- [ ] `GEMINI_API_KEY` 설정(값 미노출)
- [ ] `GEMINI_GENERATION_MODEL` 설정
- [ ] `EMBEDDING_MODEL` 설정
- [ ] `EMBEDDING_OUTPUT_DIMENSIONALITY=768`
- [ ] `RAG_API_BASE_URL` 설정
- [ ] `DEBUG=false`
- [ ] `LOG_LEVEL=INFO`
- [ ] `MAX_QUERY_LENGTH` 범위 확인
- [ ] `REQUEST_TIMEOUT_SECONDS` 범위 확인
- [ ] `ALLOW_ORIGINS` 운영 Origin 확인
- [ ] `NEXT_PUBLIC_` 민감값 없음
- [ ] service role key 클라이언트 노출 없음

## 3. Python Runtime

- [ ] Python 3.12 이상
- [ ] `google-genai` import 가능
- [ ] `fastapi` import 가능
- [ ] `pydantic` import 가능
- [ ] `dotenv` import 가능
- [ ] Python 최종 검증 성공

## 4. Node.js Runtime

- [ ] Node.js LTS 확인
- [ ] Next.js 앱 기동 확인
- [ ] Next.js 최종 검증 성공
- [ ] Proxy Base URL 접근 가능

## 5. Supabase·pgvector

- [ ] DB 연결 성공
- [ ] DB Chunk 740건
- [ ] Embedding 740건
- [ ] Keyword 740건
- [ ] 중복 0건
- [ ] `admin_rule` ARTICLE 청크 불변식 수동 SQL 확인(자동 SKIP 시 필수)
- [ ] Vector dimension 768 확인

## 6. Gemini API

- [ ] Embedding API 호출 성공
- [ ] Generation API 호출 성공
- [ ] Timeout 설정 적용 확인
- [ ] API Key 로그 미노출 확인

## 7. RAG Pipeline

- [ ] Hybrid Search 결과 1건 이상
- [ ] Ranking score 범위 0~1
- [ ] Context Builder 성공
- [ ] Prompt Builder 성공
- [ ] Answer 생성 성공
- [ ] 실제 RAG Chat 120초 이내

## 8. Citation

- [ ] Citation Validator 동작
- [ ] Citation Metadata 포함
- [ ] Citation VALID 검증
- [ ] cited/unused source 수 합 = context_count
- [ ] Citation 안정성 검증 결과 기록

## 9. FastAPI

- [ ] `GET /health` 정상
- [ ] `POST /api/v1/rag/chat` 정상
- [ ] Request ID 확인
- [ ] 오류 응답 표준화
- [ ] CORS `ALLOW_ORIGINS` 확인
- [ ] Health에 version/build/provider/vector dimension 포함

## 10. Next.js Proxy

- [ ] `GET /api/rag/health` 정상
- [ ] `POST /api/rag/chat` 정상
- [ ] Cache-Control: no-store
- [ ] 빈 query 422
- [ ] 잘못된 JSON 400
- [ ] Extra field 422
- [ ] X-Request-ID / X-RAG-Version 확인

## 11. Frontend

- [ ] `/rag-chat` 페이지 로드
- [ ] 질문 전송·응답 표시
- [ ] Citation 하이라이트/출처 표시
- [ ] 로딩/오류 상태 표시
- [ ] 민감 정보 UI 미노출

## 12. 보안

- [ ] Prompt·Context·Embedding 미노출
- [ ] API Key / Authorization / Cookie / Secret / Password 마스킹
- [ ] service role key 서버 전용
- [ ] `.env.local` Git 제외 확인
- [ ] Prompt Injection warning 로그만 수행(차단 아님) 확인
- [ ] 운영 Origin 제한 확인

## 13. 로그

- [ ] RequestID 기록
- [ ] Search/Ranking/Context/Gemini/Total Time 기록
- [ ] Prompt/Completion Token 기록
- [ ] 민감값 마스킹 확인
- [ ] Prompt/Context 원문 미기록 확인

## 14. 성능

- [ ] Health 2초 이내
- [ ] RAG 목표 30초 이내(초과 시 WARN 기록)
- [ ] RAG 상한 120초 이내
- [ ] Timeout 동작 확인

## 15. 백업·복구

- [ ] 백업 완료
- [ ] 백업 파일 위치/시각 기록
- [ ] Rollback 절차 확인
- [ ] 복구 리허설 여부 기록

## 16. 배포 승인

- [ ] Python 최종 검증 성공 (`READY` 또는 `READY_WITH_WARNINGS`)
- [ ] Next.js 최종 검증 성공
- [ ] DB 수동 확인 완료(자동 SKIP 시)
- [ ] 잔여 WARN/FAIL 이슈 검토 완료
- [ ] 운영 URL 최종 확인
- [ ] 최종 승인자: ____________________
- [ ] 승인일: ____________________
- [ ] 비고: ____________________
