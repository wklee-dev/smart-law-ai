import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, CompositionEvent } from "react";
import { normalizeChatDisplayText } from "@/app/shared/chat-display-text";

/**
 * 채팅 입력창: 전각 영숫자·기호 등을 입력해도 NFKC로 반각 형태로 유지합니다.
 * 한글 IME 조합 중(composition)에는 값을 바꾸지 않습니다.
 */
export function useChatTextareaState(initialValue = "") {
  const [input, setInput] = useState(initialValue);
  const composingRef = useRef(false);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(
    (e: CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = false;
      setInput(normalizeChatDisplayText(e.currentTarget.value));
    },
    [],
  );

  const onInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    if (composingRef.current) {
      setInput(v);
    } else {
      setInput(normalizeChatDisplayText(v));
    }
  }, []);

  return {
    input,
    setInput,
    textareaHandlers: {
      onCompositionStart,
      onCompositionEnd,
      onChange: onInputChange,
    },
  };
}
