export type CitationValidationStatus =
  | "VALID"
  | "NO_CITATIONS"
  | "INVALID_CITATIONS"
  | "MIXED_CITATIONS";

export interface RAGChatRequest {
  query: string;
  match_count?: number;
  candidate_multiplier?: number;
  max_results?: number;
  temperature?: number;
  max_output_tokens?: number;
  document_category?: string;
  source_table?: string;
}

export interface CitationValidation {
  status: CitationValidationStatus;
  is_valid: boolean;
  parsed_citation_ids: string[];
  valid_citation_ids: string[];
  invalid_citation_ids: string[];
  unused_source_ids: string[];
  citation_occurrence_count: number;
  unique_citation_count: number;
  has_malformed_citation_candidates: boolean;
  malformed_citation_candidates: string[];
  messages: string[];
}

export interface RAGSource {
  citation_id: string;
  id: number;
  source_table: string;
  source_pk: number;
  document_category: string;
  document_type: string | null;
  law_name: string;
  chunk_type: string;
  article_no: string | null;
  title: string | null;
  header: string | null;
  ranking_rank: number | null;
  ranking_score: number;
  text_truncated: boolean;
  cited: boolean;
  citation_count: number;
  first_occurrence_order: number | null;
}

export interface RAGChatResponse {
  result_version: string;
  request_id: string;

  query: string;
  answer_text: string;
  answer_chars: number;

  provider: string;
  model: string;
  finish_reason: string | null;

  prompt_token_count: number | null;
  candidate_token_count: number | null;
  total_token_count: number | null;

  context_count: number;
  available_source_ids: string[];

  citation_validation: CitationValidation;

  cited_sources: RAGSource[];
  unused_sources: RAGSource[];

  cited_source_count: number;
  unused_source_count: number;
}

export interface APIErrorDetail {
  code: string;
  message: string;
  request_id: string;
}

export interface APIErrorResponse {
  error: APIErrorDetail;
}

export interface RAGHealthResponse {
  status: string;
  service: string;
  version: string;
  build?: string | null;
  provider?: string | null;
  vector_dimension?: number | null;
}

export type RAGProxyResult =
  | {
      ok: true;
      status: number;
      data: RAGChatResponse;
      requestId: string;
    }
  | {
      ok: false;
      status: number;
      error: APIErrorDetail;
      requestId: string;
    };
