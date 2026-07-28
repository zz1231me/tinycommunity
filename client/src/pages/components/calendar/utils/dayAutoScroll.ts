// 월간 뷰에서 하루에 예약이 많아 넘칠 때, 그 날짜 셀의 목록을 아주 부드럽게 위아래로
// 오가며(내려갔다 → 잠깐 멈춤 → 올라갔다 → 잠깐 멈춤) 전부 순회 보여준다.
// 선형이 아니라 ease-in-out이라 양 끝에서 가속/감속하며 '고급진 티커'처럼 움직인다.
// FullCalendar DOM은 건드리지 않고 scrollTop만 조작해 레이아웃과 충돌하지 않는다.
//
// 성능: 넘치는 셀이 여러 개여도 rAF 루프는 딱 1개만 돌리고, 그 안에서 각 셀을 갱신한다.
// - 넘치지 않는 셀은 그대로 둠
// - 마우스를 올린 셀만 일시정지(읽기/클릭 방해 방지)
// - prefers-reduced-motion 사용자는 자동 스크롤 대신 수동 스크롤로 대체
// - 시간(performance.now) 기반이라 60/120Hz 등 주사율과 무관하게 같은 속도

const PACE_PX_PER_SEC = 18; // 평균 이동 속도(천천히)
const MIN_LEG_MS = 2600; // 한 방향 최소 소요(짧은 목록도 급하지 않게)
const HOLD_MS = 750; // 위/아래 끝에서 정지
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

type Phase = 'holdTop' | 'down' | 'holdBottom' | 'up';

interface Scroller {
  cell: HTMLElement;
  max: number;
  legMs: number;
  phase: Phase;
  phaseStart: number;
  paused: boolean;
  pausedAt: number;
}

function advance(s: Scroller, now: number): void {
  if (s.paused) {
    // 멈춰 있는 동안 경과시간이 흐르지 않도록 시작점을 밀어준다
    s.phaseStart += now - s.pausedAt;
    s.pausedAt = now;
    return;
  }
  const el = now - s.phaseStart;
  switch (s.phase) {
    case 'holdTop':
      if (el >= HOLD_MS) {
        s.phase = 'down';
        s.phaseStart = now;
      }
      break;
    case 'down': {
      const t = Math.min(el / s.legMs, 1);
      s.cell.scrollTop = s.max * easeInOut(t); // 0 → max, 부드럽게 아래로
      if (t >= 1) {
        s.phase = 'holdBottom';
        s.phaseStart = now;
      }
      break;
    }
    case 'holdBottom':
      if (el >= HOLD_MS) {
        s.phase = 'up';
        s.phaseStart = now;
      }
      break;
    case 'up': {
      const t = Math.min(el / s.legMs, 1);
      s.cell.scrollTop = s.max * (1 - easeInOut(t)); // max → 0, 부드럽게 위로
      if (t >= 1) {
        s.phase = 'holdTop';
        s.phaseStart = now;
      }
      break;
    }
  }
}

export function setupDayAutoScroll(root: HTMLElement): () => void {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const cells = Array.from(root.querySelectorAll<HTMLElement>('.fc-daygrid-day-events'));
  const scrollers: Scroller[] = [];
  const teardowns: Array<() => void> = [];

  for (const cell of cells) {
    const max = cell.scrollHeight - cell.clientHeight;
    if (max <= 4) continue; // 넘치지 않으면 스킵

    if (reduce) {
      cell.style.overflowY = 'auto'; // 모션 최소화 사용자는 수동 스크롤
      teardowns.push(() => {
        cell.style.overflowY = '';
      });
      continue;
    }

    const s: Scroller = {
      cell,
      max,
      legMs: Math.max(MIN_LEG_MS, (max / PACE_PX_PER_SEC) * 1000),
      phase: 'holdTop',
      phaseStart: performance.now(),
      paused: false,
      pausedAt: 0,
    };
    const onEnter = () => {
      s.paused = true;
      s.pausedAt = performance.now();
    };
    const onLeave = () => {
      s.paused = false;
    };
    cell.addEventListener('mouseenter', onEnter);
    cell.addEventListener('mouseleave', onLeave);
    teardowns.push(() => {
      cell.removeEventListener('mouseenter', onEnter);
      cell.removeEventListener('mouseleave', onLeave);
      cell.scrollTop = 0;
    });
    scrollers.push(s);
  }

  let raf = 0;
  if (scrollers.length > 0) {
    const tick = (now: number) => {
      for (const s of scrollers) advance(s, now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  return () => {
    if (raf) cancelAnimationFrame(raf);
    teardowns.forEach(fn => fn());
  };
}
