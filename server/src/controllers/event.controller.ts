// 요청을 받고 400 을 가려내는 자리. 저장·권한 판정은 event.service 가 한다 —
// 모델을 여기서 직접 부르지 않는 것이 그 경계다.
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { getSettings } from '../utils/settingsCache';
import { eventService, MAX_RANGE_DAYS } from '../services/event.service';
import { sendSuccess, sendError, sendUnauthorized, sendNotFound } from '../utils/response';

const CSS_COLOR_REGEX =
  /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0(\.\d+)?|1(\.0+)?|\.\d+))?\s*\)|hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(\s*,\s*(0(\.\d+)?|1(\.0+)?|\.\d+))?\s*\)|[a-zA-Z]{1,30})$/;

function isValidCssColor(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === 'string' && value.length <= 50 && CSS_COLOR_REGEX.test(value);
}

export const createEvent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.user?.id;
  const userRole = req.user?.role;

  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  try {
    // 게시판 일정이면 역할이 아니라 그 게시판의 쓰기 권한을 본다.
    const rawBoardId = (req.body as { boardId?: unknown })?.boardId;
    if (rawBoardId !== undefined && rawBoardId !== null && typeof rawBoardId !== 'string') {
      sendError(res, 400, '게시판 id 가 올바르지 않습니다.');
      return;
    }
    const boardId = typeof rawBoardId === 'string' && rawBoardId ? rawBoardId : null;
    if (boardId) {
      await eventService.assertBoardCalendarAccess(boardId, userId, userRole, 'canWrite');
    } else {
      await eventService.assertCanCreate(userRole);
    }

    // UserId·id 주입을 막으려 허용 필드만 뽑아 쓴다.
    // parentEventId 는 받지 않는다 — 반복의 '이 날만' 을 떼어 낼 때 서비스가 정하는 칸이고,
    // 클라이언트가 보낸 적이 없다. 받아 두면 남의 일정을 부모로 지목해 걸어 둘 수 있고,
    // 지울 때 같은 주인의 자식만 지우는 방어가 그 구멍을 막느라 쓰이고 있었다.
    const {
      calendarId,
      title,
      body,
      isAllday,
      start,
      end,
      category,
      location,
      attendees,
      state,
      isReadOnly,
      color,
      backgroundColor,
      dragBackgroundColor,
      borderColor,
      customStyle,
      recurrenceType,
      recurrenceInterval,
      recurrenceDays,
      recurrenceEndDate,
    } = req.body;

    if (!calendarId || !title || !start || !end) {
      sendError(res, 400, 'calendarId, title, start, end는 필수입니다.');
      return;
    }

    if (typeof title !== 'string' || title.trim().length === 0) {
      sendError(res, 400, '제목이 올바르지 않습니다.');
      return;
    }
    if (title.length > 255) {
      sendError(res, 400, '제목은 255자를 초과할 수 없습니다.');
      return;
    }
    const settingsForLen = getSettings();
    if (body && String(body).length > settingsForLen.eventBodyMaxLength) {
      sendError(res, 400, `내용은 ${settingsForLen.eventBodyMaxLength}자를 초과할 수 없습니다.`);
      return;
    }
    if (location && String(location).length > settingsForLen.eventLocationMaxLength) {
      sendError(
        res,
        400,
        `장소는 ${settingsForLen.eventLocationMaxLength}자를 초과할 수 없습니다.`
      );
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      sendError(res, 400, '시작 또는 종료 날짜가 올바르지 않습니다.');
      return;
    }
    // 종일 이벤트는 start === end 를 허용한다.
    if (isAllday ? startDate > endDate : startDate >= endDate) {
      sendError(res, 400, '종료 시간은 시작 시간 이후여야 합니다.');
      return;
    }

    for (const [field, val] of [
      ['color', color],
      ['backgroundColor', backgroundColor],
      ['dragBackgroundColor', dragBackgroundColor],
      ['borderColor', borderColor],
    ] as const) {
      if (!isValidCssColor(val)) {
        sendError(res, 400, `${field} 값이 올바른 CSS 색상 형식이 아닙니다.`);
        return;
      }
    }

    const validRecurrenceTypes = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
    if (recurrenceType && !validRecurrenceTypes.includes(recurrenceType)) {
      sendError(res, 400, '유효하지 않은 반복 유형입니다.');
      return;
    }
    if (recurrenceType && recurrenceType !== 'none') {
      if (!recurrenceEndDate) {
        sendError(res, 400, '반복 이벤트에는 종료 날짜가 필요합니다.');
        return;
      }
      const recurrenceEndDateParsed = new Date(recurrenceEndDate);
      if (isNaN(recurrenceEndDateParsed.getTime())) {
        sendError(res, 400, '반복 종료 날짜가 올바르지 않습니다.');
        return;
      }
      if (recurrenceEndDateParsed < startDate) {
        sendError(res, 400, '반복 종료 날짜는 시작 날짜 이후여야 합니다.');
        return;
      }
      // !(x >= 1) 은 NaN 과 1 미만을 함께 거른다.
      if (recurrenceInterval !== undefined && !(Number(recurrenceInterval) >= 1)) {
        sendError(res, 400, '반복 간격은 1 이상의 숫자여야 합니다.');
        return;
      }
      if (recurrenceType === 'weekly') {
        const days: unknown = recurrenceDays;
        if (
          !Array.isArray(days) ||
          days.length === 0 ||
          !days.every(
            (d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6
          )
        ) {
          sendError(res, 400, '주간 반복에는 요일(0-6) 배열이 필요합니다.');
          return;
        }
      }
    }

    const eventWithUser = await eventService.createEvent(
      {
        calendarId,
        title,
        body,
        isAllday,
        start,
        end,
        category,
        location,
        attendees,
        state,
        isReadOnly,
        color,
        backgroundColor,
        dragBackgroundColor,
        borderColor,
        customStyle,
        recurrenceType,
        recurrenceInterval,
        recurrenceDays,
        recurrenceEndDate,
        boardId,
      },
      userId
    );

    sendSuccess(res, eventWithUser, '이벤트가 생성되었습니다.', 201);
  } catch (err) {
    next(err);
  }
};

