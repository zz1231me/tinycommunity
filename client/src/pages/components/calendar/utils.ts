// client/src/pages/components/calendar/utils.ts
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

/**
 * 날짜 유틸리티
 * 모든 날짜 연산은 UTC 기준으로 처리 (타임존 밀림 방지)
 */
export const dateUtils = {
  /**
   * Date 객체 → YYYY-MM-DD (로컬 날짜 기준)
   * FullCalendar select/click 콜백에서 넘어오는 Date 처리에 사용
   */
  toLocalDateString: (date: Date): string => {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  },

  /**
   * YYYY-MM-DD 문자열에서 하루를 뺀 YYYY-MM-DD 반환 (UTC 기준)
   */
  subtractDay: (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().split('T')[0];
  },

  /**
   * YYYY-MM-DD 문자열에 하루를 더한 YYYY-MM-DD 반환 (UTC 기준)
   */
  addDay: (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().split('T')[0];
  },

  /**
   * ISO 문자열 → YYYY-MM-DD (날짜 부분만 추출)
   */
  isoToLocalDate: (isoString: string): string => {
    return isoString.split('T')[0];
  },

  /**
   * 날짜 범위 유효성 체크
   */
  isValidRange: (start: string, end: string): boolean => {
    return new Date(end + 'T00:00:00Z') >= new Date(start + 'T00:00:00Z');
  },

  /**
   * 최소 1일 기간 보장 (드래그/리사이즈 시 end가 start 이전이 되는 경우 방지)
   */
  ensureMinimumDuration: (startDate: Date, endDate: Date | null): Date => {
    if (!endDate || endDate.getTime() <= startDate.getTime()) {
      const newEnd = new Date(startDate);
      newEnd.setUTCDate(newEnd.getUTCDate() + 1);
      return newEnd;
    }
    return endDate;
  },
};

/**
 * 날짜 범위 포맷 (상세보기)
 * DB에 저장된 exclusive-end ISO 날짜를 사람이 읽기 좋은 형태로 변환
 * 예) "2024-01-15T00:00:00Z" ~ "2024-01-16T00:00:00Z" → "2024년 1월 15일 (월)"
 */
export const formatDateRange = (startStr: string, endStr: string): string => {
  // UTC 기준으로 날짜 파싱 (타임존 무관하게 일관된 결과)
  const startDateStr = startStr.split('T')[0];
  const endDateStr = endStr.split('T')[0];

  // exclusive-end → inclusive-end 변환 (저장은 +1일로 되어 있음)
  const endExclusive = new Date(endDateStr + 'T00:00:00Z');
  endExclusive.setUTCDate(endExclusive.getUTCDate() - 1);
  const inclusiveEndStr = endExclusive.toISOString().split('T')[0];

  const fmt = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    return format(d, 'yyyy년 MM월 dd일 (eee)', { locale: ko });
  };

  if (startDateStr === inclusiveEndStr) {
    return fmt(startDateStr);
  }

  return `${fmt(startDateStr)} ~ ${fmt(inclusiveEndStr)}`;
};
