// client/src/hooks/useDraftAutoSave.ts
// 작성 중인 글을 주기적으로 서버에 임시저장한다.
//
// 저장 시점 판단이 이 기능의 전부라 에디터에서 분리해 따로 검증한다.
//
// 저장하지 않는 경우:
//  - 제목과 본문이 모두 비어 있을 때 (빈 초안이 목록을 채우는 것을 막는다)
//  - 직전 저장 이후 내용이 그대로일 때

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDraft, updateDraft } from '../api/drafts';

export interface DraftSnapshot {
  title: string;
  content: string;
}

interface Options {
  /** 자동저장을 켤지 — 수정 모드처럼 초안이 필요 없는 화면에서는 끈다 */
  enabled: boolean;
  boardType: string | undefined;
  intervalMs: number;
  /** 이어쓰기로 열었을 때의 초안 id */
  initialDraftId?: string | null;
  /** 지금 화면의 제목·본문을 읽어 온다 (에디터 인스턴스에서 직접) */
  read: () => DraftSnapshot;
}

export interface DraftAutoSaveState {
  /** 지금 붙어 있는 초안 id (아직 한 번도 저장 안 했으면 null) */
  draftId: string | null;
  /** 마지막으로 저장에 성공한 시각 */
  savedAt: Date | null;
  /** 저장이 실패한 상태인지 — 사용자에게 "저장 안 되고 있음" 을 알려야 한다 */
  failed: boolean;
  /** 발행에 성공했을 때처럼, 초안 추적을 끊는다 */
  forget: () => void;
}

/** 태그를 걷어낸 본문이 비어 있고 제목도 없으면 저장할 것이 없다 */
function isEmpty({ title, content }: DraftSnapshot): boolean {
  const text = content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, '')
    .trim();
  return title.trim().length === 0 && text.length === 0;
}

export function useDraftAutoSave({
  enabled,
  boardType,
  intervalMs,
  initialDraftId = null,
  read,
}: Options): DraftAutoSaveState {
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);

  // interval 이 매번 새로 만들어지지 않도록 최신 값을 ref 로만 참조한다
  const readRef = useRef(read);
  const draftIdRef = useRef(draftId);
  const lastSavedRef = useRef<string>('');
  const inFlightRef = useRef(false);

  useEffect(() => {
    readRef.current = read;
  }, [read]);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  const forget = useCallback(() => {
    draftIdRef.current = null;
    setDraftId(null);
  }, []);

  useEffect(() => {
    if (!enabled || !boardType) return;

    const tick = async () => {
      // 앞선 저장이 아직 안 끝났으면 건너뛴다 — 느린 연결에서 요청이 쌓이면
      // 나중에 도착한 오래된 본문이 최신 본문을 덮어쓸 수 있다.
      if (inFlightRef.current) return;

      const snapshot = readRef.current();
      if (isEmpty(snapshot)) return;

      const fingerprint = `${snapshot.title} ${snapshot.content}`;
      if (fingerprint === lastSavedRef.current) return;

      inFlightRef.current = true;
      try {
        const id = draftIdRef.current;
        const saved = id
          ? await updateDraft(id, snapshot.title, snapshot.content)
          : await createDraft(boardType, snapshot.title, snapshot.content);
        if (!id) {
          draftIdRef.current = saved.id;
          setDraftId(saved.id);
        }
        lastSavedRef.current = fingerprint;
        setSavedAt(new Date(saved.updatedAt));
        setFailed(false);
      } catch {
        // 실패해도 계속 시도한다 — 다음 주기에 다시 붙으면 그만이다.
        // 다만 표시는 남겨 사용자가 "저장되고 있다" 고 오해하지 않게 한다.
        setFailed(true);
      } finally {
        inFlightRef.current = false;
      }
    };

    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, boardType, intervalMs]);

  return { draftId, savedAt, failed, forget };
}
