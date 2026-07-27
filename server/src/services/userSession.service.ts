import { BaseService } from './base.service';
import { UserSession } from '../models/UserSession';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { logError } from '../utils/logger';
import { getSettings } from '../utils/settingsCache';

const MAX_SESSIONS_PER_USER = 10;

// 세션 종료(종료/강제로그아웃)를 액세스 토큰에도 즉시 반영하기 위한 상태 캐시.
// 인증 미들웨어가 매 요청 isSessionRevoked()로 확인하므로 DB 부하를 줄이려 짧게 캐싱하고,
// 종료 시점에는 해당 항목을 즉시 무효화해 다음 요청에서 곧바로 차단되게 한다.
// TTL은 인증 미들웨어 userCache(30초)와 동일하게 맞춘다.
const SESSION_STATUS_TTL_MS = 30_000;

export class UserSessionService extends BaseService {
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // sessionToken(해시) → { revoked, at }. revoked=true면 종료된 세션.
  private statusCache = new Map<string, { revoked: boolean; at: number }>();

  /** 종료된 세션 캐시 항목을 즉시 제거(다음 요청에서 최신 상태 재조회). */
  private invalidateStatus(sessionToken: string): void {
    this.statusCache.delete(sessionToken);
  }

  /**
   * 이 refresh_token이 가리키는 DB 세션이 "종료됨" 상태인지 확인한다(인증 미들웨어용).
   * - 세션 행이 존재하고 isActive=false이거나 만료됨 → true(종료됨, 요청 거부)
   * - 세션 행이 없으면 false(미추적/로그인 직후 race → 액세스 토큰 자체 검증에 위임, 오탐 방지)
   * 결과는 짧게 캐싱하고, 종료 시점엔 invalidateStatus로 즉시 무효화한다.
   */
  async isSessionRevoked(rawToken: string): Promise<boolean> {
    const sessionToken = this.hashToken(rawToken);
    const cached = this.statusCache.get(sessionToken);
    if (cached && Date.now() - cached.at < SESSION_STATUS_TTL_MS) {
      return cached.revoked;
    }
    try {
      const session = await UserSession.findOne({
        where: { sessionToken },
        attributes: ['isActive', 'expiresAt'],
      });
      // 행이 없으면 종료로 보지 않음(로그인 직후 세션 생성 전 race, 미추적 세션 허용)
      const revoked = session !== null && (!session.isActive || session.expiresAt <= new Date());
      this.statusCache.set(sessionToken, { revoked, at: Date.now() });
      return revoked;
    } catch (error) {
      logError('세션 상태 확인 실패', error);
      // 조회 실패 시 보수적으로 차단하지 않음(액세스 토큰 자체 검증에 위임 — 가용성 우선)
      return false;
    }
  }

  /**
   * 세션 생성 (로그인 시 호출)
   */
  async createSession(data: {
    userId: string;
    rawToken: string;
    ipAddress: string;
    userAgent?: string | null;
  }): Promise<void> {
    try {
      const sessionToken = this.hashToken(data.rawToken);
      const expiresAt = new Date(
        Date.now() + getSettings().jwtRefreshTokenDays * 24 * 60 * 60 * 1000
      );

      // upsert: sessionToken unique 제약을 이용해 find+create를 원자적으로 처리
      await UserSession.upsert({
        userId: data.userId,
        sessionToken,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent?.substring(0, 500) ?? null,
        lastActiveAt: new Date(),
        expiresAt,
        isActive: true,
      });

      // 사용자당 최대 세션 수 초과 시 가장 오래된 세션 비활성화
      await this.enforceSessionLimit(data.userId);
    } catch (error) {
      logError('세션 생성 실패', error);
    }
  }

  /**
   * 사용자당 최대 세션 수 제한 (초과 시 가장 오래된 활성 세션 만료)
   */
  private async enforceSessionLimit(userId: string): Promise<void> {
    const activeSessions = await UserSession.findAll({
      where: { userId, isActive: true, expiresAt: { [Op.gt]: new Date() } },
      order: [['lastActiveAt', 'ASC']],
      attributes: ['id'],
    });

    if (activeSessions.length > MAX_SESSIONS_PER_USER) {
      const excess = activeSessions.slice(0, activeSessions.length - MAX_SESSIONS_PER_USER);
      const ids = excess.map(s => s.id);
      await UserSession.update({ isActive: false }, { where: { id: ids } });
    }
  }

  /**
   * 세션 활동 갱신 + 토큰 교체 (refreshToken 시 호출)
   * 구 토큰 해시 → 신 토큰 해시로 sessionToken 교체 & lastActiveAt 갱신
   * 세션이 없거나 이미 만료된 경우 조용히 무시 (fire-and-forget 용도)
   */
  async rotateSession(oldRawToken: string, newRawToken: string): Promise<void> {
    try {
      const oldHash = this.hashToken(oldRawToken);
      const newHash = this.hashToken(newRawToken);
      // expiresAt도 갱신 — DB 만료시각과 JWT 만료시각이 계속 동기화되도록
      const newExpiresAt = new Date(
        Date.now() + getSettings().jwtRefreshTokenDays * 24 * 60 * 60 * 1000
      );
      await UserSession.update(
        { sessionToken: newHash, lastActiveAt: new Date(), expiresAt: newExpiresAt },
        { where: { sessionToken: oldHash, isActive: true } }
      );
    } catch (error) {
      logError('세션 토큰 교체 실패', error);
    }
  }

