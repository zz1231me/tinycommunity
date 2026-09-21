import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/sequelize';
import Event from '../models/Event';
import { User } from '../models/User';
import EventPermission from '../models/EventPermission';
import { AuthRequest } from '../types/auth-request';
import { sanitizeHtmlContent } from '../utils/contentRenderer';
import { getSettings } from '../utils/settingsCache';
import {
  sendSuccess,
  sendError,
  sendUnauthorized,
  sendNotFound,
  sendForbidden,
} from '../utils/response';
import { ROLES } from '../config/constants';

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
    if (userRole !== ROLES.ADMIN) {
      const eventPermission = await EventPermission.findOne({ where: { roleId: userRole } });
      if (!eventPermission?.canCreate) {
        sendForbidden(res, '이벤트를 생성할 권한이 없습니다.');
        return;
      }
    }

    // UserId·id 주입을 막으려 허용 필드만 뽑아 쓴다.
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
      parentEventId,
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

    const event = await Event.create({
      calendarId,
      title,
      body: body ? sanitizeHtmlContent(String(body)) : body,
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
      parentEventId,
      UserId: userId,
    });

    const eventWithUser = await Event.findByPk(event.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    });

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

  // 잘못된 날짜를 그대로 넘기면 PostgreSQL/MySQL 에서 캐스팅 오류로 500 이 되므로 400 으로 거른다.
  if (
    (start !== undefined && isNaN(new Date(start).getTime())) ||
    (end !== undefined && isNaN(new Date(end).getTime()))
  ) {
    sendError(res, 400, 'start/end는 유효한 날짜(ISO) 형식이어야 합니다.');
    return;
  }

  try {
    const whereClause = start && end ? { start: { [Op.lte]: end }, end: { [Op.gte]: start } } : {};

    const events = await Event.findAll({
      where: whereClause,
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      order: [['start', 'ASC']],
      limit: 2000, // ✅ 무제한 조회 방지
    });

    sendSuccess(res, events);
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
    const existingEvent = await Event.findByPk(id);
    if (!existingEvent) {
      sendNotFound(res, '이벤트');
      return;
    }

    const isOwner = existingEvent.UserId === userId;
    const isAdminUser = userRole === ROLES.ADMIN;

    if (!isOwner && !isAdminUser) {
      const eventPermission = await EventPermission.findOne({ where: { roleId: userRole } });
      if (!eventPermission?.canUpdate) {
        sendForbidden(res, '다른 사용자의 일정을 수정할 권한이 없습니다.');
        return;
      }
    }

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
      parentEventId,
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

    const [updated] = await Event.update(
      {
        calendarId,
        title,
        body: body !== undefined ? (body ? sanitizeHtmlContent(String(body)) : body) : undefined,
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
        parentEventId,
      },
      { where: { id } }
    );
    if (updated === 0) {
      sendNotFound(res, '이벤트');
      return;
    }

    const updatedEvent = await Event.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    });
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
  const userRole = req.user?.role;

  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  try {
    const existingEvent = await Event.findByPk(id);
    if (!existingEvent) {
      sendNotFound(res, '이벤트');
      return;
    }

    const isOwner = existingEvent.UserId === userId;
    const isAdminUser = userRole === ROLES.ADMIN;

    if (!isOwner && !isAdminUser) {
      const eventPermission = await EventPermission.findOne({ where: { roleId: userRole } });
      if (!eventPermission?.canDelete) {
        sendForbidden(res, '다른 사용자의 일정을 삭제할 권한이 없습니다.');
        return;
      }
    }

    // 부모를 지울 때 자식 인스턴스도 같은 트랜잭션에서 지운다.
    // 같은 소유자의 자식만 지운다. parentEventId 는 임의로 설정할 수 있어 남의 이벤트가 함께 지워질 수 있다.
    let deleted = 0;
    await sequelize.transaction(async t => {
      await Event.destroy({
        where: { parentEventId: id, UserId: existingEvent.UserId },
        transaction: t,
      });
      deleted = await Event.destroy({ where: { id }, transaction: t });
    });

    if (deleted === 0) {
      sendNotFound(res, '이벤트');
      return;
    }

    sendSuccess(res, { deletedId: id }, '이벤트가 삭제되었습니다.');
  } catch (err) {
    next(err);
  }
};
