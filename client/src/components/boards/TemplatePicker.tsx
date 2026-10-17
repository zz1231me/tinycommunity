// 글쓰기에서 고르는 템플릿. 고르면 제목(비어 있을 때만)과 본문을 채운다.
//
// 이미 쓴 본문을 말없이 덮지 않는다 — 한 글자라도 적어 두었으면 한 번 묻는다.
// 새 글에서만 쓴다(수정 중에 틀을 덮어쓰면 원래 글이 사라진다).

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { fetchPostTemplates, type PostTemplate } from '../../api/postTemplates';
import { templateKeys } from '../../api/queryKeys';
import { useConfirm } from '../../hooks/useConfirm';
import { hasOpenDialog } from '../../hooks/useFocusTrap';

interface Props {
  boardType: string;
  /** 지금 본문이 비어 있는지. 비어 있지 않으면 고를 때 한 번 묻는다. */
  hasContent: boolean;
  onPick: (template: PostTemplate) => void;
}

export function TemplatePicker({ boardType, hasContent, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // window.confirm 대신 이 앱의 대화상자를 쓴다 — 포커스 가둠·ESC·화면 색이 함께 온다.
  const { confirm, dialog } = useConfirm();
  const { data = [] } = useQuery({
    queryKey: templateKeys.list(boardType),
    queryFn: ({ signal }) => fetchPostTemplates(boardType, signal),
    staleTime: 5 * 60_000,
  });

  // 다른 메뉴들과 같게 닫힌다. ESC 와 바깥 클릭으로 닫히지 않으면 고르다 만 메뉴가 글 위에 남는다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // 위에 대화상자가 떠 있으면 ESC 는 그쪽 몫이다
      if (e.key !== 'Escape' || hasOpenDialog()) return;
      setOpen(false);
    };
    // 열려 있을 때만 듣는다 — 닫힌 채로 걸어 두면 앱 안의 모든 클릭이 이 검사를 거친다
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  if (data.length === 0) return null;

  const pick = async (template: PostTemplate) => {
    setOpen(false);
    // 이미 쓴 내용을 말없이 덮지 않는다.
    if (hasContent) {
      const ok = await confirm({
        title: `'${template.name}' 틀로 바꿀까요?`,
        description: '지금 쓴 내용이 템플릿 내용으로 바뀝니다.',
        confirmLabel: '바꾸기',
      });
      if (!ok) return;
    }
    onPick(template);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        템플릿
      </button>

      {open && (
        <ul className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {data.map(template => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => void pick(template)}
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/60"
              >
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                  {template.name}
                </span>
                {template.description && (
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {template.description}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}
