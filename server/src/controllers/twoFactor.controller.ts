// server/src/controllers/twoFactor.controller.ts - 2FA 인증 컨트롤러
import { Request, Response } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { AuthRequest } from '../types/auth-request';
import { authService } from '../services/auth.service';
import { securityLogService } from '../services/securityLog.service';
import { loginHistoryService } from '../services/loginHistory.service';
import { userSessionService } from '../services/userSession.service';
import { notificationService } from '../services/notification.service';
import { getSettings } from '../utils/settingsCache';
import { isCookieSecure } from '../utils/cookie';
import { encryptSecret, decryptSecret } from '../utils/secretCrypto';
import { logError, logSuccess, logWarning } from '../utils/logger';
import {
  sendSuccess,
  sendError,
  sendUnauthorized,
  sendNotFound,
  sendValidationError,
} from '../utils/response';

/**
 * ✅ 2FA 비밀키 생성 및 QR 코드 반환
 */
export const generate2FASecret = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendUnauthorized(res, '인증이 필요합니다.');
      return;
    }

    const { currentPassword } = req.body as { currentPassword?: string };
    if (!currentPassword) {
      sendValidationError(res, 'currentPassword', '현재 비밀번호를 입력해주세요.');
      return;
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      sendNotFound(res, '사용자');
      return;
    }

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      sendValidationError(res, 'currentPassword', '현재 비밀번호가 올바르지 않습니다.');
      return;
    }

    if (user.twoFactorEnabled) {
      sendValidationError(res, 'twoFactor', '2FA가 이미 활성화되어 있습니다.');
      return;
    }

    const secret = speakeasy.generateSecret({
      name: `TinyCommunity:${user.email || user.id}`,
      length: 20,
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

    // at-rest 암호화 후 저장 (QR/응답에는 평문 base32를 전달 — 등록 화면에서 1회성으로 필요)
    user.twoFactorSecret = encryptSecret(secret.base32);
    await user.save();

    sendSuccess(res, {
      secret: secret.base32,
      qrCode: qrCodeUrl,
    });
  } catch (error) {
    logError('2FA 비밀키 생성 실패', error);
    sendError(res, 500, '2FA 설정 생성에 실패했습니다.');
  }
};

/**
 * ✅ 2FA 활성화 (코드 검증 후)
 */
export const enable2FA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!req.user) {
      sendUnauthorized(res, '인증이 필요합니다.');
      return;
    }

    if (!token) {
      sendValidationError(res, 'token', '인증 코드를 입력해주세요.');
      return;
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      sendNotFound(res, '사용자');
      return;
    }

    if (!user.twoFactorSecret) {
      sendValidationError(res, 'twoFactor', '먼저 2FA 설정을 생성해주세요.');
      return;
    }

    const verified = speakeasy.totp.verify({
      secret: decryptSecret(user.twoFactorSecret),
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) {
      sendValidationError(res, 'token', '잘못된 인증 코드입니다.');
      return;
    }

    user.twoFactorEnabled = true;
    await user.save();

    sendSuccess(res, null, '2FA가 활성화되었습니다.');
  } catch (error) {
    logError('2FA 활성화 실패', error);
    sendError(res, 500, '2FA 활성화에 실패했습니다.');
  }
};

/**
 * ✅ 2FA 비활성화
 */
export const disable2FA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token, currentPassword } = req.body as { token?: string; currentPassword?: string };

    if (!req.user) {
      sendUnauthorized(res, '인증이 필요합니다.');
      return;
    }

    if (!token) {
      sendValidationError(res, 'token', '인증 코드를 입력해주세요.');
      return;
    }

    if (!currentPassword) {
      sendValidationError(res, 'currentPassword', '현재 비밀번호를 입력해주세요.');
      return;
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      sendNotFound(res, '사용자');
      return;
    }

    if (!user.twoFactorEnabled) {
      sendValidationError(res, 'twoFactor', '2FA가 활성화되어 있지 않습니다.');
      return;
    }

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      sendValidationError(res, 'currentPassword', '현재 비밀번호가 올바르지 않습니다.');
      return;
    }

    const verified = speakeasy.totp.verify({
      secret: decryptSecret(user.twoFactorSecret!),
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) {
      sendValidationError(res, 'token', '잘못된 인증 코드입니다.');
      return;
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await user.save();

    sendSuccess(res, null, '2FA가 비활성화되었습니다.');
  } catch (error) {
    logError('2FA 비활성화 실패', error);
    sendError(res, 500, '2FA 비활성화에 실패했습니다.');
  }
};

