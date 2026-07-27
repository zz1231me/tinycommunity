// src/controllers/auth.controller.ts - Service Layer 적용 완료 (AuthService + UserService)
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { userService } from '../services/user.service';
import { authService } from '../services/auth.service';
import { passwordResetRequestService } from '../services/passwordResetRequest.service';
import { logInfo, logSuccess, logError } from '../utils/logger';
import { AuthValidator } from '../validators/auth.validator';
import {
  sendSuccess,
  sendError,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendValidationError,
} from '../utils/response';
import { SiteSettings } from '../models';
import { invalidateUserCache } from '../middlewares/auth.middleware';
import { userSessionService } from '../services/userSession.service';
import { getSettings, getMinPasswordLength } from '../utils/settingsCache';
import { isCookieSecure } from '../utils/cookie';

// ────────────────────────────────────────────────────────────────
// 내부 유틸: 쿠키 설정 / 응답 데이터 빌드
// ────────────────────────────────────────────────────────────────

/** Access/Refresh 쿠키를 한 번에 설정 */
const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken?: string | null },
  oldRefreshToken?: string
) => {
  // 프로덕션 secure-by-default (HTTP 인트라넷은 COOKIE_SECURE=false 명시) — isCookieSecure() 참고
  const isSecure = isCookieSecure();
  const { jwtAccessTokenHours, jwtRefreshTokenDays } = getSettings();
  res.cookie('access_token', tokens.accessToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: jwtAccessTokenHours * 60 * 60 * 1000,
    path: '/',
    domain: undefined,
  });

  // Refresh 토큰이 갱신된 경우에만 쿠키 업데이트
  if (tokens.refreshToken && tokens.refreshToken !== oldRefreshToken) {
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: jwtRefreshTokenDays * 24 * 60 * 60 * 1000,
      path: '/',
      domain: undefined,
    });
  }
};

/** 인증 응답에 포함할 공통 user + tokenInfo 객체 빌드 */
const buildAuthData = (
  user: {
    id: string;
    name: string;
    roleId: string;
    theme?: string;
    avatar?: string | null;
    roleInfo?: object | null;
    createdAt?: Date | string;
    mustChangePassword?: boolean;
  },
  permissions: object | null
) => {
  const { jwtAccessTokenHours, jwtRefreshTokenDays } = getSettings();
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.roleId,
      theme: user.theme,
      avatar: user.avatar,
      roleInfo: user.roleInfo || null,
      permissions,
      createdAt: user.createdAt,
      mustChangePassword: user.mustChangePassword ?? false,
    },
    tokenInfo: {
      accessTokenExpiry: new Date(Date.now() + jwtAccessTokenHours * 60 * 60 * 1000).getTime(),
      refreshTokenExpiry: new Date(
        Date.now() + jwtRefreshTokenDays * 24 * 60 * 60 * 1000
      ).getTime(),
    },
  };
};

// 로그인
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, password, fingerprint } = req.body;
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') ?? null;

    const result = await authService.login(
      id,
      password,
      ipAddress,
      typeof fingerprint === 'string' ? fingerprint : undefined,
      userAgent
    );

    // ✅ 2FA 활성화된 사용자: 2단계 인증 필요
    if (result.requires2FA) {
      sendSuccess(
        res,
        {
          requires2FA: true,
          tempToken: result.tempToken,
          userId: result.user.id,
        },
        '2단계 인증이 필요합니다.'
      );
      logInfo('2단계 인증 필요', { userName: result.user.name });
      return;
    }

    setAuthCookies(res, { accessToken: result.accessToken, refreshToken: result.refreshToken });
    sendSuccess(
      res,
      buildAuthData(result.user, result.payload?.permissions || null),
      '로그인 성공'
    );
    logSuccess('로그인 성공', { userName: result.user.name });
  } catch (err: unknown) {
    logError('로그인 오류', err);
    next(err);
  }
};

// 토큰 갱신
export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refresh_token } = req.cookies;

    if (!refresh_token) {
      sendUnauthorized(res, '리프레시 토큰이 없습니다.');
      return;
    }

    const result = await authService.refreshToken(refresh_token);

    setAuthCookies(
      res,
      { accessToken: result.accessToken, refreshToken: result.refreshToken },
      refresh_token
    );
    sendSuccess(
      res,
      buildAuthData(result.user, result.payload?.permissions ?? []),
      '토큰 갱신 성공'
    );
    logSuccess('토큰 갱신 성공', { userName: result.user.name });
  } catch (err: unknown) {
    logError('토큰 갱신 실패', err);
    next(err);
  }
};

