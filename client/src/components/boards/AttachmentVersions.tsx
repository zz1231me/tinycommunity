// client/src/components/boards/AttachmentVersions.tsx
// 첨부의 이전 버전.
//
// 같은 이름으로 다시 올리면 예전 파일은 지워지지 않고 이력으로 남는다. 여기서 그걸
// 다시 받을 수 있다 — "지난 주에 보낸 그 버전" 을 되찾는 것이 개정 이력의 존재 이유다.
//
// 이력이 없는 첨부에는 아무것도 그리지 않는다. 대부분의 첨부는 한 번 올리고 끝이라
// "이전 버전 0개" 줄이 파일마다 붙으면 목록만 길어진다.

import { useState } from 'react';
import { History, Download } from 'lucide-react';
import { formatFileSize } from '../../utils/fileUtils';
import { formatFullDateTime } from '../../utils/date';
import { downloadFile } from '../../utils/downloadUtils';
import { toast } from '../../utils/toast';
import type { AttachmentVersionGroup } from '../../api/tasks';

interface Props {
  group: AttachmentVersionGroup | undefined;
}

export function AttachmentVersions({ group }: Props) {
  const [open, setOpen] = useState(false);
  if (!group || group.versions.length === 0) return null;

  const download = async (filename: string, index: number) => {
    try {
      // 받은 파일이 현재 첨부와 같은 이름이면 어느 쪽인지 알 수 없다 — 버전 번호를 붙인다
      const dot = group.originalName.lastIndexOf('.');
      const version = group.versions.length - index;
      const name =
        dot > 0
          ? `${group.originalName.slice(0, dot)} (v${version})${group.originalName.slice(dot)}`
          : `${group.originalName} (v${version})`;
      await downloadFile({ storedName: filename, originalName: name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '파일 다운로드에 실패했습니다.');
    }
  };

  return (
    <div className="border-t border-slate-200/70 px-3 py-2 dark:border-slate-700/70 sm:px-4">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400"
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        이전 버전 {group.versions.length}개
      </button>

      {open && (
        <ul className="mt-2 space-y-1">
          {group.versions.map((v, i) => (
            <li
              key={v.filename}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50"
            >
              <span className="flex-shrink-0 font-mono text-slate-400">
                v{group.versions.length - i}
              </span>
              <time dateTime={v.createdAt} className="text-slate-600 dark:text-slate-300">
                {formatFullDateTime(v.createdAt)}
              </time>
              <span className="text-slate-400">{formatFileSize(v.size)}</span>
              {v.uploadedBy && <span className="truncate text-slate-400">{v.uploadedBy}</span>}
              <button
                type="button"
                onClick={() => download(v.filename, i)}
                aria-label={`${group.originalName} v${group.versions.length - i} 내려받기`}
                className="ml-auto flex-shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-primary-600 dark:hover:bg-slate-600"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