/**
 * ✅ 2FA 로그인 검증 (토큰 발행)
 * 클라이언트가 data.user / data.tokenInfo 를 직접 참조하므로 구조 유지
 */
export const verify2FALogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tempToken, token } = req.body;
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') ?? null;

    if (!tempToken || !token) {
      sendValidationError(res, 'token', '필수 항목이 누락되었습니다.');
      return;
    }

    let decoded: { id: string; type: string; tv?: number };
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET!, {
        algorithms: ['HS256'],
      }) as { id: string; type: string; tv?: number };
      if (decoded.type !== '2fa_pending') {
        sendUnauthorized(res, '유효하지 않은 토큰입니다.');
        return;
      }
    } catch (_err) {
      sendUnauthorized(res, '임시 토큰이 만료되었습니다. 다시 로그인해주세요.');
      return;
    }

    const user = await User.findByPk(decoded.id, {
      include: [
        {
          model: Role,
          as: 'roleInfo',
          attributes: ['id', 'name', 'description', 'isActive'],
        },
      ],
    });

    if (!user) {
      sendNotFound(res, '사용자');
      return;
    }

    // 소프트 삭제된 계정 차단 (paranoid 모드에서 findByPk가 반환할 수도 있는 엣지 케이스)
    if (user.isDeletedAccount()) {
      sendNotFound(res, '사용자');
      return;
    }

    // tempToken 발급 후 비밀번호 변경/로그아웃이 발생했다면 tv 불일치 → 거부
    const dbTv = user.tokenVersion ?? 0;
    const tvMismatch = decoded.tv === undefined ? dbTv > 0 : decoded.tv !== dbTv;
    if (tvMismatch) {
      sendUnauthorized(res, '세션이 만료되었습니다. 다시 로그인해주세요.');
      return;
    }

    // 일반 로그인과 동일하게 계정/역할 상태 검증 (비활성화된 계정의 2FA 우회 방지)
    if (!user.isActive) {
      sendError(res, 403, '비활성화된 계정입니다. 관리자에게 문의하세요.');
      return;
    }
    if (!user.roleInfo?.isActive) {
      sendError(res, 403, '비활성화된 역할입니다. 관리자에게 문의하세요.');
      return;
    }

    // 계정 잠금 확인 (login()과 동일한 검증 순서)
    if (user.isLocked()) {
      sendError(res, 403, '계정이 일시적으로 잠겨있습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    if (!user.twoFactorEnabled) {
      sendValidationError(res, 'twoFactor', '2FA가 활성화되어 있지 않습니다.');
      return;
    }

    const verified = speakeasy.totp.verify({
      secret: decryptSecret(user.twoFactorSecret!),
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) {
      // ✅ 2FA 실패도 계정 잠금에 반영 (brute force 방지)
      try {
        await user.incrementFailedAttempts();
      } catch (err) {
        logWarning('2FA 실패 카운터 증가 실패', { userId: user.id, err });
      }

      // TOTP 실패도 감사 로그/로그인 이력에 기록 (login() 실패와 동일하게 처리)
      securityLogService
        .createLog({
          userId: user.id,
          ipAddress,
          action: 'LOGIN_FAILED',
          method: 'POST',
          route: '/api/auth/2fa/verify-login',
          status: 'FAILED',
          details: { reason: '2FA 코드 불일치' },
        })
        .catch(err => logError('2FA 실패 보안 로그 기록 오류', err));
      loginHistoryService
        .createLoginRecord({
          userId: user.id,
          userName: user.name,
          userRole: user.roleId,
          ipAddress,
          userAgent,
          status: 'failed',
          failureReason: '2FA 코드 불일치',
        })
        .catch(err => logError('2FA 실패 로그인 이력 기록 오류', err));

      // 잠금 발생 시 사용자에게 알림
      if (user.isLocked()) {
        notificationService
          .create({
            userId: user.id,
            type: 'SYSTEM',
            message: `🔒 2FA 인증 실패 횟수 초과로 계정이 일시 잠겼습니다. 본인이 아닌 경우 비밀번호를 변경하세요.`,
            link: '/profile',
          })
          .catch(err => logError('2FA 잠금 알림 실패', err));
      }

      sendValidationError(res, 'token', '잘못된 인증 코드입니다.');
      return;
    }

    // ✅ 2FA 검증 성공 — 이제 실패 카운터/lastLoginIp 갱신
    const previousLoginIp = user.lastLoginIp ?? null;
    try {
      await user.resetFailedAttempts(ipAddress);
    } catch (err) {
      logWarning('2FA 성공 후 실패 카운터 리셋 실패', { userId: user.id, err });
    }

    // 새 IP 로그인 감지
    if (previousLoginIp !== null && previousLoginIp !== ipAddress) {
      notificationService
        .create({
          userId: user.id,
          type: 'SYSTEM',
          message: `🔔 새로운 IP(${ipAddress})에서 로그인이 감지되었습니다. 본인이 아닌 경우 즉시 비밀번호를 변경하세요.`,
          link: '/profile',
        })
        .catch(err => logError('새 IP 로그인 알림 실패 (2FA)', err));
    }

    // ✅ 로그인 완료 - authService로 payload 생성
    const payload = await authService.generateUserPayload(user);

    const { jwtAccessTokenHours, jwtRefreshTokenDays } = getSettings();

    const accessToken = jwt.sign(
      { ...payload, roleId: user.roleId, tv: user.tokenVersion ?? 0 },
      process.env.JWT_SECRET!,
      { expiresIn: `${jwtAccessTokenHours}h`, algorithm: 'HS256' }
    );

    const refreshToken = jwt.sign(
      { id: user.id, tokenType: 'refresh', tv: user.tokenVersion ?? 0 },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: `${jwtRefreshTokenDays}d`, algorithm: 'HS256' }
    );

    // auth.controller와 동일한 secure-by-default 로직 사용 (isCookieSecure)
    const cookieOptions = {
      httpOnly: true,
      secure: isCookieSecure(),
      sameSite: 'lax' as const,
      path: '/',
    };
    res.cookie('access_token', accessToken, {
      ...cookieOptions,
      maxAge: jwtAccessTokenHours * 60 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: jwtRefreshTokenDays * 24 * 60 * 60 * 1000,
    });

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          name: user.name,
          role: user.roleId,
          theme: user.theme,
          avatar: user.avatar,
          roleInfo: user.roleInfo,
          permissions: payload.permissions,
          createdAt: user.createdAt,
          // 강제 비밀번호 변경 플래그를 일반 로그인(buildAuthData)과 동일하게 포함.
          // 누락 시 2FA 사용자는 강제변경 화면으로 못 가고 서버 게이트에 막혀 소프트 락아웃됨.
          mustChangePassword: user.mustChangePassword ?? false,
        },
        tokenInfo: {
          accessTokenExpiry: Date.now() + jwtAccessTokenHours * 60 * 60 * 1000,
          refreshTokenExpiry: Date.now() + jwtRefreshTokenDays * 24 * 60 * 60 * 1000,
        },
      },
      '로그인 성공'
    );

    // H1: 2FA 경로 로그인 완료 후 감사 로그/세션 기록 (fire-and-forget)
    logSuccess('2FA 로그인 성공', { userName: user.name });
    securityLogService
      .createLog({
        userId: user.id,
        ipAddress,
        action: 'LOGIN_SUCCESS',
        method: 'POST',
        route: '/api/auth/2fa/verify-login',
        status: 'SUCCESS',
        details: { method: '2fa' },
      })
      .catch(err => logError('2FA 로그인 보안 로그 실패', err));
    loginHistoryService
      .createLoginRecord({
        userId: user.id,
        userName: user.name,
        userRole: user.roleId,
        ipAddress,
        userAgent,
        status: 'success',
      })
      .catch(err => logError('2FA 로그인 이력 기록 실패', err));
    userSessionService
      .createSession({
        userId: user.id,
        rawToken: refreshToken,
        ipAddress,
        userAgent,
      })
      .catch(err => logError('2FA 세션 생성 실패', err));
  } catch (error) {
    logError('2FA 로그인 검증 실패', error);
    sendError(res, 500, '2FA 검증에 실패했습니다.');
  }
};

/**
 * ✅ 2FA 상태 조회
 */
export const get2FAStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendUnauthorized(res, '인증이 필요합니다.');
      return;
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      sendNotFound(res, '사용자');
      return;
    }

    sendSuccess(res, {
      enabled: user.twoFactorEnabled || false,
    });
  } catch (error) {
    logError('2FA 상태 조회 실패', error);
    sendError(res, 500, '2FA 상태 조회에 실패했습니다.');
  }
};