export const getEvents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // query string 이 배열로 들어오는 경우를 거른다.
  const start = typeof req.query.start === 'string' ? req.query.start : undefined;
  const end = typeof req.query.end === 'string' ? req.query.end : undefined;
  // 주지 않으면 전사 공유 달력이다. 주면 그 게시판의 달력 — 읽을 수 있는지 먼저 본다.
  const boardId =
    typeof req.query.boardId === 'string' && req.query.boardId ? req.query.boardId : null;

  // 잘못된 날짜를 그대로 넘기면 PostgreSQL/MySQL 에서 캐스팅 오류로 500 이 되므로 400 으로 거른다.
  if (
    (start !== undefined && isNaN(new Date(start).getTime())) ||
    (end !== undefined && isNaN(new Date(end).getTime()))
  ) {
    sendError(res, 400, 'start/end는 유효한 날짜(ISO) 형식이어야 합니다.');
    return;
  }

  // 반복 일정은 이 창 안에서 펼쳐진다. 창이 넓을수록 만들어지는 번째가 늘어나므로
  // 상한을 둔다 — 화면이 한 번에 묻는 가장 넓은 창은 100일이다.
  if (start !== undefined && end !== undefined) {
    const span = new Date(end).getTime() - new Date(start).getTime();
    if (span > MAX_RANGE_DAYS * 86_400_000) {
      sendError(res, 400, `조회 범위는 최대 ${MAX_RANGE_DAYS}일입니다.`);
      return;
    }
  }

  try {
    if (boardId) {
      const userId = req.user?.id;
      if (!userId) {
        sendUnauthorized(res, '로그인이 필요합니다.');
        return;
      }
      await eventService.assertBoardCalendarAccess(boardId, userId, req.user?.role, 'canRead');
    }
    sendSuccess(res, await eventService.listEventsInRange(start, end, boardId));
  } catch (err) {
    next(err);
  }
};

