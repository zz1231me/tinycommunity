// 업무 간트. 막대를 끌거나 늘이면 시작일·마감일이 바뀐다.
// 일정이 없는 일은 오늘 하루짜리 점선 막대로 그리고, 처음 끌어 놓을 때 일정이 생긴다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, isToday, isWeekend, max, min } from 'date-fns';
import { Gantt, Willow, WillowDark, type IApi, type ITask } from '@svar-ui/react-gantt';
// all.css 가 아니라 style.css 를 쓴다. all.css(dist-full)에는 "Open Sans"·Roboto 를
// cdn.svar.dev 에서 받아오는 @font-face 가 들어 있어, 간트를 열 때마다 외부 요청이 나가고
// CSP(font-src)가 막아 콘솔에 위반이 쌓였다. style.css 에는 테마가 그대로 있고 글꼴 선언만
// 없다(151KB → 33KB).
import '@svar-ui/react-gantt/style.css';
import './TaskGantt.css';
import type { MyTask } from '../../api/tasks';
import { useTheme } from '../../contexts/ThemeContext';
import { safeStorage } from '../../utils/safeStorage';
import { Tooltip } from '../common/Tooltip';
import { TaskTooltipContent } from './TaskTooltipContent';
import { dueInfo, fromGanttRange, toGanttRange } from './taskViews';
import { useToday } from '../../hooks/useToday';
import { useUiPrefs } from '../../hooks/useUiPrefs';

type Zoom = 'day' | 'week' | 'month';

const ZOOMS: { key: Zoom; label: string; cellWidth: number; scales: object[] }[] = [
  {
    key: 'day',
    label: '일',
    cellWidth: 36,
    scales: [
      { unit: 'month', step: 1, format: (d: Date) => format(d, 'yyyy년 M월') },
      { unit: 'day', step: 1, format: (d: Date) => format(d, 'd') },
    ],
  },
  {
    key: 'week',
    label: '주',
    cellWidth: 72,
    scales: [
      { unit: 'month', step: 1, format: (d: Date) => format(d, 'yyyy년 M월') },
      { unit: 'week', step: 1, format: (d: Date) => `${format(d, 'M/d')}~` },
    ],
  },
  {
    key: 'month',
    label: '월',
    cellWidth: 90,
    scales: [
      { unit: 'year', step: 1, format: (d: Date) => format(d, 'yyyy년') },
      { unit: 'month', step: 1, format: (d: Date) => format(d, 'M월') },
    ],
  },
];
const ZOOM_KEY = 'myhome-tasks-gantt-zoom';

interface Props {
  tasks: MyTask[];
  /** 실패하면 거절한다. 그러면 막대를 저장된 자리로 되돌린다. */
  onReschedule: (task: MyTask, dates: { startDate: string; dueDate: string }) => Promise<void>;
}

