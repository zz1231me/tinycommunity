export type MemoColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export type Memo = {
  id: number;
  UserId: string;
  title: string;
  content: string;
  color: MemoColor;
  isPinned: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
};