export const updateEvent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;
  const userRole = req.user?.role;

  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  try {
    const existingEvent = await eventService.loadEvent(id);
    await eventService.assertCanEdit(existingEvent, userId, userRole);

    // UserId 변경으로 소유권이 바뀌지 않도록 허용 필드만 뽑아 쓴다.
    const {
      calendarId,
      title,
      body,
      isAllday,
      start,
      end,
      category,
      location,
      attendees,
      state,
      isReadOnly,
      color,
      backgroundColor,
      dragBackgroundColor,
      borderColor,
      customStyle,
      recurrenceType,
      recurrenceInterval,
      recurrenceDays,
      recurrenceEndDate,
    } = req.body;

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        sendError(res, 400, '제목이 올바르지 않습니다.');
        return;
      }
      if (title.length > 255) {
        sendError(res, 400, '제목은 255자를 초과할 수 없습니다.');
        return;
      }
    }
    const settingsForUpdateLen = getSettings();
    if (body && String(body).length > settingsForUpdateLen.eventBodyMaxLength) {
      sendError(
        res,
        400,
        `내용은 ${settingsForUpdateLen.eventBodyMaxLength}자를 초과할 수 없습니다.`
      );
      return;
    }
    if (location && String(location).length > settingsForUpdateLen.eventLocationMaxLength) {
      sendError(
        res,
        400,
        `장소는 ${settingsForUpdateLen.eventLocationMaxLength}자를 초과할 수 없습니다.`
      );
      return;
    }
    // 한쪽만 보내도 DB 의 기존 값과 비교해 시간 순서를 검증한다.
    if (start !== undefined || end !== undefined) {
      const startDate = new Date(start ?? existingEvent.start);
      const endDate = new Date(end ?? existingEvent.end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        sendError(res, 400, '시작 또는 종료 날짜가 올바르지 않습니다.');
        return;
      }
      const effectiveAllday = isAllday ?? existingEvent.isAllday;
      if (effectiveAllday ? startDate > endDate : startDate >= endDate) {
        sendError(res, 400, '종료 시간은 시작 시간 이후여야 합니다.');
        return;
      }

      // 반복 규칙은 그대로 둔 채 시작만 뒤로 밀면, 아래의 반복 검사는 건너뛴다
      // (recurrenceFieldsTouched 가 아니므로). 그러면 종료일보다 늦은 시작이 저장되어
      // 번째가 하나도 서지 않는다 — 행은 남아 있는데 달력에서는 사라진 것처럼 보인다.
      const typeNow = recurrenceType !== undefined ? recurrenceType : existingEvent.recurrenceType;
      const endNow =
        recurrenceEndDate !== undefined ? recurrenceEndDate : existingEvent.recurrenceEndDate;
      if (typeNow && typeNow !== 'none' && endNow) {
        const endParsed = new Date(String(endNow));
        if (!isNaN(endParsed.getTime()) && endParsed < startDate) {
          sendError(res, 400, '반복 종료 날짜는 시작 날짜 이후여야 합니다.');
          return;
        }
      }
    }

    for (const [field, val] of [
      ['color', color],
      ['backgroundColor', backgroundColor],
      ['dragBackgroundColor', dragBackgroundColor],
      ['borderColor', borderColor],
    ] as const) {
      if (!isValidCssColor(val)) {
        sendError(res, 400, `${field} 값이 올바른 CSS 색상 형식이 아닙니다.`);
        return;
      }
    }

    // recurrenceType 을 보내지 않아도 옵션 필드가 오면 기존 recurrenceType 기준으로 검증한다.
    const validRecurrenceTypes = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
    const recurrenceFieldsTouched =
      recurrenceType !== undefined ||
      recurrenceInterval !== undefined ||
      recurrenceDays !== undefined ||
      recurrenceEndDate !== undefined;

    if (recurrenceFieldsTouched) {
      const effectiveRecurrenceType = (
        recurrenceType !== undefined ? recurrenceType : existingEvent.recurrenceType
      ) as string | null | undefined;

      if (recurrenceType !== undefined && !validRecurrenceTypes.includes(recurrenceType)) {
        sendError(res, 400, '유효하지 않은 반복 유형입니다.');
        return;
      }

      // recurrenceType 이 'none' 인데 옵션 필드를 보내면 데이터가 어긋난다.
      const optionsTouched =
        recurrenceInterval !== undefined ||
        recurrenceDays !== undefined ||
        recurrenceEndDate !== undefined;
      if (optionsTouched && (!effectiveRecurrenceType || effectiveRecurrenceType === 'none')) {
        sendError(res, 400, '반복 옵션을 변경하려면 recurrenceType을 함께 지정해야 합니다.');
        return;
      }

      if (effectiveRecurrenceType && effectiveRecurrenceType !== 'none') {
        const effectiveEndDate =
          recurrenceEndDate !== undefined ? recurrenceEndDate : existingEvent.recurrenceEndDate;
        if (!effectiveEndDate) {
          sendError(res, 400, '반복 이벤트에는 종료 날짜가 필요합니다.');
          return;
        }
        const recurrenceEndDateParsed = new Date(String(effectiveEndDate));
        if (isNaN(recurrenceEndDateParsed.getTime())) {
          sendError(res, 400, '반복 종료 날짜가 올바르지 않습니다.');
          return;
        }
        const effectiveStart = start ? new Date(start) : new Date(String(existingEvent.start));
        if (recurrenceEndDateParsed < effectiveStart) {
          sendError(res, 400, '반복 종료 날짜는 시작 날짜 이후여야 합니다.');
          return;
        }
        // !(x >= 1) 은 NaN 과 1 미만을 함께 거른다.
        if (recurrenceInterval !== undefined && !(Number(recurrenceInterval) >= 1)) {
          sendError(res, 400, '반복 간격은 1 이상의 숫자여야 합니다.');
          return;
        }
        if (effectiveRecurrenceType === 'weekly') {
          const days: unknown =
            recurrenceDays !== undefined ? recurrenceDays : existingEvent.recurrenceDays;
          if (
            !Array.isArray(days) ||
            days.length === 0 ||
            !days.every(
              (d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6
            )
          ) {
            sendError(res, 400, '주간 반복에는 요일(0-6) 배열이 필요합니다.');
            return;
          }
        }
      }
    }

    await eventService.updateEvent(id, {
      calendarId,
      title,
      body,
      isAllday,
      start,
      end,
      category,
      location,
      attendees,
      state,
      isReadOnly,
      color,
      backgroundColor,
      dragBackgroundColor,
      borderColor,
      customStyle,
      recurrenceType,
      recurrenceInterval,
      recurrenceDays,
      recurrenceEndDate,
    });

    const updatedEvent = await eventService.findWithUser(id);
    if (!updatedEvent) {
      sendNotFound(res, '이벤트');
      return;
    }

    sendSuccess(res, updatedEvent, '이벤트가 수정되었습니다.');
  } catch (err) {
    next(err);
  }
};

