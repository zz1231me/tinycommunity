// server/src/types/auth-request.ts - 강화된 타입 정의
import { Request } from 'express';
import { ParamsFlatDictionary } from 'express-serve-static-core';
import { BoardInstance } from '../models/Board';

// Express 5: ParamsDictionary allows string|string[], but URL params are always
// single strings. Use ParamsFlatDictionary to enforce string-only params.
export type FlatRequest = Request<ParamsFlatDictionary>;

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: string;
  email?: string;
}

export interface AuthRequest extends Request<ParamsFlatDictionary> {
  user: AuthenticatedUser;
  board?: {
    id: string;
    name: string;
    isPersonal: boolean;
    permissions: {
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    };
    /** 관리자·매니저·이 게시판 담당자인지 (권한 미들웨어가 이미 판정해 실어 준다) */
    canManage: boolean;
  };
}

export interface AccessibleBoard {
  id: string;
  name: string;
  description: string | null;
  order: number;
  isPersonal: boolean;
  /** 업무용 게시판 — 담당자·업무 상태를 쓴다 */
  taskEnabled: boolean;
  ownerId?: string;
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  };
}

export interface PersonalFolderResult {
  board: BoardInstance;
  created: boolean;
}