export function TaskGantt({ tasks, onReschedule }: Props) {
  const { effectiveTheme } = useTheme();
  const Theme = effectiveTheme === 'dark' ? WillowDark : Willow;
  // 확대 단위도 계정에 저장한다. 기기마다 다르게 열리지 않게.
  const { prefs, setPref } = useUiPrefs();
  const [zoom, setZoom] = useState<Zoom>(() => {
    const saved = safeStorage.get(ZOOM_KEY);
    return ZOOMS.some(z => z.key === saved) ? (saved as Zoom) : 'day';
  });
  // 서버에 저장된 값이 오면 그것으로 맞춘다. 로컬 값은 첫 그림이 튀지 않게 쓰는 것이다.
  useEffect(() => {
    const saved = prefs.taskGanttZoom;
    if (saved && saved !== zoom && ZOOMS.some(z => z.key === saved)) setZoom(saved);
    // 처음 한 번만 따라간다 — 사용자가 바꾼 뒤에 서버 응답이 늦게 와서 되돌리면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.taskGanttZoom]);

  const zoomConfig = ZOOMS.find(z => z.key === zoom) ?? ZOOMS[0];
  // 저장에 실패하면 간트를 새로 그려 끌기 전 자리로 돌린다. 데이터가 같아 tasks 만으로는 다시 그려지지 않는다.
  const [resetKey, setResetKey] = useState(0);

  // 간트는 처음 한 번만 init 을 부르므로 최신 목록·콜백은 ref 로 본다
  const latest = useRef({ tasks, onReschedule });
  useEffect(() => {
    latest.current = { tasks, onReschedule };
  });

  const today = useToday();

  const ganttTasks = useMemo<ITask[]>(
    () =>
      tasks.map(task => {
        const range = toGanttRange(task, today);
        return {
          id: task.id,
          text: task.title,
          start: range.start,
          end: range.end,
          type: 'task',
          scheduled: range.scheduled,
          // 막대 템플릿·왼쪽 목록이 쓴다
          task,
        };
      }),
    [tasks, today]
  );

  // 보이는 범위. 오늘이 늘 들어가고, 앞뒤로 끌어 놓을 여유를 둔다.
  const range = useMemo(() => {
    const starts = ganttTasks.map(t => t.start as Date);
    const ends = ganttTasks.map(t => t.end as Date);
    return {
      start: addDays(min([today, ...starts]), -7),
      end: addDays(max([addDays(today, 1), ...ends]), 21),
    };
  }, [ganttTasks, today]);

  const init = (api: IApi) => {
    const canEdit = (id: unknown) => latest.current.tasks.find(t => t.id === id)?.canEdit ?? false;
    // 바꿀 권한이 없는 업무는 끌 수 없게 한다. 서버도 막지만, 놓은 뒤에 튕겨 나가면 헷갈린다.
    api.intercept('drag-task', ev => canEdit(ev.id));
    api.intercept('update-task', ev => canEdit(ev.id));
    // 간트 안에서 업무를 만들거나 지우거나 잇는 기능은 쓰지 않는다
    for (const action of ['add-task', 'delete-task', 'add-link', 'show-editor'] as const) {
      api.intercept(action, () => false);
    }

    api.on('update-task', ev => {
      // 끄는 동안에도 계속 불린다. 놓았을 때 한 번만 저장한다.
      if (ev.inProgress) return;
      const task = latest.current.tasks.find(t => t.id === ev.id);
      const bar = api.getTask(ev.id);
      if (!task || !bar?.start || !bar.end) return;

      const next = fromGanttRange(bar.start, bar.end);
      if (next.startDate === task.startDate && next.dueDate === task.dueDate) return;
      latest.current.onReschedule(task, next).catch(() => setResetKey(k => k + 1));
    });

    // 처음 열면 오늘 근처를 보여 준다. 기본은 맨 왼쪽이라 오늘이 화면 밖에 있곤 했다.
    void api.exec('scroll-chart', { date: addDays(today, -3) });
  };

  const changeZoom = (next: Zoom) => {
    setZoom(next);
    safeStorage.set(ZOOM_KEY, next);
    setPref('taskGanttZoom', next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          막대를 끌어 일정을 옮기고, 끝을 늘여 기간을 바꿉니다. 점선은 일정이 아직 없는 일입니다.
        </p>
        <div
          role="group"
          aria-label="간트 단위"
          className="flex flex-shrink-0 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
        >
          {ZOOMS.map(z => (
            <button
              key={z.key}
              type="button"
              aria-pressed={zoom === z.key}
              onClick={() => changeZoom(z.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                zoom === z.key
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>
      <div className="task-gantt card h-[32rem] overflow-hidden">
        <Theme fonts={false}>
          <Gantt
            key={`${resetKey}-${zoom}`}
            init={init}
            tasks={ganttTasks}
            scales={zoomConfig.scales as never}
            cellWidth={zoomConfig.cellWidth}
            // 끌기는 하루 단위로 맞춘다. 주·월 단위로 볼 때도 날짜가 일주일씩 튀지 않는다.
            lengthUnit="day"
            start={range.start}
            end={range.end}
            highlightTime={highlightDay}
            columns={COLUMNS}
            taskTemplate={Bar}
          />
        </Theme>
      </div>
    </div>
  );
}

/**
 * 주말은 흐리게, 오늘은 따로 칠한다. 오늘 세로선(markers)은 SVAR 유료판 기능이라 무료판에서는
 * 비워 버리므로, 주말 칠하기와 같은 자리(highlightTime)를 빌린다. 'wx-weekend' 가 칸의 위치·높이를 잡는다.
 */
function highlightDay(date: Date, unit: string): string {
  if (unit !== 'day') return '';
  if (isToday(date)) return 'wx-weekend task-gantt-today';
  return isWeekend(date) ? 'wx-weekend' : '';
}

/** 왼쪽 목록의 업무 이름. 누르면 글이 열린다. */
function TitleCell({ row }: { row: { text?: string; task?: MyTask } }) {
  const task = row.task;
  if (!task) return <span>{row.text}</span>;
  return (
    <Link
      to={`/dashboard/posts/${task.boardType}/${task.id}`}
      className="block truncate hover:underline"
    >
      {task.title}
    </Link>
  );
}

const COLUMNS = [{ id: 'text', header: '업무', width: 200, cell: TitleCell }];

function Bar({ data }: { data: ITask }) {
  const task = data.task as MyTask | undefined;
  const label = data.scheduled ? data.text : `${data.text} (일정 미정)`;
  if (!task) return <span className="truncate px-1">{label}</span>;

  // 끄는 동안에는 막대의 지금 자리를 일정으로 보여 준다. 놓기 전에 어디로 가는지 알 수 있다.
  // 일정 미정 막대는 아직 움직이지 않았으면 '일정 미정' 그대로 둔다.
  const live =
    data.start && data.end ? fromGanttRange(data.start as Date, data.end as Date) : undefined;
  const moved = live && (data.scheduled || live.startDate !== format(new Date(), 'yyyy-MM-dd'));

  const state = !data.scheduled
    ? 'task-bar-unscheduled'
    : task.workStatus === 'done'
      ? 'task-bar-done'
      : dueInfo(task, new Date())?.tone === 'overdue'
        ? 'task-bar-overdue'
        : '';

  return (
    <Tooltip
      content={<TaskTooltipContent task={task} schedule={moved ? live : undefined} />}
      // 일정 미정 막대는 하루짜리라 글자가 '일…' 로 잘린다. 막대 밖으로 이어 쓰게 자르지 않는다.
      className={`h-full w-full px-1 ${data.scheduled ? 'truncate' : 'whitespace-nowrap'} ${state} ${task.canEdit ? '' : 'task-bar-locked'}`}
    >
      {label}
    </Tooltip>
  );
}
