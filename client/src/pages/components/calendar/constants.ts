// client/src/pages/components/calendar/constants.ts
import { Category, CategoryColor } from './types';

// 디자인 시스템 정합 팔레트 — 보라 제거, 연차는 danger-red와 구분되는 rose, 회의는 브랜드 indigo, 회식은 teal 액센트
export const categoryColors: Record<string, CategoryColor> = {
  annual: { bg: '#fb7185', border: '#f43f5e', label: '연차', textColor: '#ffffff' },
  morning_half: { bg: '#fbbf24', border: '#f59e0b', label: '오전반차', textColor: '#451a03' },
  afternoon_half: { bg: '#fb923c', border: '#ea580c', label: '오후반차', textColor: '#7c2d12' },
  meeting: { bg: '#6366f1', border: '#4f46e5', label: '회의', textColor: '#ffffff' },
  dinner: { bg: '#2dd4bf', border: '#14b8a6', label: '회식', textColor: '#134e4a' },
  etc: { bg: '#94a3b8', border: '#64748b', label: '기타', textColor: '#ffffff' },
};

export const categories: Category[] = [
  {
    key: 'annual',
    emoji: '🏖️',
    label: '연차',
    bg: '#fb7185',
    border: '#f43f5e',
    textColor: '#ffffff',
  },
  {
    key: 'morning_half',
    emoji: '🌅',
    label: '오전반차',
    bg: '#fbbf24',
    border: '#f59e0b',
    textColor: '#451a03',
  },
  {
    key: 'afternoon_half',
    emoji: '🌆',
    label: '오후반차',
    bg: '#fb923c',
    border: '#ea580c',
    textColor: '#7c2d12',
  },
  {
    key: 'meeting',
    emoji: '💼',
    label: '회의',
    bg: '#6366f1',
    border: '#4f46e5',
    textColor: '#ffffff',
  },
  {
    key: 'dinner',
    emoji: '🍻',
    label: '회식',
    bg: '#2dd4bf',
    border: '#14b8a6',
    textColor: '#134e4a',
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
