"use client";

import { useCallback, useRef, useState } from "react";

import type { RAGChatRequest, RAGSource } from "@/types/rag-api";
import {
  createAssistantErrorMessage,
  createAssistantMessageFromResponse,
  createUserMessage,
  requestRagChat,
  streamRagChat,
  supportsRagStreaming,
  type RagChatMessageDto,
  type RagClientError,
} from "@/lib/rag/rag-client";

export type UseRagChatOptions = {
  /** 기본 검색 옵션 (질문 외 파라미터) */
  defaultRequest?: Omit<RAGChatRequest, "query">;
  /** true면 streamRagChat 스텁 경로 사용 (현재 미구현) */
  preferStreaming?: boolean;
};

export type UseRagChatResult = {
  messages: RagChatMessageDto[];
  loading: boolean;
  error: RagClientError | null;
  lastRequestId: string | null;
  streamingSupported: boolean;
  sendMessage: (query: string) => Promise<void>;
  clearHistory: () => void;
  cancel: () => void;
};

export function useRagChat(
  options: UseRagChatOptions = {},
): UseRagChatResult {
  const [messages, setMessages] = useState<RagChatMessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RagClientError | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    setLastRequestId(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || loading) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage = createUserMessage(trimmed);
      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);
      setError(null);

      const requestPayload: RAGChatRequest = {
        ...(options.defaultRequest ?? {}),
        query: trimmed,
      };

      try {
        if (options.preferStreaming && supportsRagStreaming()) {
          // 다음 STEP: 실제 스트림 소비
          for await (const event of streamRagChat(requestPayload, {
            signal: controller.signal,
          })) {
            if (event.type === "error") {
              setError(event.error);
              setMessages((prev) => [
                ...prev,
                createAssistantErrorMessage(event.error),
              ]);
              return;
            }
            if (event.type === "done") {
              setLastRequestId(event.data.request_id);
              setMessages((prev) => [
                ...prev,
                createAssistantMessageFromResponse(event.data),
              ]);
              return;
            }
          }
          return;
        }

        const result = await requestRagChat(requestPayload, {
          signal: controller.signal,
        });

        if (!result.ok) {
          setError(result.error);
          if (result.error.kind !== "aborted") {
            setMessages((prev) => [
              ...prev,
              createAssistantErrorMessage(result.error),
            ]);
          }
          return;
        }

        setLastRequestId(result.requestId);
        setMessages((prev) => [
          ...prev,
          createAssistantMessageFromResponse(result.data),
        ]);
      } catch {
        const unexpected: RagClientError = {
          kind: "network",
          status: null,
          code: "UNEXPECTED_ERROR",
          message: "답변 요청 중 오류가 발생했습니다.",
          requestId: null,
        };
        setError(unexpected);
        setMessages((prev) => [
          ...prev,
          createAssistantErrorMessage(unexpected),
        ]);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setLoading(false);
      }
    },
    [loading, options.defaultRequest, options.preferStreaming],
  );

  return {
    messages,
    loading,
    error,
    lastRequestId,
    streamingSupported: supportsRagStreaming(),
    sendMessage,
    clearHistory,
    cancel,
  };
}

export type { RAGSource, RagChatMessageDto, RagClientError };
