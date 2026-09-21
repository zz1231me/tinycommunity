// 작성 중인 글을 주기적으로 서버에 임시저장한다.
// 제목·본문이 모두 비었거나 직전 저장 이후 내용이 같으면 저장하지 않는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDraft, updateDraft } from '../api/drafts';

export interface DraftSnapshot {
  title: string;
  content: string;
}

interface Options {
  /** 자동저장을 켤지 */
  enabled: boolean;
  boardType: string | undefined;
  intervalMs: number;
  /** 이어쓰기로 열었을 때의 초안 id */
  initialDraftId?: string | null;
  /** 지금 화면의 제목·본문을 읽어 온다 */
  read: () => DraftSnapshot;
}

export interface DraftAutoSaveState {
  /** 지금 붙어 있는 초안 id. 아직 저장 전이면 null. */
  draftId: string | null;
  /** 마지막으로 저장에 성공한 시각 */
  savedAt: Date | null;
  /** 저장이 실패한 상태인지 */
  failed: boolean;
  /** 초안 추적을 끊는다 */
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
      // 앞선 저장이 안 끝났으면 건너뛴다. 요청이 쌓이면 오래된 본문이 최신을 덮어쓴다.
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
        // 실패해도 다음 주기에 다시 시도한다. 표시만 남긴다.
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
