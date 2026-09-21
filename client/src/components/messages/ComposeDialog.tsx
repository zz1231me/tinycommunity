// 첫 메시지를 쓰는 모달. 덮개·ESC·포커스 처리는 ModalShell 이 맡는다.

import { MESSAGE_MAX_LENGTH } from '../../api/messages';
import { ModalShell } from '../common/ModalShell';

interface Props {
  recipientName: string;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  submitting: boolean;
}

export function ComposeDialog({
  recipientName,
  value,
  onChange,
  onSubmit,
  onClose,
  submitting,
}: Props) {
  const tooLong = value.length > MESSAGE_MAX_LENGTH;
  const canSend = value.trim().length > 0 && !tooLong && !submitting;

  return (
    <ModalShell label={`${recipientName}님에게 메시지`} onClose={onClose}>
      <div className="p-5">
        <h3 className="card-title">{recipientName}님에게 메시지</h3>

        <textarea
          rows={5}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="내용을 입력하세요"
          aria-label="메시지 내용"
          className="mt-3 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        />

        <p className={`mt-1 text-xs ${tooLong ? 'text-red-500' : 'text-slate-400'}`}>
          {value.length.toLocaleString()} / {MESSAGE_MAX_LENGTH.toLocaleString()}자
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            취소
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={onSubmit}
            className="btn-primary disabled:opacity-40"
          >
            {submitting ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
