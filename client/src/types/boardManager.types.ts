export interface BoardManagerUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
}

export interface BoardManagerRecord {
  id: string;
  boardId: string;
  userId: string;
  createdAt: string;
  user?: BoardManagerUser;
}

export interface BoardWithManagers {
  id: string;
  name: string;
  description?: string;
  boardManagers: BoardManagerRecord[];
}
