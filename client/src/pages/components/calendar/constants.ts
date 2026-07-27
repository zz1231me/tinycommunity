// client/src/pages/components/calendar/constants.ts
import { Category, CategoryColor } from './types';

export const categoryColors: Record<string, CategoryColor> = {
  annual: { bg: '#f87171', border: '#ef4444', label: '연차', textColor: '#ffffff' },
  morning_half: { bg: '#fb923c', border: '#f97316', label: '오전반차', textColor: '#431407' },
  afternoon_half: { bg: '#facc15', border: '#eab308', label: '오후반차', textColor: '#713f12' },
  meeting: { bg: '#60a5fa', border: '#3b82f6', label: '회의', textColor: '#ffffff' },
  dinner: { bg: '#a78bfa', border: '#8b5cf6', label: '회식', textColor: '#ffffff' },
  etc: { bg: '#94a3b8', border: '#64748b', label: '기타', textColor: '#ffffff' },
};

export const categories: Category[] = [
  {
    key: 'annual',
    emoji: '🏖️',
    label: '연차',
    bg: '#f87171',
    border: '#ef4444',
    textColor: '#ffffff',
  },
  {
    key: 'morning_half',
    emoji: '🌅',
    label: '오전반차',
    bg: '#fb923c',
    border: '#f97316',
    textColor: '#431407',
  },
  {
    key: 'afternoon_half',
    emoji: '🌆',
    label: '오후반차',
    bg: '#facc15',
    border: '#eab308',
    textColor: '#713f12',
  },
  {
    key: 'meeting',
    emoji: '💼',
    label: '회의',
    bg: '#60a5fa',
    border: '#3b82f6',
    textColor: '#ffffff',
  },
  {
    key: 'dinner',
    emoji: '🍻',
    label: '회식',
    bg: '#a78bfa',
    border: '#8b5cf6',
    textColor: '#ffffff',
  },
  {
    key: 'etc',
    emoji: '📝',
    label: '기타',
    bg: '#94a3b8',
    border: '#64748b',
    textColor: '#ffffff',
  },
];