export const deleteEvent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  try {
    await eventService.deleteOwnEvent(id, userId, req.user?.role);
    sendSuccess(res, { deletedId: id }, '이벤트가 삭제되었습니다.');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/events/:id/occurrences/:date — 반복 중 그 날 하루만 건너뛴다.
 *
 * 규칙 자체는 그대로 두고 건너뛸 날짜만 더한다. 반복 전체를 지우는 것과 다르므로
 * 지우는 권한(deleteEvent)과 같은 규칙으로 본다.
 */
/**
 * PUT /api/events/:id/occurrences/:date — 반복 중 그 날 하루만 다르게 만든다.
 *
 * 규칙 전체를 고치는 PUT /api/events/:id 와 다르다. 그 날을 건너뛰고 그 자리에
 * 따로 선 일정 하나를 세운다. 예전에는 하루만 옮기려면 건너뛴 뒤 새로 만들어야 했다.
 */
export const editOccurrence = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { id, date } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    sendError(res, 400, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
    return;
  }

  // 반복 칸은 받지 않는다 — 떨어져 나온 하루는 더 반복하지 않는다.
  const {
    title,
    body,
    isAllday,
    start,
    end,
    category,
    location,
    color,
    backgroundColor,
    dragBackgroundColor,
    borderColor,
  } = req.body ?? {};

  if (!start || !end) {
    sendError(res, 400, 'start, end는 필수입니다.');
    return;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    sendError(res, 400, '시작 또는 종료 날짜가 올바르지 않습니다.');
    return;
  }
  if (isAllday ? startDate > endDate : startDate >= endDate) {
    sendError(res, 400, '종료 시간은 시작 시간 이후여야 합니다.');
    return;
  }
  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    sendError(res, 400, '제목이 올바르지 않습니다.');
    return;
  }
  const settings = getSettings();
  if (title && String(title).length > 255) {
    sendError(res, 400, '제목은 255자를 초과할 수 없습니다.');
    return;
  }
  if (body && String(body).length > settings.eventBodyMaxLength) {
    sendError(res, 400, `내용은 ${settings.eventBodyMaxLength}자를 초과할 수 없습니다.`);
    return;
  }
  if (location && String(location).length > settings.eventLocationMaxLength) {
    sendError(res, 400, `장소는 ${settings.eventLocationMaxLength}자를 초과할 수 없습니다.`);
    return;
  }
  for (const [field, val] of [
    ['color', color],
    ['backgroundColor', backgroundColor],
    ['dragBackgroundColor', dragBackgroundColor],
    ['borderColor', borderColor],
  ] as const) {
    if (!isValidCssColor(val)) {
      sendError(res, 400, `${field} 값이 올바른 CSS 색상 형식이 아닙니다.`);
      return;
    }
  }

  // undefined 인 칸은 규칙에서 물려받는다(서비스가 채운다).
  const patch = Object.fromEntries(
    Object.entries({
      title,
      body,
      isAllday,
      start,
      end,
      category,
      location,
      color,
      backgroundColor,
      dragBackgroundColor,
      borderColor,
    }).filter(([, v]) => v !== undefined)
  );

  try {
    const created = await eventService.editOccurrence(id, date, patch, userId, req.user?.role);
    sendSuccess(res, created, '이 날만 따로 저장했습니다.', 201);
  } catch (err) {
    next(err);
  }
};

export const skipOccurrence = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { id, date } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    sendError(res, 400, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
    return;
  }

  try {
    const recurrenceExcept = await eventService.skipOccurrence(id, date, userId, req.user?.role);
    sendSuccess(res, { id: Number(id), recurrenceExcept }, '이 날은 건너뜁니다.');
  } catch (err) {
    next(err);
  }
};
