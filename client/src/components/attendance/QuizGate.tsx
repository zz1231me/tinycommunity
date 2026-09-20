// client/src/components/attendance/QuizGate.tsx
// 문제 내기 공격 — 퇴근을 누르면 계산 문제가 나온다. 맞혀야 퇴근이 찍힌다.
//
// ⚠️ 성가시게 할 뿐 막지는 않는다.
//   · 초등 사칙연산이고 정답은 늘 0 이상의 정수다 — 못 푸는 문제는 없다
//   · 틀리면 새 문제가 나올 뿐, 몇 번이든 다시 풀 수 있다
//   · 키보드만으로 풀 수 있다(열리면 입력칸에 바로 들어간다, Enter 로 확인, Esc 로 닫기)
// 서버의 퇴근 기록은 이 문제를 보지 않는다. 맞힌 순간 누른 것으로 찍힌다.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { makeQuestion, quizCount } from './quiz';

export function QuizGate({
  level,
  onSolved,
  onClose,
}: {
  level: number;
  onSolved: () => void;
  onClose: () => void;
}) {
  const need = quizCount(level);
  const [question, setQuestion] = useState(() => makeQuestion(level));
  const [solved, setSolved] = useState(0);
  const [value, setValue] = useState('');
  // 틀릴 때마다 늘려 흔들림을 다시 건다(같은 값이면 애니메이션이 다시 돌지 않는다)
  const [missKey, setMissKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [question]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() === '') return;
    if (Number(value) === question.answer) {
      if (solved + 1 >= need) {
        onSolved();
        return;
      }
      setSolved(solved + 1);
    } else {
      // 틀리면 처음부터 — 쌓인 만큼 연달아 맞혀야 한다
      setSolved(0);
      setMissKey(k => k + 1);
    }
    setValue('');
    setQuestion(makeQuestion(level));
  };

  return (
    <div
      role="dialog"
      aria-label="퇴근 계산 문제"
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
      }}
      className="animate-popIn relative mx-5 mb-5 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm dark:border-violet-500/30 dark:from-violet-500/10 dark:to-slate-800"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="문제 닫기"
        className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600 dark:hover:bg-slate-700"
      >
        <X className="h-4 w-4" />
      </button>
      {/* pr-7: 오른쪽 위 닫기 단추 자리를 비워 둔다 — 좁은 화면에서 '(0/3 — 틀리면 처음부터)' 가
          닫기 단추 밑으로 파고들었다 */}
      <p className="pr-7 text-xs font-medium text-violet-700 dark:text-violet-300">
        🧮 풀어야 퇴근할 수 있어요
        {need > 1 && (
          <span className="ml-1.5 tabular-nums text-violet-500">
            ({solved}/{need} — 틀리면 처음부터)
          </span>
        )}
      </p>
      <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
        <span
          key={missKey}
          data-testid="quiz-question"
          className={`inline-block text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 ${
            missKey > 0 ? 'animate-quizMiss' : ''
          }`}
        >
          {question.text} =
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          aria-label="답"
          autoComplete="off"
          className="input w-24 text-center text-lg font-semibold tabular-nums"
        />
        <button type="submit" className="btn-primary">
          확인
        </button>
      </form>
      {missKey > 0 && (
        <p key={missKey} className="animate-fadeIn mt-2 text-xs text-rose-600 dark:text-rose-400">
          땡! 새 문제입니다.
        </p>
      )}
    </div>
  );
}
