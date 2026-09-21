import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { userService } from '../services/user.service';
import { authService } from '../services/auth.service';
import { passwordResetRequestService } from '../services/passwordResetRequest.service';
import { logSecurityEvent } from '../services/securityLog.service';
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
import { AppError } from '../middlewares/error.middleware';
import { getSettings, getMinPasswordLength } from '../utils/settingsCache';
import { isCookieSecure } from '../utils/cookie';

/** Access/Refresh 쿠키를 한 번에 설정 */
const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken?: string | null },
  oldRefreshToken?: string
) => {
  // 프로덕션은 secure 가 기본이다. HTTP 인트라넷은 COOKIE_SECURE=false 로 끈다.
  const isSecure = isCookieSecure();
  const { jwtRefreshTokenDays } = getSettings();
  // 쿠키 수명은 access 토큰보다 길게 잡는다. 같으면 만료 즉시 401 이 되어 갱신을 못 탄다.
  res.cookie('access_token', tokens.accessToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: jwtRefreshTokenDays * 24 * 60 * 60 * 1000,
    path: '/',
    domain: undefined,
  });

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

    // rotate 뒤에는 옛 토큰으로 조회할 수 없어 먼저 확보한다.
    const priorMeta = await userSessionService.getSessionMeta(refresh_token);

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
    // 정상 갱신은 너무 잦아 기록하지 않고, 최초 IP/기기와 다를 때만 남긴다.
    if (priorMeta) {
      const curIp = req.ip ?? null;
      const curUa = req.get('user-agent') ?? null;
      const ipChanged = !!priorMeta.ipAddress && !!curIp && priorMeta.ipAddress !== curIp;
      const uaChanged = !!priorMeta.userAgent && !!curUa && priorMeta.userAgent !== curUa;
      if (ipChanged || uaChanged) {
        logSecurityEvent(req, 'TOKEN_REFRESH_SUSPICIOUS', {
          userId: result.user.id,
          status: 'WARNING',
          details: {
            reason: ipChanged && uaChanged ? 'IP·기기 변경' : ipChanged ? 'IP 변경' : '기기 변경',
            knownIp: priorMeta.ipAddress,
            currentIp: curIp,
            knownUserAgent: priorMeta.userAgent?.slice(0, 160),
            currentUserAgent: curUa?.slice(0, 160),
          },
        });
      }
    }

    logSuccess('토큰 갱신 성공', { userName: result.user.name });
  } catch (err: unknown) {
    logError('토큰 갱신 실패', err);
    next(err);
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    // tokenVersion 을 올려 기존 JWT 를 무효화한다.
    if (authReq.user) {
      try {
        const { User } = await import('../models/User');
        const user = await User.findByPk(authReq.user.id);
        if (user) {
          await user.increment('tokenVersion');
          // 인증 캐시를 비우지 않으면 30초 동안 옛 토큰이 살아 있다.
          invalidateUserCache(authReq.user.id);
        }
      } catch (tokenErr) {
        logError('tokenVersion 증가 실패', tokenErr);
        // 실패해도 쿠키 삭제는 계속 진행한다.
      }
    }

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
    logSecurityEvent(req, 'LOGOUT', { userId: authReq.user?.id ?? null });
    logSuccess('로그아웃 성공');
    res.status(204).send();
  } catch (err) {
    logError('로그아웃 오류', err);
    sendError(res, 500, '로그아웃 처리 중 오류가 발생했습니다.');
  }
};

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

    const siteSettings = await SiteSettings.findOne();
    const allowRegistration = siteSettings?.allowRegistration ?? true;
    const requireApproval = siteSettings?.requireApproval ?? false;

    if (!allowRegistration) {
      sendForbidden(res, '현재 회원가입이 비활성화되어 있습니다. 관리자에게 문의하세요.');
      return;
    }

    const user = await authService.register({ id, password, name, email });

    // isApproved 로 '승인 대기' 와 '관리자 비활성화' 를 구분한다. 둘 다 isActive=false 다.
    if (!requireApproval) {
      await user.update({ isActive: true, isApproved: true });
    } else {
      await user.update({ isApproved: false });
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
    // 도난된 세션을 끊기 위해 기존 세션을 모두 무효화한다.
    userSessionService.expireAllUserSessions(authReq.user.id).catch(() => {});
    logSecurityEvent(req, 'PASSWORD_CHANGED', { userId: authReq.user.id });
    sendSuccess(res, null, '비밀번호가 변경되었습니다.');
  } catch (err: unknown) {
    logError('비밀번호 변경 오류', err);
    next(err);
  }
};

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

// 비밀번호 초기화 요청. 생성된 인증번호는 응답에 절대 넣지 않는다.
export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { loginId } = req.body as { loginId?: unknown };

    if (!loginId || typeof loginId !== 'string') {
      sendValidationError(res, 'loginId', '아이디를 입력해주세요.');
      return;
    }

    await passwordResetRequestService.createRequest(loginId.trim());
    logSecurityEvent(req, 'PASSWORD_RESET_REQUEST', {
      userId: null,
      details: { loginId: loginId.trim() },
    });

    // 아이디 열거를 막기 위해 계정 존재 여부와 무관하게 같은 응답을 준다.
    sendSuccess(
      res,
      null,
      '초기화 요청이 접수되었습니다. 관리자에게 인증번호를 확인한 뒤 입력해주세요. (등록되지 않은 아이디도 동일하게 표시됩니다.)'
    );
  } catch (err) {
    logError('비밀번호 초기화 요청 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 비밀번호 재설정. 3회 오입력 시 1시간 잠금은 서비스가 처리한다.
export const verifyPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { loginId, code, password } = req.body as {
      loginId?: string;
      code?: string;
      password?: string;
    };

    if (!loginId || !code || !password) {
      sendValidationError(res, 'code', '아이디·인증번호·새 비밀번호를 모두 입력해주세요.');
      return;
    }

    // 복잡도를 먼저 본다. 아니면 잘못된 비밀번호로 오입력 횟수를 깎는다.
    const pwCheck = AuthValidator.validatePassword(password, true);
    if (!pwCheck.valid) {
      sendValidationError(res, 'password', pwCheck.error!);
      return;
    }

    const uid = loginId.trim();
    await passwordResetRequestService.verifyAndReset(uid, code.trim(), password);

    invalidateUserCache(uid);
    userSessionService.expireAllUserSessions(uid).catch(() => {});
    logSecurityEvent(req, 'PASSWORD_RESET_COMPLETED', { userId: uid });
    sendSuccess(res, null, '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
  } catch (err) {
    // 서비스가 던지는 AppError 를 그대로 전달한다.
    if (err instanceof AppError && err.statusCode < 500) {
      sendError(res, err.statusCode, err.message);
      return;
    }
    logError('비밀번호 재설정 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

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
    // 캐시를 비우지 않으면 30초 동안 새 글의 author 가 옛 이름으로 저장된다.
    invalidateUserCache(authReq.user.id);
    sendSuccess(res, { name: user.name }, '이름이 변경되었습니다.');
  } catch (err: unknown) {
    logError('프로필 변경 오류', err);
    next(err);
  }
};

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
