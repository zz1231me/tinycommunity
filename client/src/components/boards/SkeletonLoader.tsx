import React from 'react';

/**
 * 목록을 불러오는 동안 자리를 잡아 두는 회색 줄.
 *
 * 생김새는 PostListItem 의 행과 맞춰야 한다. 예전에는 여백이 px-8 py-6 이라 실제
 * 행(px-4 sm:px-6 py-3)의 두 배였고, 칸 간격도 칸 수도 달랐다. 그래서 목록이 도착하는
 * 순간 줄 높이가 절반으로 줄며 화면이 위로 덜컥 당겨졌다 — 자리를 잡아 두려고 만든
 * 것이 오히려 자리를 흔들고 있었다.
 *
 * 값을 고칠 때는 PostListItem 의 행과 함께 고쳐야 한다.
 */
export const SkeletonLoader: React.FC = () => {
  return (
    <div>
      {[...Array(5)].map((_, index) => (
        <div
          key={index}
          className="px-4 sm:px-6 py-3 border-l-2 border-l-transparent border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 animate-pulse"
        >
          <div className="grid grid-cols-12 gap-2 sm:gap-4 items-center">
            {/* 제목 — 좁은 화면에서는 행과 같이 12칸을 다 쓴다 */}
            <div className="col-span-12 sm:col-span-8">
              <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-md w-3/4"></div>
            </div>

            {/* 좁은 화면에서 행이 제목 아래 붙이는 줄(작성자·작성일) */}
            <div className="col-span-12 mt-1.5 sm:hidden">
              <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded-md w-1/3"></div>
            </div>

            {/* 작성자 — 행과 같이 넓은 화면에서만, 왼쪽 정렬 */}
            <div className="col-span-2 hidden sm:flex items-center gap-1.5">
              <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded-full flex-shrink-0"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-12"></div>
            </div>

            {/* 작성일 */}
            <div className="col-span-2 hidden sm:block">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-14 mx-auto"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
