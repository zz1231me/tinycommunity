import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface SecretPostModalProps {
  postTitle: string;
  error?: string | null;
  verifying?: boolean;
  isEncrypted?: boolean;
  onVerify: (password: string) => void;
  onBack: () => void;
}

const SecretPostModal: React.FC<SecretPostModalProps> = ({
  postTitle,
  error,
  verifying,
  isEncrypted,
  onVerify,
  onBack,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // ESC로 목록으로 돌아가기 (다른 모달과 일관)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) onVerify(password);
  };

  return (
    <div className="page-container overflow-y-auto">
      <div className="content-wrapper flex items-center justify-center min-h-[60vh]">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={isEncrypted ? 'E2EE 암호화 글 비밀번호 입력' : '비밀글 비밀번호 입력'}
          className="card p-8 max-w-md w-full"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">{isEncrypted ? '🔐' : '🔒'}</div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              {isEncrypted ? 'E2EE 암호화 글' : '비밀글'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs mx-auto">
              {postTitle}
            </p>
          </div>

          {/* E2EE Info badge */}
          {isEncrypted && (
            <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <span className="text-lg flex-shrink-0 mt-0.5">🛡️</span>
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  종단간 암호화 (E2EE)
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  이 글의 내용은 서버에서도 읽을 수 없습니다. 비밀번호를 입력하면 브라우저에서 직접
                  복호화합니다.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                비밀번호
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full input pr-10"
                  disabled={verifying}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm"
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {error && (
                <p
                  role="alert"
                  className="mt-1.5 text-sm text-red-600 dark:text-red-400 flex items-center gap-1"
                >
                  <span>⚠️</span> {error}
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onBack}
                className="btn-secondary flex-1"
                disabled={verifying}
              >
                목록으로
              </button>
              <button
                type="submit"
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                disabled={verifying || !password.trim()}
              >
                {verifying ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isEncrypted ? '복호화 중...' : '확인 중...'}
                  </>
                ) : (
                  <>
                    <span>{isEncrypted ? '🔓' : '✓'}</span>
                    {isEncrypted ? '복호화하기' : '확인'}
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default SecretPostModal;