  /**
   * DB 세션 유효성 검증 (refreshToken 호출 전 isActive 확인)
   * forceLogout된 세션은 false 반환 → 토큰 갱신 차단
   */
  async validateSession(rawToken: string): Promise<boolean> {
    try {
      const sessionToken = this.hashToken(rawToken);
      const session = await UserSession.findOne({
        where: { sessionToken, isActive: true, expiresAt: { [Op.gt]: new Date() } },
        attributes: ['id'],
      });
      return session !== null;
    } catch (error) {
      logError('세션 유효성 검증 실패', error);
      // 검증 실패 시 보수적으로 false 반환 — 강제 로그아웃된 세션이 DB 오류 시 통과하는 것을 방지
      return false;
    }
  }

  /**
   * 세션 만료 (로그아웃 시 호출)
   */
  async expireSession(rawToken: string): Promise<void> {
    try {
      const sessionToken = this.hashToken(rawToken);
      await UserSession.update({ isActive: false }, { where: { sessionToken } });
      this.invalidateStatus(sessionToken);
    } catch (error) {
      logError('세션 만료 처리 실패', error);
    }
  }

  /**
   * 사용자의 모든 세션 만료 (강제 전체 로그아웃)
   */
  async expireAllUserSessions(userId: string): Promise<void> {
    try {
      await UserSession.update({ isActive: false }, { where: { userId, isActive: true } });
    } catch (error) {
      logError('전체 세션 만료 처리 실패', error);
    }
  }

  /**
   * 사용자의 활성 세션 목록 조회.
   * currentRawToken을 주면(본인 조회) 현재 요청의 세션에 isCurrent=true를 표시한다.
   * sessionToken은 매칭에만 내부 사용하고 응답에서는 제외한다(노출 금지).
   */
  async getActiveSessions(userId: string, currentRawToken?: string) {
    const currentHash = currentRawToken ? this.hashToken(currentRawToken) : null;
    const sessions = await UserSession.findAll({
      where: {
        userId,
        isActive: true,
        expiresAt: { [Op.gt]: new Date() },
      },
      attributes: [
        'id',
        'userId',
        'ipAddress',
        'userAgent',
        'lastActiveAt',
        'expiresAt',
        'createdAt',
        'sessionToken',
      ],
      order: [['lastActiveAt', 'DESC']],
    });
    return sessions.map(s => ({
      id: s.id,
      userId: s.userId,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      lastActiveAt: s.lastActiveAt,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      isCurrent: currentHash !== null && s.sessionToken === currentHash,
    }));
  }

  /**
   * 본인 세션 종료 — 소유권 확인 후 비활성화(refresh 차단). tokenVersion은 건드리지 않아
   * 다른 세션은 영향 없음. 현재 세션은 이 경로로 종료 불가(로그아웃 사용).
   * 반환: 'ok' | 'not_found' | 'forbidden' | 'is_current'
   */
  async terminateOwnSession(
    userId: string,
    sessionId: string,
    currentRawToken?: string
  ): Promise<'ok' | 'not_found' | 'forbidden' | 'is_current'> {
    const session = await UserSession.findByPk(sessionId, {
      attributes: ['id', 'userId', 'sessionToken', 'isActive'],
    });
    if (!session || !session.isActive) return 'not_found';
    if (session.userId !== userId) return 'forbidden';
    if (currentRawToken && session.sessionToken === this.hashToken(currentRawToken)) {
      return 'is_current';
    }
    await session.update({ isActive: false });
    // 종료를 액세스 토큰에도 즉시 반영 — 해당 기기의 다음 요청에서 곧바로 차단됨
    this.invalidateStatus(session.sessionToken);
    return 'ok';
  }

  /**
   * 특정 세션 강제 종료 (관리자용)
   */
  async forceLogout(sessionId: string): Promise<boolean> {
    try {
      const session = await UserSession.findByPk(sessionId);
      if (!session) return false;
      await session.update({ isActive: false });
      // 강제 종료를 액세스 토큰에도 즉시 반영
      this.invalidateStatus(session.sessionToken);
      return true;
    } catch (error) {
      logError('강제 세션 종료 실패', error);
      return false;
    }
  }

  /**
   * 만료된 세션 정리
   */
  async cleanExpiredSessions(): Promise<number> {
    const now = new Date();
    const graceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return UserSession.destroy({
      where: {
        [Op.or]: [
          { expiresAt: { [Op.lt]: now } },
          { isActive: false, createdAt: { [Op.lt]: graceDate } },
        ],
      },
    });
  }
}

export const userSessionService = new UserSessionService();
