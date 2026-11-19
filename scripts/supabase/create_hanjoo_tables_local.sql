-- Hanjoo 조회용 테이블 (로컬 PostgreSQL / RPA-03용)
-- Supabase anon/authenticated/service_role GRANT·RLS 구문 제외
-- pgAdmin Query Tool에서 smart_law_ai DB 선택 후 전체 실행


create schema if not exists public;
set search_path to public;

-- 파일 경로 매핑 (D:\SQLiteDB 기준 상대경로 → Storage 키)
create table if not exists public.storage_file_map (
  relative_path text primary key,
  storage_bucket text not null default 'law-files',
  storage_object_key text not null,
  original_file_name text,
  file_size bigint,
  content_type text,
  sha256 text,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_storage_file_map_sha256 on public.storage_file_map(sha256);
create unique index if not exists uq_storage_file_map_object
  on public.storage_file_map(storage_bucket, storage_object_key);

create table if not exists public."admin_rule" (
  "id" bigint,
  "gubun" text not null,
  "param" text,
  "seq_id" text,
  "law_name" text,
  "promulgation_no" text,
  "promulgation_dt" text,
  "section_type" text,
  "article_no" text,
  "article_title" text,
  "article_content" text,
  "created_at" text,
  primary key ("id")
);

create index if not exists "idx_admin_rule_param" on public."admin_rule" ("param");
create index if not exists "idx_admin_rule_gubun" on public."admin_rule" ("gubun");

create table if not exists public."bgwanse" (
  "id" bigint,
  "Gwanse_code" text not null,
  "Gwanse_semyung" text not null,
  "Gwanse_gubun" text not null,
  "Gwanse_agreecd" text not null,
  "imported_at" text not null,
  "source_file" text,
  primary key ("id"),
  unique ("Gwanse_code")
);


create table if not exists public."case_images" (
  "id" bigint,
  "case_id" bigint not null,
  "attch_file_id" text not null,
  "image_seq" bigint not null,
  "image_size" bigint,
  "content_type" text,
  "download_status" text not null,
  "error_msg" text,
  "crawled_at" text not null,
  "storage_object_key" text,
  "storage_bucket" text default 'law-files',
  primary key ("id")
);


create table if not exists public."cl_fta_attach" (
  "fta_cd" text,
  "file_url" text,
  "doc_gb" text,
  "file_nm" text,
  "save_path" text,
  "base_yr" text,
  "crawl_dt" text,
  primary key ("fta_cd", "file_url")
);


create table if not exists public."cl_fta_general" (
  "fta_cd" text,
  "sect" text,
  "gubun" text,
  "content" text,
  "base_yr" text,
  "crawl_dt" text,
  primary key ("fta_cd", "sect", "gubun")
);


create table if not exists public."cl_fta_nation" (
  "fta_cd" text,
  "fta_nm" text,
  "nation_nm" text,
  "cert_desc" text,
  "psr_desc" text,
  "effect_dt" text,
  "treaty_url" text,
  "sort_no" bigint,
  "base_yr" text,
  "crawl_dt" text,
  primary key ("fta_cd")
);


create table if not exists public."cl_fta_recom" (
  "fta_cd" text,
  "item_nm" text,
  "seq_no" bigint,
  "hsk_cd" text not null,
  "hsk_disp" text,
  "hsk_nm" text,
  "qty_txt" text,
  "agency" text,
  "base_yr" text,
  "crawl_dt" text,
  primary key ("fta_cd", "item_nm", "seq_no")
);

create index if not exists "idx_cl_fta_recom_fta_cd" on public."cl_fta_recom" ("fta_cd");

create table if not exists public."classification_cases" (
  "id" bigint,
  "committee_type" text not null,
  "committee_name" text not null,
  "rrdc_no" text,
  "reff_no" text,
  "enfr_dt" text,
  "cstm_nm" text,
  "dtrm_hs_sgn" text,
  "cmdt_nm" text,
  "cmdt_desc" text,
  "dtrm_rsn_cn" text,
  "imge_cnt" bigint,
  "attch_lst" text,
  "prlst_clsf_case_tpcd" text,
  "oppb_yn" text,
  "raw_json" text,
  "detail_html" text,
  "crawled_at" text not null,
  primary key ("id")
);


create table if not exists public."clip_admin_attachments" (
  "attachment_pk" bigint,
  "notice_id" text not null,
  "file_id" text not null,
  "original_name" text not null,
  "download_url" text not null,
  "local_path" text not null,
  "relative_path" text not null,
  "file_size" bigint not null,
  "sha256" text not null,
  "content_type" text not null,
  "download_status" text not null,
  "is_current" bigint not null,
  "downloaded_at" text,
  "last_seen_at" text not null,
  "error_message" text not null,
  primary key ("attachment_pk"),
  unique ("notice_id", "file_id")
);

create index if not exists "idx_clip_admin_attachments_download_status_is_current" on public."clip_admin_attachments" ("download_status", "is_current");

create table if not exists public."clip_admin_notices" (
  "notice_id" text,
  "title" text not null,
  "department_code" text not null,
  "department_name" text not null,
  "written_date" text not null,
  "publication_year" text not null,
  "publication_number" text not null,
  "notice_type_code" text not null,
  "source_url" text not null,
  "content_html" text not null,
  "content_text" text not null,
  "list_hash" text not null,
  "content_hash" text not null,
  "raw_list_json" text not null,
  "detail_status" text not null,
  "first_crawled_at" text not null,
  "last_crawled_at" text not null,
  "last_seen_at" text not null,
  primary key ("notice_id")
);

create index if not exists "idx_clip_admin_notices_department_code" on public."clip_admin_notices" ("department_code");
create index if not exists "idx_clip_admin_notices_written_date" on public."clip_admin_notices" ("written_date");

create table if not exists public."clip_cc_integrated_info" (
  "integrated_info_id" bigint,
  "section_key" text not null,
  "section_order" bigint not null,
  "section_title" text not null,
  "section_level" text not null,
  "body_text" text not null,
  "body_html" text not null,
  "content_hash" text not null,
  "source_url" text not null,
  "first_collected_at" text not null,
  "last_collected_at" text not null,
  "last_run_id" text not null,
  primary key ("integrated_info_id"),
  unique ("section_key")
);


create table if not exists public."clip_cc_item_requirement" (
  "requirement_id" bigint,
  "source_key" text not null,
  "hs_sgn" text not null,
  "item_name" text,
  "imex_tpcd" text,
  "imex_name" text,
  "requirement_document_name" text,
  "related_law_name" text,
  "law_record_no" text,
  "law_kind_code" text,
  "requirement_law_code" text,
  "application_start_dt" text,
  "application_end_dt" text,
  "target_detail_text" text,
  "extension_reason_text" text,
  "raw_json" text not null,
  "source_url" text not null,
  "first_collected_at" text not null,
  "last_collected_at" text not null,
  "last_run_id" text not null,
  primary key ("requirement_id"),
  unique ("source_key")
);

create index if not exists "idx_clip_cc_item_requirement_related_law_name" on public."clip_cc_item_requirement" ("related_law_name");
create index if not exists "idx_clip_cc_item_requirement_application_start_dt_applicatio" on public."clip_cc_item_requirement" ("application_start_dt", "application_end_dt");
create index if not exists "idx_clip_cc_item_requirement_hs_sgn" on public."clip_cc_item_requirement" ("hs_sgn");

create table if not exists public."clip_cc_requirement_agency" (
  "agency_id" bigint,
  "requirement_id" bigint not null,
  "application_start_dt" text,
  "application_end_dt" text,
  "agency_name" text not null,
  "source_url" text not null,
  "raw_html" text not null,
  "first_collected_at" text not null,
  "last_collected_at" text not null,
  "last_run_id" text not null,
  primary key ("agency_id"),
  unique ("requirement_id", "application_start_dt", "application_end_dt", "agency_name")
);

create index if not exists "idx_clip_cc_requirement_agency_agency_name" on public."clip_cc_requirement_agency" ("agency_name");

create table if not exists public."clip_fta_agreement_country" (
  "country_key" text,
  "country_label" text not null,
  "trty_srno" text not null,
  "doc_id" bigint,
  "treaty_number" text,
  "treaty_name" text,
  "lang" text,
  "is_primary" bigint not null,
  primary key ("country_key", "doc_id")
);

create index if not exists "idx_clip_fta_agreement_country_country_key" on public."clip_fta_agreement_country" ("country_key");
create index if not exists "idx_clip_fta_agreement_country_trty_srno" on public."clip_fta_agreement_country" ("trty_srno");

create table if not exists public."clip_fta_agreement_doc" (
  "doc_id" bigint,
  "trty_srno" text not null,
  "attachment_id" text not null,
  "countries" text,
  "primary_country" text,
  "treaty_number" text,
  "treaty_name" text,
  "effective_date" text,
  "lang" text,
  "file_name" text,
  "relative_path" text,
  "file_ext" text,
  "page_count" bigint,
  "content_text" text,
  "content_chars" bigint,
  "content_sha256" text,
  "extract_status" text not null,
  "extract_error" text,
  "source_url" text,
  "extracted_at" text,
  "updated_at" text,
  "category_name" text,
  primary key ("doc_id"),
  unique ("attachment_id")
);

create index if not exists "idx_clip_fta_agreement_doc_category_name" on public."clip_fta_agreement_doc" ("category_name");
create index if not exists "idx_clip_fta_agreement_doc_extract_status" on public."clip_fta_agreement_doc" ("extract_status");
create index if not exists "idx_clip_fta_agreement_doc_lang" on public."clip_fta_agreement_doc" ("lang");
create index if not exists "idx_clip_fta_agreement_doc_primary_country" on public."clip_fta_agreement_doc" ("primary_country");
create index if not exists "idx_clip_fta_agreement_doc_trty_srno" on public."clip_fta_agreement_doc" ("trty_srno");

create table if not exists public."clip_integrated_notice_general_info" (
  "general_info_id" bigint,
  "info_mode" text not null,
  "title" text,
  "body_text" text not null,
  "raw_html" text not null,
  "source_url" text not null,
  "content_hash" text not null,
  "first_collected_at" text not null,
  "last_collected_at" text not null,
  primary key ("general_info_id"),
  unique ("source_url", "info_mode")
);


create table if not exists public."clip_integrated_notice_items" (
  "item_id" bigint,
  "imex_knck_srno" text not null,
  "issue_code" text not null,
  "issued_date" text,
  "notice_rule_no" text,
  "hs_code" text,
  "product_name" text,
  "import_export_guidance" text not null,
  "guidance_type_code" text,
  "guidance_type_name" text,
  "related_law_no" text,
  "related_law_name" text,
  "related_link" text,
  "source_url" text not null,
  "row_hash" text not null,
  "first_collected_at" text not null,
  "last_collected_at" text not null,
  primary key ("item_id"),
  unique ("imex_knck_srno", "issue_code")
);

create index if not exists "idx_clip_integrated_notice_items_related_law_no" on public."clip_integrated_notice_items" ("related_law_no");
create index if not exists "idx_clip_integrated_notice_items_issue_code" on public."clip_integrated_notice_items" ("issue_code");
create index if not exists "idx_clip_integrated_notice_items_hs_code" on public."clip_integrated_notice_items" ("hs_code");

create table if not exists public."clip_ipr_content" (
  "rec_id" bigint,
  "src_url" text not null,
  "page_ttl" text not null,
  "body_html" text not null,
  "body_txt" text not null,
  "content_hash" text not null,
  "retrieved_at" text not null,
  "created_at" text not null,
  primary key ("rec_id"),
  unique ("src_url")
);

create index if not exists "idx_clip_ipr_content_retrieved_at" on public."clip_ipr_content" ("retrieved_at");

create table if not exists public."clip_nk_trade_content" (
  "rec_id" bigint,
  "src_url" text not null,
  "page_ttl" text not null,
  "body_html" text not null,
  "body_txt" text not null,
  "content_hash" text not null,
  "retrieved_at" text not null,
  "created_at" text not null,
  primary key ("rec_id"),
  unique ("src_url")
);

create index if not exists "idx_clip_nk_trade_content_retrieved_at" on public."clip_nk_trade_content" ("retrieved_at");

create table if not exists public."clip_precedent" (
  "id" bigint,
  "gubun" text,
  "dsbd_incd_clsf_cd" text,
  "dsbd_incd_clsf_cd_nm" text,
  "dsbd_incd_dtrm_ofc_cstm_sgn" text,
  "dsbd_incd_dtrm_ofc_cstm_sgn_nm" text,
  "dsbd_incd_no" text,
  "dsbd_isue_lrcl_cd" text,
  "dsbd_isue_lrcl_cd_nm" text,
  "dtrm_dt" text,
  "incd_no" text,
  "wrdc_ttle" text,
  "created_at" text,
  primary key ("id")
);

create index if not exists "idx_clip_precedent_gubun" on public."clip_precedent" ("gubun");
create index if not exists "idx_clip_precedent_dsbd_incd_no" on public."clip_precedent" ("dsbd_incd_no");
create index if not exists "idx_clip_precedent_incd_no" on public."clip_precedent" ("incd_no");

create table if not exists public."clip_precedent_detail" (
  "id" bigint,
  "gubun" text,
  "dsbd_incd_no" text,
  "incd_no" text,
  "dtrm_type" text,
  "order_text" text,
  "claim_reason" text,
  "claimant_arg" text,
  "agency_arg" text,
  "issue" text,
  "judgement" text,
  "conclusion" text,
  "created_at" text,
  primary key ("id")
);

create index if not exists "idx_clip_precedent_detail_incd_no" on public."clip_precedent_detail" ("incd_no");
create index if not exists "idx_clip_precedent_detail_dsbd_incd_no" on public."clip_precedent_detail" ("dsbd_incd_no");

create table if not exists public."clip_precedent_hs" (
  "id" bigint,
  "gubun" text,
  "dsbd_incd_no" text,
  "hs_code" text,
  "kor_name" text,
  "eng_name" text,
  "created_at" text,
  primary key ("id")
);


create table if not exists public."clip_precedent_law" (
  "id" bigint,
  "gubun" text,
  "dsbd_incd_no" text,
  "law_name" text,
  "law_content" text,
  "created_at" text,
  primary key ("id")
);


create table if not exists public."clip_standard_product_code" (
  "id" bigint,
  "seq_no" bigint not null,
  "std_code" text not null,
  "hs_code" text not null,
  "item_name" text not null,
  "std_item_name" text not null,
  "std_spec" text not null,
  "imported_at" text not null,
  "source_file" text,
  primary key ("id"),
  unique ("seq_no")
);

create index if not exists "idx_clip_standard_product_code_std_code" on public."clip_standard_product_code" ("std_code");
create index if not exists "idx_clip_standard_product_code_hs_code" on public."clip_standard_product_code" ("hs_code");

create table if not exists public."clip_statistical_code" (
  "stat_code" text,
  "stat_sign" text not null,
  "stat_name" text not null,
  "source_seq" bigint not null,
  "imported_at" text not null,
  "source_file" text,
  primary key ("stat_code")
);

create index if not exists "idx_clip_statistical_code_stat_name" on public."clip_statistical_code" ("stat_name");

create table if not exists public."clip_statistical_code_detail" (
  "id" bigint,
  "stat_code" text not null,
  "stat_name" text not null,
  "source_seq" bigint not null,
  "detail_code" text not null,
  "name_kr" text not null,
  "abbr_kr" text not null,
  "name_en" text not null,
  "abbr_en" text not null,
  "note_en" text not null,
  "imported_at" text not null,
  "source_file" text,
  primary key ("id"),
  unique ("stat_code", "detail_code")
);

create index if not exists "idx_clip_statistical_code_detail_stat_code" on public."clip_statistical_code_detail" ("stat_code");

create table if not exists public."clip_strategic_material_content" (
  "rec_id" bigint,
  "src_url" text not null,
  "page_ttl" text not null,
  "body_html" text not null,
  "body_txt" text not null,
  "content_hash" text not null,
  "retrieved_at" text not null,
  "created_at" text not null,
  primary key ("rec_id"),
  unique ("src_url")
);

create index if not exists "idx_clip_strategic_material_content_retrieved_at" on public."clip_strategic_material_content" ("retrieved_at");

create table if not exists public."clip_tariff_rate" (
  "id" bigint,
  "hs_code" text not null,
  "hs_code_display" text not null,
  "tariff_category" text not null,
  "item_name" text not null,
  "category_symbol" text not null,
  "tariff_rate" text not null,
  "amount_per_unit" text not null,
  "effective_start_date" text not null,
  "effective_end_date" text not null,
  "base_price" text not null,
  "country_apply_type" text not null,
  "usage_rate_type" text not null,
  "imported_at" text not null,
  "source_file" text,
  primary key ("id")
);

create index if not exists "idx_clip_tariff_rate_category_symbol" on public."clip_tariff_rate" ("category_symbol");
create index if not exists "idx_clip_tariff_rate_effective_start_date_effective_end_date" on public."clip_tariff_rate" ("effective_start_date", "effective_end_date");
create index if not exists "idx_clip_tariff_rate_item_name" on public."clip_tariff_rate" ("item_name");
create index if not exists "idx_clip_tariff_rate_hs_code" on public."clip_tariff_rate" ("hs_code");

create table if not exists public."clip_treaties" (
  "trty_srno" text,
  "treaty_name" text not null,
  "category_code" text,
  "category_name" text,
  "countries" text,
  "treaty_number" text,
  "effective_date" text,
  "registered_date" text,
  "list_page" bigint not null,
  "list_row_number" bigint,
  "korean_content" text,
  "english_content" text,
  "detail_text" text,
  "detail_html" text,
  "source_url" text not null,
  "raw_list_json" text not null,
  "crawled_at" text not null,
  "updated_at" text not null,
  primary key ("trty_srno")
);

create index if not exists "idx_clip_treaties_category_code" on public."clip_treaties" ("category_code");
create index if not exists "idx_clip_treaties_effective_date" on public."clip_treaties" ("effective_date");

create table if not exists public."foreign_case_images" (
  "id" bigint,
  "country_code" text not null,
  "case_srno" text not null,
  "seq" bigint not null,
  "image_url" text not null,
  "image_ext" text,
  "image_size" bigint,
  "local_path" text,
  "storage_object_key" text,
  "storage_bucket" text default 'law-files',
  primary key ("id"),
  unique ("country_code", "case_srno", "seq")
);

create index if not exists "idx_foreign_case_images_country_code_case_srno" on public."foreign_case_images" ("country_code", "case_srno");
create index if not exists "idx_foreign_case_images_country_code_case_srno" on public."foreign_case_images" ("country_code", "case_srno");

create table if not exists public."foreign_cases" (
  "id" bigint,
  "prlst_clsf_srno" text not null,
  "country" text,
  "country_code" text,
  "tab_country_code" text,
  "base_year" text,
  "ref_no" text,
  "enforce_date" text,
  "hs_code" text,
  "image_count" bigint,
  "issue_org" text,
  "category" text,
  "customs_office" text,
  "goods_name" text,
  "goods_name_etc" text,
  "goods_name_decl" text,
  "other_name" text,
  "material" text,
  "purpose" text,
  "issue_place" text,
  "keyword" text,
  "reply_org" text,
  "reply_eng" text,
  "reply_kor" text,
  "goods_desc_org" text,
  "goods_desc_eng" text,
  "goods_desc_kor" text,
  "reason_org" text,
  "reason_eng" text,
  "reason_kor" text,
  "crawled_at" text,
  primary key ("id"),
  unique ("country_code", "prlst_clsf_srno")
);

create index if not exists "idx_foreign_cases_ref_no" on public."foreign_cases" ("ref_no");
create index if not exists "idx_foreign_cases_hs_code" on public."foreign_cases" ("hs_code");
create index if not exists "idx_foreign_cases_enforce_date" on public."foreign_cases" ("enforce_date");
create index if not exists "idx_foreign_cases_tab_country_code" on public."foreign_cases" ("tab_country_code");
create index if not exists "idx_foreign_cases_country_code" on public."foreign_cases" ("country_code");

create table if not exists public."fta_agreement_master" (
  "agreement_id" bigint,
  "nation_code" text not null,
  "nation_name_kr" text,
  "nation_name_en" text,
  "fta_id" text,
  "tab_order" bigint,
  "crawl_yn" text,
  "source_url" text,
  "collected_at" text,
  "updated_at" text,
  primary key ("agreement_id"),
  unique ("nation_code")
);


create table if not exists public."fta_execution_guidance_post" (
  "post_id" bigint,
  "bbs_id" bigint not null,
  "ntt_sn" bigint not null,
  "ntt_sn_url" text not null,
  "list_number" bigint,
  "category" text,
  "title" text not null,
  "author" text,
  "registered_date" text,
  "view_count" bigint,
  "content_html" text,
  "content_text" text,
  "source_url" text not null,
  "row_hash" text not null,
  "content_hash" text not null,
  "list_page" bigint,
  "first_collected_at" text not null,
  "last_collected_at" text not null,
  "last_verified_at" text not null,
  primary key ("post_id"),
  unique ("bbs_id", "ntt_sn")
);

create index if not exists "idx_fta_execution_guidance_post_title" on public."fta_execution_guidance_post" ("title");
create index if not exists "idx_fta_execution_guidance_post_registered_date_ntt_sn" on public."fta_execution_guidance_post" ("registered_date", "ntt_sn");

create table if not exists public."fta_general_materials" (
  "id" bigint,
  "source_name" text not null,
  "source_board_id" text not null,
  "source_post_id" bigint not null,
  "source_post_token" text not null,
  "list_number" text,
  "agreement_name" text,
  "title" text not null,
  "author" text,
  "registered_date" text,
  "view_count" bigint,
  "content_text" text,
  "content_html" text,
  "source_url" text not null,
  "crawled_at_utc" text not null,
  primary key ("id"),
  unique ("source_name", "source_board_id", "source_post_id")
);

create index if not exists "idx_fta_general_materials_source_post_id" on public."fta_general_materials" ("source_post_id");
create index if not exists "idx_fta_general_materials_registered_date" on public."fta_general_materials" ("registered_date");

create table if not exists public."fta_hs_chapter" (
  "chapter_id" bigint,
  "nation_code" text,
  "fta_id" text,
  "chapter_code" text,
  "chapter_name_kr" text,
  "chapter_name_en" text,
  "collected_at" text,
  primary key ("chapter_id"),
  unique ("nation_code", "chapter_code")
);


create table if not exists public."fta_hs_item" (
  "item_id" bigint,
  "nation_code" text,
  "fta_id" text,
  "chapter_code" text,
  "hs_no" text,
  "division" text,
  "item_name" text,
  "cl_type" text,
  "base_year" text,
  "base_rate" text,
  "has_year_link" text,
  "source_url" text,
  "collected_at" text,
  primary key ("item_id"),
  unique ("nation_code", "hs_no")
);

create index if not exists "idx_fta_hs_item_nation_code_chapter_code" on public."fta_hs_item" ("nation_code", "chapter_code");

create table if not exists public."fta_hs_rate_year" (
  "rate_id" bigint,
  "nation_code" text,
  "hs_no" text,
  "cl_type" text,
  "rate_year" text,
  "agreement_rate" text,
  "source_url" text,
  "collected_at" text,
  primary key ("rate_id"),
  unique ("nation_code", "hs_no", "rate_year")
);

create index if not exists "idx_fta_hs_rate_year_nation_code_hs_no" on public."fta_hs_rate_year" ("nation_code", "hs_no");

create table if not exists public."fta_pass_origin_rules" (
  "rule_hash" text,
  "hs_version" text,
  "hs6_code" text,
  "agreement_code" text,
  "agreement_name" text,
  "goods4_name" text,
  "goods6_name" text,
  "origin_rule_text" text,
  "origin_rule_html" text,
  "abbreviation" text,
  "main_no" text,
  "mid_no" text,
  "ex_value" text,
  "use_yn" text,
  "raw_row_json" text not null,
  "first_seen_at" text not null,
  "last_seen_at" text not null,
  primary key ("rule_hash")
);

create index if not exists "idx_fta_pass_origin_rules_hs_version_hs6_code_agreement_code" on public."fta_pass_origin_rules" ("hs_version", "hs6_code", "agreement_code");

create table if not exists public."fta_psr_category" (
  "id" bigint,
  "agreement_key" text not null,
  "agreement_name" text not null,
  "category_code" text not null,
  "item_name_ko" text,
  "item_name_en" text,
  "source_url" text not null,
  "retrieved_at" text not null,
  primary key ("id"),
  unique ("agreement_key", "category_code")
);


create table if not exists public."fta_psr_item" (
  "id" bigint,
  "agreement_key" text not null,
  "agreement_name" text not null,
  "category_code" text,
  "hs_code" text not null,
  "division" text,
  "item_name_ko" text,
  "item_name_en" text,
  "preference_criterion_ko" text,
  "preference_criterion_en" text,
  "source_url" text not null,
  "retrieved_at" text not null,
  "row_hash" text not null,
  primary key ("id"),
  unique ("agreement_key", "hs_code", "item_name_ko", "preference_criterion_ko")
);

create index if not exists "idx_fta_psr_item_agreement_key_hs_code" on public."fta_psr_item" ("agreement_key", "hs_code");

create table if not exists public."ftapass_origin_determination" (
  "id" bigint,
  "row_hash" text not null,
  "input_hs6_cd" text not null,
  "stdyy" text,
  "ont_agree_cd" text,
  "ont_agree_nm" text,
  "hs6_cd" text,
  "main_no" text,
  "main_nm" text,
  "mid_no" text,
  "mid_nm" text,
  "gods4_name" text,
  "gods6_name" text,
  "org_dcsn_base" text,
  "co_prt_cd" text,
  "last_stdyy" text,
  "gods6_name_en" text,
  "org_dcsn_base_en" text,
  "ont_agree_nm_en" text,
  "cmpn_cd" text,
  "reg_dt" text,
  "mdf_dt" text,
  "use_yn" text,
  "mdf_user_id" text,
  "source_url" text not null,
  "fetched_at" text not null,
  primary key ("id"),
  unique ("row_hash")
);

create index if not exists "idx_ftapass_origin_determination_stdyy" on public."ftapass_origin_determination" ("stdyy");
create index if not exists "idx_ftapass_origin_determination_hs6_cd" on public."ftapass_origin_determination" ("hs6_cd");

create table if not exists public."hs_import_declaration_guide" (
  "hs_code" text,
  "product_name" text,
  "source_updated_at" text,
  "name_guidance" text,
  "name_example" text,
  "name_error_example" text,
  "transaction_name_guidance" text,
  "transaction_name_example" text,
  "transaction_name_error_example" text,
  "model_spec_guidance" text,
  "model_spec_example" text,
  "model_spec_error_example" text,
  "ingredient_guidance" text,
  "ingredient_example" text,
  "ingredient_error_example" text,
  "import_requirement_guidance" text,
  "import_requirement_example" text,
  "import_requirement_error_example" text,
  "declaration_caution" text,
  "special_material" text,
  "remarks" text,
  "use_yn" text,
  "source_created_by" text,
  "source_created_at" text,
  "detail_url" text,
  "source_list_url" text,
  "source_payload_json" text,
  "content_sha256" text,
  "first_crawled_at" text,
  "last_crawled_at" text,
  primary key ("hs_code")
);


create table if not exists public."hs_manual_content" (
  "id" bigint,
  "meta_id" bigint not null,
  "content_type" text not null,
  "lang_code" text not null,
  "content_text" text,
  "created_at" timestamptz,
  primary key ("id"),
  unique ("meta_id", "content_type", "lang_code")
);

create index if not exists "idx_hs_manual_content_content_type" on public."hs_manual_content" ("content_type");
create index if not exists "idx_hs_manual_content_lang_code" on public."hs_manual_content" ("lang_code");
create index if not exists "idx_hs_manual_content_meta_id" on public."hs_manual_content" ("meta_id");

create table if not exists public."hs_manual_gnpr" (
  "id" bigint,
  "aply_year" text not null,
  "gnpr_srno" text not null,
  "lang_code" text not null,
  "content_text" text,
  "created_at" timestamptz,
  primary key ("id"),
  unique ("aply_year", "gnpr_srno", "lang_code")
);

create index if not exists "idx_hs_manual_gnpr_gnpr_srno" on public."hs_manual_gnpr" ("gnpr_srno");
create index if not exists "idx_hs_manual_gnpr_aply_year" on public."hs_manual_gnpr" ("aply_year");

create table if not exists public."hs_manual_meta" (
  "id" bigint,
  "aply_year" text not null,
  "manl_orgn_tpcd" text,
  "manl_orgn_tpcd_nm" text,
  "manl_ut_tpcd" text not null,
  "manl_ut_tpcd_nm" text,
  "manl_ut_sgn" text not null,
  "display_title" text,
  "rgsr_dt" text,
  "created_at" timestamptz,
  primary key ("id"),
  unique ("aply_year", "manl_ut_tpcd", "manl_ut_sgn")
);

create index if not exists "idx_hs_manual_meta_manl_ut_sgn" on public."hs_manual_meta" ("manl_ut_sgn");
create index if not exists "idx_hs_manual_meta_manl_ut_tpcd" on public."hs_manual_meta" ("manl_ut_tpcd");
create index if not exists "idx_hs_manual_meta_aply_year" on public."hs_manual_meta" ("aply_year");

create table if not exists public."imex_notice_item" (
  "notice_item_key" text,
  "notice_key" text not null,
  "imex_knck_srno" text not null,
  "hs_code" text,
  "item_name" text,
  "guidance_text" text,
  "guidance_html" text,
  "imex_type_code" text,
  "imex_type_name" text,
  "relation_rule_no" text,
  "relation_rule_name" text,
  "source_row_num" bigint,
  "source_last_changed_at" text,
  "raw_json" text not null,
  "first_crawled_at" text not null,
  "last_crawled_at" text not null,
  primary key ("notice_item_key"),
  unique ("notice_key", "imex_knck_srno")
);

create index if not exists "idx_imex_notice_item_imex_type_code" on public."imex_notice_item" ("imex_type_code");
create index if not exists "idx_imex_notice_item_hs_code" on public."imex_notice_item" ("hs_code");
create index if not exists "idx_imex_notice_item_notice_key" on public."imex_notice_item" ("notice_key");

create table if not exists public."imex_notice_master" (
  "notice_key" text,
  "admn_rule_no" text not null,
  "pmgt_dt_tp_no" text not null,
  "notice_no" text not null,
  "notice_date" text,
  "source_url" text not null,
  "total_item_count" bigint not null,
  "first_crawled_at" text not null,
  "last_crawled_at" text not null,
  primary key ("notice_key"),
  unique ("admn_rule_no", "pmgt_dt_tp_no")
);

create index if not exists "idx_imex_notice_master_notice_date" on public."imex_notice_master" ("notice_date");

create table if not exists public."imex_notice_summary" (
  "notice_key" text,
  "source_url" text not null,
  "content_html" text not null,
  "content_text" text not null,
  "content_sha256" text not null,
  "first_crawled_at" text not null,
  "last_crawled_at" text not null,
  primary key ("notice_key")
);


create table if not exists public."jangchi_code" (
  "sqlite_rowid" bigint,
  "jangchi_cnt" text,
  "jangchi_code" text not null,
  "jangchi_name" text,
  "jangchi_gwa" text,
  "jangchi_gasan_yn" text,
  "jangchi_jukyong_date" text,
  "jangchi_post" text,
  "jangchi_juso" text,
  "addtax_daesang" text,
  "bfiphanggbn" text,
  "jangchi_se" text,
  "jangchi_egwa" text,
  "jangchi_place" text,
  "jangchi_juso2" text,
  primary key ("sqlite_rowid")
);

create index if not exists "idx_jangchi_code_jangchi_se" on public."jangchi_code" ("jangchi_se");
create index if not exists "idx_jangchi_code_jangchi_name" on public."jangchi_code" ("jangchi_name");
create index if not exists "idx_jangchi_code_jangchi_code" on public."jangchi_code" ("jangchi_code");

create table if not exists public."kita_strategic_material_control" (
  "control_no" text,
  "first_seen_at" text not null,
  "last_seen_at" text not null,
  primary key ("control_no")
);


create table if not exists public."kita_strategic_material_hs" (
  "hs_code" text,
  "hs_name_ko" text not null,
  "hs_name_en" text not null,
  "first_seen_at" text not null,
  "last_seen_at" text not null,
  primary key ("hs_code")
);


create table if not exists public."kita_strategic_material_mapping" (
  "hs_code" text,
  "control_no" text,
  "content_ko" text not null,
  "content_en" text not null,
  "source_url" text not null,
  "first_seen_at" text not null,
  "last_seen_at" text not null,
  primary key ("hs_code", "control_no")
);

create index if not exists "idx_kita_strategic_material_mapping_control_no" on public."kita_strategic_material_mapping" ("control_no");

create table if not exists public."latest_laws" (
  "law_id" text,
  "pmgt_dt_tp_no" text,
  "law_name" text not null,
  "law_type_code" text,
  "law_type_name" text,
  "category_code" text,
  "category_name" text,
  "jurisdiction_code" text,
  "jurisdiction_name" text,
  "enforcement_date" text,
  "promulgation_date" text,
  "revision_type_code" text,
  "revision_type_name" text,
  "revision_reason_html" text,
  "law_body_html" text not null,
  "law_body_text" text not null,
  "list_payload_json" text not null,
  "detail_url" text not null,
  "content_sha256" text not null,
  "crawled_at" text not null,
  "updated_at" text not null,
  primary key ("law_id", "pmgt_dt_tp_no")
);

create index if not exists "idx_latest_laws_jurisdiction_code" on public."latest_laws" ("jurisdiction_code");
create index if not exists "idx_latest_laws_category_code" on public."latest_laws" ("category_code");
create index if not exists "idx_latest_laws_promulgation_date" on public."latest_laws" ("promulgation_date");

create table if not exists public."law_article_items" (
  "id" bigint,
  "law_article_id" bigint,
  "item_level" text,
  "parent_item_id" bigint,
  "item_no" text,
  "item_content" text,
  "display_order" bigint,
  "depth" bigint,
  "raw_json" text,
  primary key ("id")
);


create table if not exists public."law_articles" (
  "id" bigint,
  "law_version_id" bigint,
  "structure_node_id" bigint,
  "article_key" text,
  "article_no" bigint,
  "article_title" text,
  "article_content" text,
  "article_type" text,
  "article_revision_type" text,
  "article_effective_date" text,
  "article_changed_yn" text,
  "article_moved_from" text,
  "article_moved_to" text,
  "article_reference" text,
  "display_order" bigint,
  "raw_json" text,
  primary key ("id")
);


create table if not exists public."law_list" (
  "id" bigint,
  "history_id" bigint,
  "law_id" text,
  "law_seq" text,
  "law_name_kr" text,
  "law_name_short" text,
  "prom_date" text,
  "prom_no" text,
  "enf_date" text,
  "ministry_code" text,
  "ministry_name" text,
  "law_type_name" text,
  "amend_type_name" text,
  "law_detail_link" text,
  "excel_bunryu" text,
  "raw_json" text,
  primary key ("id")
);


create table if not exists public."law_versions" (
  "id" bigint,
  "law_id" bigint,
  "version_key" text,
  "promulgation_no" text,
  "promulgation_date" text,
  "enforcement_date" text,
  "revision_type" text,
  "article_effective_text" text,
  "promulgated_law_yn" text,
  "contact_phone" text,
  "contact_department_name" text,
  "is_current" bigint,
  "raw_json" text,
  "created_at" text,
  "updated_at" text,
  primary key ("id")
);


create table if not exists public."laws" (
  "id" bigint,
  "law_id" text,
  "law_key" text,
  "law_name_kr" text,
  "law_name_hanja" text,
  "law_name_short" text,
  "law_type_name" text,
  "law_type_code" text,
  "ministry_name" text,
  "ministry_code" text,
  "language" text,
  "raw_json" text,
  "created_at" text,
  "updated_at" text,
  primary key ("id")
);


create table if not exists public."nlc_ministry_administrative_notice" (
  "notice_sequence" text,
  "source_url" text not null,
  "title" text,
  "rule_type" text,
  "institution" text,
  "notice_number" text,
  "announcement_date" text,
  "start_date" text,
  "end_date" text,
  "phone" text,
  "fax" text,
  "email" text,
  "view_count" bigint,
  "detail_info_json" text not null,
  "body_html" text,
  "body_text" text,
  "body_sha256" text,
  "first_collected_at" text not null,
  "last_collected_at" text not null,
  "last_run_id" bigint,
  primary key ("notice_sequence")
);

create index if not exists "idx_nlc_ministry_administrative_notice_start_date_end_date" on public."nlc_ministry_administrative_notice" ("start_date", "end_date");

create table if not exists public."nlc_ministry_legislation_notice" (
  "notice_sequence" text,
  "source_url" text not null,
  "title" text,
  "department" text,
  "law_type" text,
  "law_field" text,
  "target_audience" text,
  "notice_number" text,
  "announcement_date" text,
  "start_date" text,
  "end_date" text,
  "view_count" bigint,
  "detail_info_json" text not null,
  "body_html" text,
  "body_text" text,
  "body_sha256" text,
  "first_collected_at" text not null,
  "last_collected_at" text not null,
  "last_run_id" bigint,
  primary key ("notice_sequence")
);

create index if not exists "idx_nlc_ministry_legislation_notice_start_date_end_date" on public."nlc_ministry_legislation_notice" ("start_date", "end_date");

create table if not exists public."nlc_notice_attachment" (
  "attachment_id" bigint,
  "notice_type" text not null,
  "notice_sequence" text not null,
  "file_sequence" text not null,
  "category" text,
  "file_name" text not null,
  "download_url" text not null,
  "local_path" text,
  "file_size" bigint,
  "checksum_sha256" text,
  "download_status" text not null,
  "download_error" text,
  "first_seen_at" text not null,
  "last_seen_at" text not null,
  "downloaded_at" text,
  "last_run_id" bigint,
  primary key ("attachment_id"),
  unique ("notice_type", "notice_sequence", "file_sequence")
);

create index if not exists "idx_nlc_notice_attachment_notice_type_notice_sequence" on public."nlc_notice_attachment" ("notice_type", "notice_sequence");

create table if not exists public."openlaw_admrul_info" (
  "admrul_seq" bigint,
  "jo_no" text,
  "jo_yn" text,
  "jo_title" text,
  "jo_enforce_dt" bigint,
  "jo_content" text,
  "hang" text,
  "ho" text,
  "mok" text,
  "crawled_at" timestamptz,
  primary key ("admrul_seq", "jo_no")
);


create table if not exists public."openlaw_admrul_list" (
  "admrul_seq" bigint,
  "admrul_nm" text,
  "issue_dt" bigint,
  "issue_no" text,
  "enact_type" text,
  "dept_nm" text,
  "admrul_type" text,
  "enforce_dt" bigint,
  "admrul_link" text,
  "crawled_at" timestamptz,
  primary key ("admrul_seq")
);


create table if not exists public."openlaw_admrul_oldnew_info" (
  "admrul_seq" bigint,
  "enforce_dt" bigint,
  "jo_no" text,
  "old_jo_content" text,
  "new_jo_content" text,
  "crawled_at" timestamptz,
  primary key ("admrul_seq", "enforce_dt", "jo_no")
);


create table if not exists public."openlaw_admrul_oldnew_list" (
  "oldnew_seq" bigint,
  "admrul_nm" text,
  "old_issue_dt" bigint,
  "old_issue_no" text,
  "new_issue_dt" bigint,
  "new_issue_no" text,
  "dept_nm" text,
  "crawled_at" timestamptz,
  primary key ("oldnew_seq")
);


create table if not exists public."openlaw_efyd_info" (
  "law_id" bigint,
  "enforce_dt" bigint,
  "promul_dt" bigint,
  "promul_no" bigint,
  "lang" text,
  "law_type" text,
  "law_type_cd" text,
  "law_nm_ko" text,
  "law_nm_cn" text,
  "law_abbr" text,
  "title_change_yn" text,
  "ko_law_yn" text,
  "chapter_seq" bigint,
  "dept_cd" bigint,
  "dept_nm" text,
  "phone" text,
  "enact_type" text,
  "annex_edit_yn" text,
  "promul_law_yn" text,
  "contact_dept" text,
  "contact_phone" text,
  "joint_ord_type" text,
  "crawled_at" timestamptz,
  primary key ("law_id", "enforce_dt")
);


create table if not exists public."openlaw_efyd_jo" (
  "law_id" bigint,
  "enforce_dt" bigint,
  "jo_no" text,
  "jo_yn" text,
  "jo_title" text,
  "jo_enforce_dt" bigint,
  "jo_content" text,
  "hang" text,
  "ho" text,
  "mok" text,
  "crawled_at" timestamptz,
  primary key ("law_id", "enforce_dt", "jo_no")
);


create table if not exists public."openlaw_efyd_list" (
  "law_seq" bigint,
  "history_code" text,
  "law_nm" text,
  "law_abbr" text,
  "law_id" bigint,
  "promul_dt" bigint,
  "promul_no" bigint,
  "enact_type" text,
  "dept_cd" text,
  "dept_nm" text,
  "law_type" text,
  "joint_ord_yn" text,
  "promul_no_joint" text,
  "enforce_dt" bigint,
  "self_law_yn" text,
  "law_link" text,
  "crawled_at" timestamptz,
  primary key ("law_seq")
);


create table if not exists public."openlaw_nw_info" (
  "law_id" bigint,
  "promul_dt" bigint,
  "enforce_dt" bigint,
  "promul_no" bigint,
  "lang" text,
  "law_type" text,
  "law_type_cd" text,
  "law_nm_ko" text,
  "law_nm_cn" text,
  "law_abbr" text,
  "title_change_yn" text,
  "ko_law_yn" text,
  "chapter_seq" bigint,
  "dept_cd" bigint,
  "dept_nm" text,
  "phone" text,
  "enact_type" text,
  "annex_edit_yn" text,
  "promul_law_yn" text,
  "contact_dept" text,
  "contact_phone" text,
  "joint_ord_type" text,
  "crawled_at" timestamptz,
  primary key ("law_id", "promul_dt")
);


create table if not exists public."openlaw_nw_jo" (
  "law_id" bigint,
  "promul_dt" bigint,
  "jo_no" text,
  "jo_yn" text,
  "jo_title" text,
  "jo_enforce_dt" bigint,
  "jo_content" text,
  "hang" text,
  "ho" text,
  "mok" text,
  "crawled_at" timestamptz,
  primary key ("law_id", "promul_dt", "jo_no")
);


create table if not exists public."openlaw_nw_list" (
  "law_seq" bigint,
  "history_code" text,
  "law_nm" text,
  "law_abbr" text,
  "law_id" bigint,
  "promul_dt" bigint,
  "promul_no" bigint,
  "enact_type" text,
  "dept_cd" text,
  "dept_nm" text,
  "law_type" text,
  "joint_ord_yn" text,
  "promul_no_joint" text,
  "enforce_dt" bigint,
  "self_law_yn" text,
  "law_link" text,
  "crawled_at" timestamptz,
  primary key ("law_seq")
);


create table if not exists public."origin_general_sections" (
  "section_key" text,
  "section_name" text not null,
  "display_order" bigint not null,
  "source_url" text not null,
  "body_text" text not null,
  "body_html" text not null,
  "content_sha256" text not null,
  "crawled_at" text not null,
  "last_run_id" text not null,
  primary key ("section_key")
);


create table if not exists public."tariff_chapter" (
  "year" bigint,
  "country_code" text,
  "country_name" text,
  "section_code" text,
  "section_name" text,
  "chapter_code" text,
  "chapter_name" text,
  "chapter_name_en" text,
  "crawled_at" text,
  "record_uuid" text,
  primary key ("year", "country_code", "chapter_code")
);


create table if not exists public."tariff_domestic_tax" (
  "record_uuid" text,
  "year" bigint,
  "country_code" text,
  "country_name" text,
  "hs_code" text,
  "tax_sequence" bigint,
  "tax_category" text,
  "tax_rate" text,
  "tax_code" text,
  "taxable_base_price" text,
  "rural_special_tax_yn" text,
  "effective_period" text,
  "fields_json" text,
  "crawled_at" text,
  primary key ("year", "country_code", "hs_code", "tax_sequence")
);


create table if not exists public."tariff_heading" (
  "year" bigint,
  "country_code" text,
  "country_name" text,
  "section_code" text,
  "chapter_code" text,
  "heading_code" text,
  "heading_name" text,
  "heading_name_en" text,
  "crawled_at" text,
  "record_uuid" text,
  primary key ("year", "country_code", "heading_code")
);


create table if not exists public."tariff_item" (
  "year" bigint,
  "country_code" text,
  "country_name" text,
  "section_code" text,
  "chapter_code" text,
  "heading_code" text,
  "hs_code" text,
  "hs_code_6" text,
  "item_name" text,
  "item_name_en" text,
  "basic_rate" text,
  "elastic_rate" text,
  "is_complete" bigint,
  "crawled_at" text,
  "record_uuid" text,
  "elastic_codes" text,
  "elastic_rates" text,
  "simple_refund" text,
  "reduction" text,
  "origin" text,
  "refund_crawled" bigint,
  "unit_weight" text,
  "unit_qty" text,
  "unit_crawled" bigint,
  primary key ("year", "country_code", "hs_code")
);


create table if not exists public."tariff_item_detail" (
  "record_uuid" text,
  "year" bigint,
  "country_code" text,
  "country_name" text,
  "hs_code" text,
  "rate_code" text,
  "rate_value" text,
  "rate_name" text,
  "crawled_at" text,
  primary key ("year", "country_code", "hs_code", "rate_code")
);


create table if not exists public."tariff_origin_marking" (
  "record_uuid" text,
  "year" bigint,
  "country_code" text,
  "country_name" text,
  "hs_code" text,
  "target_yn" text,
  "origin_marking_target" text,
  "appropriate_marking_method" text,
  "details_json" text,
  "crawled_at" text,
  primary key ("year", "country_code", "hs_code")
);


create table if not exists public."tariff_req_condition" (
  "record_uuid" text,
  "year" bigint,
  "country_code" text,
  "country_name" text,
  "hs_code" text,
  "req_type" text,
  "req_category" text,
  "req_content" text,
  "crawled_at" text,
  primary key ("year", "country_code", "hs_code", "req_type", "req_category")
);


create table if not exists public."tariff_req_strategic" (
  "record_uuid" text,
  "year" bigint not null,
  "country_code" text not null,
  "country_name" text,
  "hs_code" text not null,
  "cls_no" text,
  "item_name" text,
  "ctrl_name" text,
  "model_spec" text,
  "ctrl_detail" text,
  "manufacturer" text,
  "remark" text,
  "crawled_at" text,
  primary key ("record_uuid")
);


create table if not exists public."tariff_section" (
  "year" bigint,
  "country_code" text,
  "country_name" text,
  "section_code" text,
  "section_name" text,
  "crawled_at" text,
  "record_uuid" text,
  primary key ("year", "country_code", "section_code")
);



-- 로컬: postgres 소유자로 접속하므로 RLS/Supabase 롤 GRANT 불필요
-- (웹·업로드 스크립트는 postgres 또는 전용 앱 계정 사용)
