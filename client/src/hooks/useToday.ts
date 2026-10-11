// 오늘 0시. 화면을 켜 둔 채 자정을 넘기면 새 날로 바뀐다.
// 한 번만 계산해 두면 밤새 켜 둔 업무 화면이 다음 날에도 어제 기준으로 D-day 를 셌다.

import { useEffect, useState } from 'react';
import { addDays, startOfDay } from 'date-fns';

export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    // 다음 자정 직후에 한 번 깨어난다. 절전에서 깨어나 늦게 불려도 그때의 날짜로 맞춘다.
    const wait = addDays(today, 1).getTime() - Date.now() + 1000;
    const timer = window.setTimeout(() => setToday(startOfDay(new Date())), Math.max(wait, 1000));
    return () => window.clearTimeout(timer);
  }, [today]);

  return today;
}
