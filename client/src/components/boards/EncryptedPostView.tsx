// client/src/components/boards/EncryptedPostView.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  FileText,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  UnlockKeyhole,
} from 'lucide-react';
import { AnimatedPage } from '../common/AnimatedPage';
import { PageHeader } from '../common/PageHeader';

interface EncryptedPostViewProps {
  boardTitle: string;
  postTitle: string;
  ciphertext: string;
  onDecrypt: (password: string) => void;
  onBack: () => void;
  verifying: boolean;
  error: string | null;
}

export const EncryptedPostView: React.FC<EncryptedPostViewProps> = ({
  boardTitle,
  postTitle,
  ciphertext,
  onDecrypt,
  onBack,
  verifying,
  error,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 비밀번호 입력창 등장 시 자동 포커스
  useEffect(() => {
    if (showForm) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [showForm]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) onDecrypt(password);
  };

  // ciphertext 미리보기 — 실제 암호문이 보이도록 충분히 표시
  const cipherPreview = ciphertext.slice(0, 960);
  const cipherLines = cipherPreview.match(/.{1,64}/g) ?? [];

  return (
    <AnimatedPage className="page-container overflow-y-auto">
      <div className="content-wrapper">
        <PageHeader
          title={boardTitle}
          icon={<FileText className="w-6 h-6 text-primary-600 dark:text-primary-400" />}
        >
          <button onClick={onBack} className="btn-secondary">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            목록으로
          </button>
        </PageHeader>

        <div className="card overflow-hidden mb-6">
          {/* 게시글 헤더 */}
          <header className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-200 dark:border-emerald-800/60">
                <ShieldCheck className="w-3.5 h-3.5" />
                E2EE 종단간 암호화
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {postTitle}
            </h1>
          </header>

          {/* 암호화된 콘텐츠 영역 */}
          <div className="relative min-h-[360px] overflow-hidden">
            {/* 암호문 배경 — 실제 암호문이 보이도록 블러 없이 표시 */}
            <div
              aria-hidden="true"
              className="absolute inset-0 px-6 py-5 font-mono text-[11.5px] leading-[1.65] break-all select-none pointer-events-none
                         text-primary-700/40 dark:text-primary-400/25"
            >
              {cipherLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>

            {/* 하단 페이드 오버레이 — 아래 1/3만 가림 */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-slate-900 dark:via-slate-900/80 dark:to-transparent"
            />

            {/* 중앙 잠금 UI */}
            <div className="absolute inset-0 flex flex-col items-center justify-center px-4 py-10">
              {/* 자물쇠 아이콘 */}
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                className="mb-4 w-16 h-16 rounded-2xl bg-white dark:bg-slate-800
                           shadow-lg shadow-slate-200/60 dark:shadow-slate-950/60
                           border border-slate-200 dark:border-slate-700
                           flex items-center justify-center"
              >
                <Lock className="w-8 h-8 text-primary-600 dark:text-primary-400" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="text-center mb-6"
              >
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  암호화된 내용
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  비밀번호를 입력하면 브라우저에서 직접 복호화됩니다
                </p>
              </motion.div>

              {/* 복호화 버튼 ↔ 비밀번호 폼 전환 */}
              <AnimatePresence mode="wait">
                {!showForm ? (
                  <motion.button
                    key="unlock-btn"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, y: -6 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setShowForm(true)}
                    className="btn-primary flex items-center gap-2 px-6 py-2.5 shadow-md shadow-primary-500/20"
                  >
                    <UnlockKeyhole className="w-4 h-4" />
                    복호화하기
                  </motion.button>
                ) : (
                  <motion.form
                    key="unlock-form"
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    onSubmit={handleSubmit}
                    className="w-full max-w-xs flex flex-col items-center gap-3"
                  >
                    {/* 비밀번호 입력 */}
                    <div className="relative w-full">
                      <input
                        ref={inputRef}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="비밀번호를 입력하세요"
                        className="w-full input pr-10 text-center"
                        disabled={verifying}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2
                                   text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* 에러 메시지 */}
                    <AnimatePresence>
                      {error && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="text-xs text-red-500 dark:text-red-400 text-center"
                        >
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    {/* 버튼 영역 */}
                    <div className="flex gap-2 w-full">
                      <button
                        type="button"
                        onClick={() => {
                          setShowForm(false);
                          setPassword('');
                        }}
                        disabled={verifying}
                        className="btn-secondary flex-1"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        disabled={verifying || !password.trim()}
                        className="btn-primary flex-1 flex items-center justify-center gap-2"
                      >
                        {verifying ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            복호화 중...
                          </>
                        ) : (
                          '복호화'
                        )}
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 하단 E2EE 안내 */}
          <div className="px-6 py-4 bg-emerald-50 dark:bg-emerald-900/10 border-t border-emerald-100 dark:border-emerald-800/30">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                이 게시글은 <strong>종단간 암호화(E2EE)</strong>로 보호됩니다. 서버에는 암호화된
                데이터만 저장되며, 관리자도 내용을 읽을 수 없습니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
};
