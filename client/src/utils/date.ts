import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';

export function formatDate(date: string | Date | null | undefined, pattern = 'yyyy.MM.dd'): string {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  return format(d, pattern, { locale: ko });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  return formatDate(date, 'yyyy.MM.dd HH:mm');
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  return formatDistanceToNow(d, { addSuffix: true, locale: ko });
}

export function formatDateShort(date: string | Date | null | undefined): string {
  return formatDate(date, 'MM.dd HH:mm');
}

export function formatFullDateTime(date: string | Date | null | undefined): string {
  return formatDate(date, 'yyyy.MM.dd HH:mm:ss');
}

export function toISOString(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  return d.toISOString();
}

export function formatRelativeDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return formatDate(d, 'yyyy.MM.dd');
}
