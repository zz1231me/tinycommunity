// 월간 뷰에서 하루에 이벤트가 많아 넘칠 때, 그 날짜 셀의 이벤트 목록을 위아래로
// 천천히 자동 스크롤(마퀴)해서 모두 순회 표시한다. FullCalendar의 DOM을 재구성하지 않고
// 셀의 scrollTop만 조작하므로 레이아웃 계산과 충돌하지 않는다.
//
// - 넘치지 않는 셀은 건드리지 않음
// - 마우스를 올리면 일시정지(읽기/클릭 방해 방지)
// - prefers-reduced-motion 사용자는 자동 스크롤 대신 수동 스크롤로 대체
export function setupDayAutoScroll(root: HTMLElement): () => void {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const cells = Array.from(root.querySelectorAll<HTMLElement>('.fc-daygrid-day-events'));
  const cleanups: Array<() => void> = [];

  for (const cell of cells) {
    const overflow = cell.scrollHeight - cell.clientHeight;
    if (overflow <= 4) continue; // 넘치지 않으면 스킵

    if (reduce) {
      cell.style.overflowY = 'auto';
      cleanups.push(() => {
        cell.style.overflowY = '';
      });
      continue;
    }

    let raf = 0;
    let pos = 0;
    let dir = 1; // 1=아래로, -1=위로
    let hold = 60; // 양 끝에서 잠깐 멈춤(프레임 수)
    let paused = false;
    const max = overflow;
    const SPEED = 0.35; // px/frame

    const step = () => {
      if (!paused) {
        if (hold > 0) {
          hold -= 1;
        } else {
          pos += dir * SPEED;
          if (pos >= max) {
            pos = max;
            dir = -1;
            hold = 60;
          } else if (pos <= 0) {
            pos = 0;
            dir = 1;
            hold = 60;
          }
          cell.scrollTop = pos;
        }
      }
      raf = requestAnimationFrame(step);
    };

    const onEnter = () => {
      paused = true;
    };
    const onLeave = () => {
      paused = false;
    };
    cell.addEventListener('mouseenter', onEnter);
    cell.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(step);

    cleanups.push(() => {
      cancelAnimationFrame(raf);
      cell.removeEventListener('mouseenter', onEnter);
      cell.removeEventListener('mouseleave', onLeave);
      cell.scrollTop = 0;
    });
  }

  return () => cleanups.forEach(fn => fn());
}
