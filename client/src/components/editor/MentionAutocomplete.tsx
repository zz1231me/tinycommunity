// client/src/components/editor/MentionAutocomplete.tsx
// CKEditor 위에 뜨는 @멘션 자동완성 오버레이.
//
// CKEditor 5 공식 Mention 플러그인은 이 프로젝트가 쓰는 umbrella 패키지(ckeditor5@48.2)
// 번들에 들어 있지 않고, 별도 패키지는 버전이 어긋나 모듈 중복 위험이 있다.
// 그래서 에디터의 공개 모델 API 만 사용하는 얇은 오버레이로 구현한다.
//
// 판단 로직(언제 열고 무엇을 검색할지)은 utils/mentionQuery 에 분리해 테스트한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchUsers, type UserSuggestion } from '../../api/users';
import { buildMentionText, findMentionQuery, isMentionable } from '../../utils/mentionQuery';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

/** 이 컴포넌트가 실제로 쓰는 CKEditor 표면만 최소로 기술 */
export interface MentionEditor {
  model: {
    document: { selection: { getFirstPosition(): unknown } };
    change(cb: (writer: MentionWriter) => void): void;
  };
  editing: { view: { domRoots: Map<string, HTMLElement> } };
}

interface MentionWriter {
  createRange(start: unknown, end: unknown): unknown;
  createPositionAt(node: unknown, offset: number | 'end'): unknown;
  remove(range: unknown): void;
  insertText(text: string, position: unknown): void;
  setSelection(position: unknown): void;
}

interface Props {
  /** CKEditor onReady 로 받은 인스턴스 (없으면 비활성) */
  editor: MentionEditor | null;
}

interface Caret {
  top: number;
  left: number;
}

/**
 * 현재 캐럿 바로 앞의 텍스트를 읽는다.
 *
 * anchorNode 가 항상 텍스트 노드인 것은 아니다 — CKEditor 는 문단 요소에 커서를
 * 두기도 하고(빈 줄, 프로그램적 선택 이동 등), 그때 anchorOffset 은 자식 인덱스다.
 * 텍스트 노드만 처리하면 자동완성이 아예 뜨지 않으므로 두 경우를 모두 다룬다.
 */
function textBeforeCaret(): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const node = sel.anchorNode;
  if (!node) return null;

  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').slice(0, sel.anchorOffset);
  }

  // 요소 노드: anchorOffset 번째 자식 앞까지의 텍스트를 이어 붙인다
  if (node.nodeType === Node.ELEMENT_NODE) {
    const children = Array.from(node.childNodes).slice(0, sel.anchorOffset);
    const before = children.map(c => c.textContent ?? '').join('');
    // offset 이 0 이면(자식 앞) 요소 전체 텍스트를 캐럿 앞으로 볼 수 없다 —
    // 다만 CKEditor 가 문단 끝에 커서를 둘 때 offset 은 자식 수와 같으므로 위 계산이 맞다.
    return before || (sel.anchorOffset === 0 ? '' : (node.textContent ?? ''));
  }

  return null;
}

/** 캐럿 화면 좌표 (오버레이 위치용) */
function caretRect(): Caret | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  // 빈 줄에서는 rect 가 0 일 수 있다 — 그때는 위치를 잡지 않는다
  if (rect.top === 0 && rect.left === 0) return null;
  return { top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX };
}

export default function MentionAutocomplete({ editor }: Props) {
  const [query, setQuery] = useState<string | null>(null);
  const [replaceLength, setReplaceLength] = useState(0);
  const [items, setItems] = useState<UserSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [caret, setCaret] = useState<Caret | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebouncedValue(query ?? '', 150);
  const open = query !== null && caret !== null && items.length > 0;

  const close = useCallback(() => {
    abortRef.current?.abort();
    setQuery(null);
    setItems([]);
    setActiveIndex(0);
    setCaret(null);
  }, []);

  // ── 입력 감지 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const root = editor?.editing.view.domRoots.values().next().value;
    if (!root) return;

    const onInput = () => {
      const before = textBeforeCaret();
      const hit = before === null ? null : findMentionQuery(before);
      if (!hit) {
        setQuery(null);
        setItems([]);
        setCaret(null);
        return;
      }
      setQuery(hit.query);
      setReplaceLength(hit.replaceLength);
      setCaret(caretRect());
    };

    root.addEventListener('input', onInput);
    root.addEventListener('click', onInput);
    return () => {
      root.removeEventListener('input', onInput);
      root.removeEventListener('click', onInput);
    };
  }, [editor]);

  // ── 검색 ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (query === null) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    searchUsers(debouncedQuery, controller.signal)
      .then(found => {
        if (controller.signal.aborted) return;
        setItems(found);
        setActiveIndex(0);
      })
      .catch(() => {
        // 검색 실패는 조용히 무시 — 자동완성이 없을 뿐 입력은 계속된다
      });

    return () => controller.abort();
  }, [debouncedQuery, query]);

  // ── 선택 반영 ──────────────────────────────────────────────────────────────
  const select = useCallback(
    (user: UserSuggestion) => {
      if (!editor) return;
      editor.model.change(writer => {
        const pos = editor.model.document.selection.getFirstPosition() as {
          getShiftedBy(n: number): unknown;
        } | null;
        if (!pos) return;
        // 방금 타이핑한 '@query' 는 같은 텍스트 노드 안에 있으므로 오프셋 이동으로 충분하다
        const start = pos.getShiftedBy(-replaceLength);
        writer.remove(writer.createRange(start, pos));
        writer.insertText(buildMentionText(user.id), start);
      });
      close();
    },
    [editor, replaceLength, close]
  );

  // ── 키보드 조작 ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        // CKEditor 의 Enter(문단 추가)보다 먼저 가로채야 한다
        e.preventDefault();
        e.stopPropagation();
        select(items[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    // capture: CKEditor 가 Enter 를 처리하기 전에 잡는다
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, items, activeIndex, select, close]);

  if (!open || !caret) return null;

  return (
    <ul
      role="listbox"
      aria-label="멘션할 사용자"
      className="fixed z-50 min-w-56 max-w-xs overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
      style={{ top: caret.top, left: caret.left }}
    >
      {items.map((u, i) => {
        const mentionable = isMentionable(u.id);
        return (
          <li key={u.id}>
            <button
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              // 에디터가 포커스를 잃으면 캐럿 위치가 사라지므로 mousedown 을 막는다
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(u)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                i === activeIndex
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span className="truncate font-medium">{u.name}</span>
              <span
                className={`truncate text-xs ${i === activeIndex ? 'text-white/80' : 'text-slate-400'}`}
              >
                @{u.id}
              </span>
              {!mentionable && (
                // 서버는 4~20자 아이디만 멘션으로 인식한다 — 알림이 가지 않음을 미리 알린다
                <span
                  className={`ml-auto shrink-0 text-2xs ${i === activeIndex ? 'text-white/70' : 'text-amber-500'}`}
                  title="아이디가 짧아 멘션 알림이 전달되지 않습니다"
                >
                  알림 불가
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
