# 행정규칙 데이터 품질 검증 체크리스트

자동 검증:

```bash
python -m vector.quality.admin_rule_quality_test
```

전체 RAG 케이스 실행:

```bash
SMARTLAW_RUN_FULL_ADMIN_RULE_QUALITY_TEST=YES python -m vector.quality.admin_rule_quality_test
```

보고서:

`data/quality/admin-rule-quality-report.json`

DB 자동 검증이 `SKIP`이면 아래 SQL을 수동 실행한다.

---

## 수동 DB 검증 SQL

```sql
SELECT
    COUNT(*) AS total_chunks,
    COUNT(*) FILTER (
        WHERE embedding IS NOT NULL
    ) AS embedded_chunks,
    COUNT(*) FILTER (
        WHERE embedding IS NOT NULL
          AND vector_dims(embedding) = 768
    ) AS valid_dimension_chunks,
    COUNT(*) FILTER (
        WHERE cardinality(keywords) > 0
    ) AS keyword_chunks,
    COUNT(*) FILTER (
        WHERE body IS NULL
           OR btrim(body) = ''
    ) AS empty_body_count,
    COUNT(*) FILTER (
        WHERE law_name IS NULL
           OR btrim(law_name) = ''
    ) AS empty_law_name_count,
    COUNT(*) FILTER (
        WHERE document_category IS NULL
           OR btrim(document_category) = ''
    ) AS empty_document_category_count,
    COUNT(*) FILTER (
        WHERE chunk_type IS NULL
           OR btrim(chunk_type) = ''
    ) AS empty_chunk_type_count
FROM public.smartlaw_chunk
WHERE source_table = 'admin_rule'
  AND chunk_type = 'ARTICLE';
```

중복:

```sql
SELECT
    source_pk,
    COUNT(*) AS duplicate_count
FROM public.smartlaw_chunk
WHERE source_table = 'admin_rule'
  AND chunk_type = 'ARTICLE'
GROUP BY source_pk
HAVING COUNT(*) > 1;
```

정상 결과는 0건입니다.

---

## 1. 데이터 적재

- [ ] Chunk 740
- [ ] `source_table = admin_rule`
- [ ] `chunk_type = ARTICLE`
- [ ] 빈 body 0

## 2. Embedding

- [ ] Embedding 740
- [ ] 768차원 740
- [ ] Query Embedding 샘플 통과

## 3. Keyword

- [ ] Keyword 740
- [ ] `cardinality(keywords) > 0`

## 4. Metadata

- [ ] 빈 law_name 0
- [ ] 빈 document_category 0
- [ ] 빈 chunk_type 0
- [ ] article_no 또는 title/header 존재

## 5. 중복

- [ ] 중복 0
- [ ] source_pk 중복 없음

## 6. 검색 품질

- [ ] GENERAL_USAGE_APPROVAL 통과
- [ ] 결과 1~10건
- [ ] ranking_score 0~1

## 7. 조문번호 검색

- [ ] ARTICLE_29 통과
- [ ] 제29조/29조 관련 결과 포함

## 8. 법령명 검색

- [ ] 사후관리에 관한 고시 포함
- [ ] law_name_match_rate 기록

## 9. 전문용어 검색

- [ ] 전문용어 검색 통과
- [ ] CONSIGNMENT_APPROVAL 통과

## 10. 짧은 질의

- [ ] SHORT_USAGE_QUERY 통과
- [ ] "용도 외 사용" 관련 결과 포함

## 11. 비교형 질의

- [ ] COMPARE_APPROVALS 통과
- [ ] context_count >= 2

## 12. 근거 부족 질의

- [ ] LOW_EVIDENCE 정상 종료
- [ ] 답변 비어 있지 않음
- [ ] 존재하지 않는 Citation Metadata 미생성

## 13. Gemini 답변

- [ ] answer_text 공백 아님
- [ ] answer_chars 일치
- [ ] 한글 깨짐 없음

## 14. Citation

- [ ] Citation VALID
- [ ] 잘못된 Citation 0
- [ ] valid_citation_ids 1개 이상(필수 케이스)

## 15. 출처 Metadata

- [ ] cited source metadata 정상
- [ ] citation_id / id / source_pk / law_name 정상
- [ ] body·chunk_text·embedding 미포함

## 16. 보안 노출

- [ ] Prompt·Context·Embedding 미노출
- [ ] api_key / authorization / cookie / password / secret key 미포함

## 17. 응답시간

- [ ] 목표 30초 이내(초과 시 WARN 기록)
- [ ] 상한 120초 이내

## 18. 브라우저 확인

- [ ] `/admin-rule-rag` 질문·답변 확인
- [ ] 근거 링크·출처 카드 표시
- [ ] 문의 번호(request_id) 표시
- [ ] 한글 깨짐 없음

## 19. 수동 승인

- [ ] 자동 품질 보고서 확인
- [ ] 수동 DB SQL 결과 확인(자동 SKIP 시)
- [ ] 미해결 품질 이슈: ____________________
- [ ] 최종 승인자: ____________________
- [ ] 승인일: ____________________