// 로그아웃
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    // 로그인된 사용자라면 tokenVersion을 증가시켜 기존 JWT 토큰을 무효화
    if (authReq.user) {
      try {
        const { User } = await import('../models/User');
        const user = await User.findByPk(authReq.user.id);
        if (user) {
          await user.increment('tokenVersion');
          // ✅ 인증 캐시 즉시 무효화 — 로그아웃 후 30초 이내 재사용 방지
          invalidateUserCache(authReq.user.id);
        }
      } catch (tokenErr) {
        logError('tokenVersion 증가 실패', tokenErr);
        // 토큰 버전 증가 실패해도 쿠키 삭제는 계속 진행
      }
    }

    // 세션 만료 처리 (fire-and-forget) — 로그아웃 시 해당 사용자의 모든 세션 만료
    if (authReq.user) {
      userSessionService.expireAllUserSessions(authReq.user.id).catch(() => {});
    } else {
      const refreshToken = req.cookies?.refresh_token as string | undefined;
      if (refreshToken) {
        userSessionService.expireSession(refreshToken).catch(() => {});
      }
    }

    const cookieClearOptions = {
      path: '/',
      httpOnly: true,
      secure: isCookieSecure(),
      sameSite: 'lax' as const,
    };
    res.clearCookie('access_token', cookieClearOptions);
    res.clearCookie('refresh_token', cookieClearOptions);
    logSuccess('로그아웃 성공');
    res.status(204).send();
  } catch (err) {
    logError('로그아웃 오류', err);
    sendError(res, 500, '로그아웃 처리 중 오류가 발생했습니다.');
  }
};

// 현재 사용자 정보 조회
export const getCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      sendUnauthorized(res, '인증 정보가 없습니다.');
      return;
    }

    const user = await userService.findById(authReq.user.id);
    if (!user) {
      sendNotFound(res, '사용자');
      return;
    }

    const permissions = await authService.getUserPermissions(user.id, user.roleId);
    sendSuccess(res, buildAuthData(user, permissions));
  } catch (err) {
    logError('사용자 정보 조회 오류', err);
    next(err);
  }
};

// 회원 등록
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, password, name, email } = req.body;

    const idCheck = AuthValidator.validateUserId(id);
    if (!idCheck.valid) {
      sendValidationError(res, 'id', idCheck.error!);
      return;
    }
    const minPwLen = getMinPasswordLength();
    if (typeof password !== 'string' || password.length < minPwLen) {
      sendValidationError(res, 'password', `비밀번호는 ${minPwLen}자 이상이어야 합니다.`);
      return;
    }
    const pwCheck = AuthValidator.validatePassword(password, true); // requireComplexity = true
    if (!pwCheck.valid) {
      sendValidationError(res, 'password', pwCheck.error!);
      return;
    }
    const nameCheck = AuthValidator.validateName(name);
    if (!nameCheck.valid) {
      sendValidationError(res, 'name', nameCheck.error!);
      return;
    }
    if (email) {
      const emailCheck = AuthValidator.validateEmail(email);
      if (!emailCheck.valid) {
        sendValidationError(res, 'email', emailCheck.error!);
        return;
      }
    }

    // 사이트 설정에서 회원가입 허용 여부 확인
    const siteSettings = await SiteSettings.findOne();
    const allowRegistration = siteSettings?.allowRegistration ?? true;
    const requireApproval = siteSettings?.requireApproval ?? false;

    if (!allowRegistration) {
      sendForbidden(res, '현재 회원가입이 비활성화되어 있습니다. 관리자에게 문의하세요.');
      return;
    }

    const user = await authService.register({ id, password, name, email });

    // requireApproval이 꺼져 있으면 즉시 활성화 (자동 승인)
    if (!requireApproval) {
      await user.update({ isActive: true });
    }

    const message = requireApproval
      ? '회원가입이 완료되었습니다. 관리자 승인 후 로그인이 가능합니다.'
      : '회원가입이 완료되었습니다. 바로 로그인하세요.';

    sendSuccess(
      res,
      {
        userId: user.id,
        status: requireApproval ? 'pending_approval' : 'active',
        role: 'guest',
      },
      message,
      201
    );

    logInfo(requireApproval ? '신규 회원가입 - 승인 대기' : '신규 회원가입 - 자동 승인', {
      userName: user.name,
      userId: user.id,
    });
  } catch (err) {
    logError('회원가입 오류', err);
    next(err);
  }
};

// 비밀번호 변경
export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      sendUnauthorized(res, '인증 정보가 없습니다.');
      return;
    }

    if (!currentPassword || !newPassword) {
      sendValidationError(res, 'password', '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.');
      return;
    }

    const pwCheck = AuthValidator.validatePassword(newPassword, true); // requireComplexity = true
    if (!pwCheck.valid) {
      sendValidationError(res, 'newPassword', pwCheck.error!);
      return;
    }

    await userService.changePassword(authReq.user.id, currentPassword, newPassword);
    invalidateUserCache(authReq.user.id);
    // 비밀번호 변경 시 모든 기존 세션 즉시 무효화 (도난된 세션 차단)
    userSessionService.expireAllUserSessions(authReq.user.id).catch(() => {});
    sendSuccess(res, null, '비밀번호가 변경되었습니다.');
  } catch (err: unknown) {
    logError('비밀번호 변경 오류', err);
    next(err);
  }
};

