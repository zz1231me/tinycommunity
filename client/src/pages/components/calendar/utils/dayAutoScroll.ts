// 월간 뷰에서 하루에 예약이 많아 넘칠 때, 그 날짜 셀의 목록을 아주 부드럽게 위아래로
// 오가며(내려갔다 → 잠깐 멈춤 → 올라갔다 → 잠깐 멈춤) 전부 순회 보여준다.
// 선형이 아니라 ease-in-out이라 양 끝에서 가속/감속하며 '고급진 티커'처럼 움직인다.
// FullCalendar DOM은 건드리지 않고 scrollTop만 조작해 레이아웃과 충돌하지 않는다.
//
// - 넘치지 않는 셀은 그대로 둠
// - 마우스를 올리면 일시정지(읽기/클릭 방해 방지)
// - prefers-reduced-motion 사용자는 자동 스크롤 대신 수동 스크롤로 대체
// - 시간(performance.now) 기반이라 60/120Hz 등 주사율과 무관하게 같은 속도

const PACE_PX_PER_SEC = 18; // 평균 이동 속도(천천히)
const MIN_LEG_MS = 2600; // 한 방향 최소 소요(짧은 목록도 급하지 않게)
const HOLD_MS = 750; // 위/아래 끝에서 정지
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

type Phase = 'holdTop' | 'down' | 'holdBottom' | 'up';

export function setupDayAutoScroll(root: HTMLElement): () => void {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const cells = Array.from(root.querySelectorAll<HTMLElement>('.fc-daygrid-day-events'));
  const cleanups: Array<() => void> = [];

  for (const cell of cells) {
    const max = cell.scrollHeight - cell.clientHeight;
    if (max <= 4) continue; // 넘치지 않으면 스킵

    if (reduce) {
      cell.style.overflowY = 'auto'; // 모션 최소화 사용자는 수동 스크롤
      cleanups.push(() => {
        cell.style.overflowY = '';
      });
      continue;
    }

    const legMs = Math.max(MIN_LEG_MS, (max / PACE_PX_PER_SEC) * 1000);

    let raf = 0;
    let phase: Phase = 'holdTop';
    let phaseStart = performance.now();
    let pos = 0;
    let paused = false;
    let pausedAt = 0;

    const frame = (now: number) => {
      if (paused) {
        // 멈춰 있는 동안 경과시간이 흐르지 않도록 시작점을 밀어준다
        phaseStart += now - pausedAt;
        pausedAt = now;
        raf = requestAnimationFrame(frame);
        return;
      }
      const el = now - phaseStart;
      switch (phase) {
        case 'holdTop':
          if (el >= HOLD_MS) {
            phase = 'down';
            phaseStart = now;
          }
          break;
        case 'down': {
          const t = Math.min(el / legMs, 1);
          pos = max * easeInOut(t); // 0 → max, 부드럽게 아래로
          if (t >= 1) {
            phase = 'holdBottom';
            phaseStart = now;
          }
          break;
        }
        case 'holdBottom':
          if (el >= HOLD_MS) {
            phase = 'up';
            phaseStart = now;
          }
          break;
        case 'up': {
          const t = Math.min(el / legMs, 1);
          pos = max * (1 - easeInOut(t)); // max → 0, 부드럽게 위로
          if (t >= 1) {
            phase = 'holdTop';
            phaseStart = now;
          }
          break;
        }
      }
      cell.scrollTop = pos;
      raf = requestAnimationFrame(frame);
    };

    const onEnter = () => {
      paused = true;
      pausedAt = performance.now();
    };
    const onLeave = () => {
      paused = false;
    };
    cell.addEventListener('mouseenter', onEnter);
    cell.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(frame);

    cleanups.push(() => {
      cancelAnimationFrame(raf);
      cell.removeEventListener('mouseenter', onEnter);
      cell.removeEventListener('mouseleave', onLeave);
      cell.scrollTop = 0;
    });
  }

  return () => cleanups.forEach(fn => fn());
}
