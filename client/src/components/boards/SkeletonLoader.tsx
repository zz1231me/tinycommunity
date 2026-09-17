import React from 'react';

export const SkeletonLoader: React.FC = () => {
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-700">
      {[...Array(5)].map((_, index) => (
        <div key={index} className="px-8 py-6 animate-pulse">
          <div className="grid grid-cols-12 gap-6 items-center">
            <div className="col-span-8">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-3 flex-shrink-0"></div>
                <div className="flex-1">
                  <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-md w-3/4 mb-2"></div>
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-1/2"></div>
                </div>
              </div>
            </div>
            <div className="col-span-2 text-center hidden sm:block">
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded-full w-16 mx-auto"></div>
            </div>
            <div className="col-span-2 text-center">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-20 mx-auto"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