// 사용자 권한 조회
export const getUserPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userRole = authReq.user?.role;
    const userId = authReq.user?.id;

    if (!userRole || !userId) {
      sendUnauthorized(res, '로그인이 필요합니다.');
      return;
    }

    const permissions = await authService.getUserPermissions(userId, userRole);
    sendSuccess(res, permissions);
  } catch (error) {
    logError('사용자 권한 조회 실패', error);
    next(error);
  }
};

// 테마 업데이트
export const updateTheme = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { theme } = req.body;

    if (!authReq.user) {
      sendUnauthorized(res, '인증 정보가 없습니다.');
      return;
    }

    const updatedTheme = await userService.updateTheme(authReq.user.id, theme);
    sendSuccess(res, { theme: updatedTheme }, '테마가 업데이트되었습니다.');
  } catch (err: unknown) {
    logError('테마 업데이트 오류', err);
    next(err);
  }
};

// 📸 아바타 업로드
export const uploadAvatar = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      sendUnauthorized(res, '인증 정보가 없습니다.');
      return;
    }

    if (!req.file) {
      sendError(res, 400, '업로드할 파일이 없습니다.');
      return;
    }

    const avatarUrl = await userService.updateAvatar(authReq.user.id, req.file.buffer);
    sendSuccess(res, { avatarUrl }, '아바타가 성공적으로 업로드되었습니다.');
  } catch (error: unknown) {
    logError('아바타 업로드 실패', error);
    next(error);
  }
};

// 비밀번호 초기화 요청 (비로그인) — 아이디로 요청을 남기면 관리자가 승인 후 재설정 링크를 발급한다.
export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { loginId } = req.body as { loginId?: unknown };

    if (!loginId || typeof loginId !== 'string') {
      sendValidationError(res, 'loginId', '아이디를 입력해주세요.');
      return;
    }

    await passwordResetRequestService.createRequest(loginId.trim());

    // 계정 존재 여부와 무관하게 동일한 응답 (아이디 열거 방지)
    sendSuccess(
      res,
      null,
      '비밀번호 초기화 요청이 접수되었습니다. 관리자 승인 후 안내됩니다. (등록되지 않은 아이디도 동일하게 표시됩니다.)'
    );
  } catch (err) {
    logError('비밀번호 초기화 요청 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 비밀번호 재설정 (토큰 검증 후 변경)
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      sendValidationError(res, 'token', '토큰과 새 비밀번호를 입력해주세요.');
      return;
    }

    const pwCheck = AuthValidator.validatePassword(password, true);
    if (!pwCheck.valid) {
      sendValidationError(res, 'password', pwCheck.error!);
      return;
    }

    const resetUserId = await authService.resetPassword(token, password);

    if (!resetUserId) {
      sendError(res, 400, '유효하지 않거나 만료된 재설정 링크입니다.');
      return;
    }

    // ✅ 캐시 즉시 무효화 (tokenVersion 증가 후 30초 내 재사용 방지)
    invalidateUserCache(resetUserId);
    // 비밀번호 재설정 시 모든 기존 세션 무효화 (탈취된 계정 보호)
    userSessionService.expireAllUserSessions(resetUserId).catch(() => {});
    sendSuccess(res, null, '비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요.');
  } catch (err) {
    logError('비밀번호 재설정 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 프로필(이름) 변경
export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      sendUnauthorized(res, '인증 정보가 없습니다.');
      return;
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      sendValidationError(res, 'name', '이름을 입력해주세요.');
      return;
    }

    const nameCheck = AuthValidator.validateName(name);
    if (!nameCheck.valid) {
      sendValidationError(res, 'name', nameCheck.error!);
      return;
    }

    const user = await userService.updateMyName(authReq.user.id, name);
    // ✅ 인증 캐시 무효화 — 이름 변경 후 30초 이내 새 글/댓글의 author가 이전 이름으로 저장되는 문제 방지
    invalidateUserCache(authReq.user.id);
    sendSuccess(res, { name: user.name }, '이름이 변경되었습니다.');
  } catch (err: unknown) {
    logError('프로필 변경 오류', err);
    next(err);
  }
};

// 🗑️ 아바타 삭제
export const deleteAvatar = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      sendUnauthorized(res, '인증 정보가 없습니다.');
      return;
    }

    await userService.deleteAvatar(authReq.user.id);
    sendSuccess(res, null, '아바타가 성공적으로 삭제되었습니다.');
  } catch (error: unknown) {
    logError('아바타 삭제 실패', error);
    next(error);
  }
};
