// src/types/express/index.d.ts
// Express Request 타입 확장 (통합)

import { AuthenticatedUser } from '../auth-request';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      board?: {
        id: string;
        name: string;
        isPersonal: boolean;
        permissions: {
          canRead: boolean;
          canWrite: boolean;
          canDelete: boolean;
        };
      };
    }
  }
}

export {}; // 모듈로 인식
