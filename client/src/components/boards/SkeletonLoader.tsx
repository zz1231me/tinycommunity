import React from 'react';

/** 목록 로딩 자리표시. 여백·칸 수는 PostListItem 의 행과 함께 고쳐야 한다. */
export const SkeletonLoader: React.FC = () => {
  return (
    <div>
      {[...Array(5)].map((_, index) => (
        <div
          key={index}
          className="px-4 sm:px-6 py-3 border-l-2 border-l-transparent border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 animate-pulse"
        >
          <div className="grid grid-cols-12 gap-2 sm:gap-4 items-center">
            {/* 제목. 좁은 화면에서는 12칸을 다 쓴다. */}
            <div className="col-span-12 sm:col-span-8">
              <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-md w-3/4"></div>
            </div>

            {/* 좁은 화면에서 행이 제목 아래 붙이는 줄(작성자·작성일) */}
            <div className="col-span-12 mt-1.5 sm:hidden">
              <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded-md w-1/3"></div>
            </div>

            {/* 작성자. 넓은 화면에서만 보인다. */}
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
