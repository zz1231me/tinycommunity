// client/src/components/Dashboard/TempShareModal.tsx
// 임시 파일 공유 모달 — 파일 업로드 → 15분짜리 공유 링크 반환(만료 후 서버에서 자동 삭제).
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, UploadCloud, Copy, Clock, FileUp, RotateCcw } from 'lucide-react';
import { uploadTempShare, type TempShareResult } from '../../api/tempShare';
import { getApiErrorMessage } from '../../api/utils';
import { useSiteSettings } from '../../store/siteSettings';
import { toast } from '../../utils/toast';

interface Props {
  open: boolean;
  onClose: () => void;
}

const fmtSize = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function TempShareModal({ open, onClose }: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TempShareResult | null>(null);
  const [remain, setRemain] = useState(0); // 초
  const inputRef = useRef<HTMLInputElement>(null);
  // 파일 크기 한도는 관리자 설정(maxFileSizeMb)을 따른다(하드코딩 제거).
  const maxMb = useSiteSettings(s => s.settings.maxFileSizeMb);
  const maxSize = maxMb * 1024 * 1024;

  const reset = useCallback(() => {
    setResult(null);
    setProgress(0);
    setUploading(false);
  }, []);

  // 닫기 = onClose + 상태 초기화 (Esc·배경·X 모두 동일하게 → 재오픈 시 이전 결과가 남지 않도록)
  const handleClose = useCallback(() => {
    onClose();
    reset();
  }, [onClose, reset]);

  // Esc 닫기 + 열려 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && handleClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, handleClose]);

  // 만료 카운트다운
  useEffect(() => {
    if (!result) return;
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(result.expiresAt).getTime() - Date.now()) / 1000));
      setRemain(s);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [result]);

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    if (file.size > maxSize) {
      toast.error(`파일이 너무 큽니다. 최대 ${maxMb}MB까지 공유할 수 있습니다.`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const r = await uploadTempShare(file, setProgress);
      setResult(r);
    } catch (err) {
      toast.error(getApiErrorMessage(err, '업로드에 실패했습니다.'));
    } finally {
      setUploading(false);
    }
  }, [maxSize, maxMb]);

  const shareUrl = result ? `${window.location.origin}${result.url}` : '';

  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(shareUrl);
      else {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.success('링크를 복사했습니다.');
    } catch {
      toast.error('복사에 실패했습니다.');
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-scrim"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="임시 파일 공유"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileUp className="h-5 w-5 text-secondary-600" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">임시 파일 공유</h2>
          </div>
          <button
            onClick={handleClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {!result ? (
            <>
              <div
                onClick={() => !uploading && inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (!uploading && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
                }}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-10 text-center transition-colors hover:border-secondary-400 hover:bg-secondary-50/40 dark:border-slate-700 dark:hover:border-secondary-600 dark:hover:bg-secondary-900/10"
              >
                <UploadCloud className="h-9 w-9 text-slate-400" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {uploading ? `업로드 중… ${progress}%` : '파일을 끌어다 놓거나 클릭'}
                </p>
                <p className="text-xs text-slate-400">최대 {maxMb}MB · 링크는 15분간 유지</p>
              </div>
              {uploading && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-secondary-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {result.originalName}
                </p>
                <p className="text-xs text-slate-400">{fmtSize(result.size)}</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={e => e.currentTarget.select()}
                  className="input flex-1 font-mono text-xs"
                />
                <button onClick={copy} className="btn-primary flex-shrink-0 gap-1.5 px-3 py-2 text-sm">
                  <Copy className="h-4 w-4" />
                  복사
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                    remain > 0 ? 'text-secondary-600 dark:text-secondary-400' : 'text-red-500'
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  {remain > 0
                    ? `${Math.floor(remain / 60)}분 ${String(remain % 60).padStart(2, '0')}초 후 만료`
                    : '만료됨'}
                </span>
                <button onClick={reset} className="btn-ghost gap-1.5 text-sm">
                  <RotateCcw className="h-4 w-4" />
                  다른 파일
                </button>
              </div>
              <p className="text-xs text-slate-400">
                만료 후 서버에서도 자동 삭제됩니다. 링크는 로그인 없이 누구나 열 수 있으니 필요한 사람에게만
                전달하세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
