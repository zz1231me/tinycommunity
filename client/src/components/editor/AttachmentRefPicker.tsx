// 에디터 아래 증적 꽂기 패널. 첨부 목록이 작성 중 계속 바뀌어 툴바가 아닌 React 패널로 둔다.

import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { INSERT_ATTACHMENT_REF } from './AttachmentRefPlugin';

/** 이 패널이 쓰는 CKEditor 표면만 최소로 기술한다. */
export interface AttachmentRefEditor {
  execute(commandName: string, ...args: unknown[]): unknown;
  editing: { view: { focus(): void } };
}

interface Props {
  /** CKEditor onReady 로 받은 인스턴스. 없으면 비활성. */
  editor: AttachmentRefEditor | null;
  /** 이 글에 달린 첨부의 원본 파일명. 저장된 것과 방금 고른 것을 모두 포함한다. */
  attachmentNames: string[];
}

export default function AttachmentRefPicker({ editor, attachmentNames }: Props) {
  const [open, setOpen] = useState(false);

  if (!editor) return null;

  const insert = (name: string) => {
    editor.execute(INSERT_ATTACHMENT_REF, name);
    editor.editing.view.focus();
    setOpen(false);
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <Paperclip className="h-3.5 w-3.5" />
        본문에 증적 첨부
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
          {attachmentNames.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400">
              먼저 아래에서 첨부파일을 추가하면 본문 원하는 위치에 꽂을 수 있습니다.
            </p>
          ) : (
            <ul role="listbox" aria-label="본문에 꽂을 첨부">
              {attachmentNames.map(name => (
                <li key={name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    // 캐럿을 잃으면 삽입 위치가 사라진다
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => insert(name)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
