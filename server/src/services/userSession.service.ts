import { BaseService } from './base.service';
import { UserSession } from '../models/UserSession';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { logError } from '../utils/logger';
import { getSettings } from '../utils/settingsCache';
import { closeUserConnections } from './sse.service';

const MAX_SESSIONS_PER_USER = 10;

// 세션 종료를 액세스 토큰에도 즉시 반영하기 위한 상태 캐시. TTL 은 인증 미들웨어 userCache(30초)와 맞춘다.
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

  /** 이 refresh_token 의 DB 세션이 종료 상태인지. 세션 행이 없으면 false(로그인 직후 race 오탐 방지). */
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
      // 행이 없으면 종료로 보지 않는다(로그인 직후 race, 미추적 세션).
      const revoked = session !== null && (!session.isActive || session.expiresAt <= new Date());
      this.statusCache.set(sessionToken, { revoked, at: Date.now() });
      return revoked;
    } catch (error) {
      logError('세션 상태 확인 실패', error);
      // 조회 실패 시 차단하지 않고 액세스 토큰 자체 검증에 맡긴다.
      return false;
    }
  }

  /** 세션 생성 (로그인 시 호출) */
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

      await this.enforceSessionLimit(data.userId);
    } catch (error) {
      logError('세션 생성 실패', error);
    }
  }

  /** 사용자당 최대 세션 수 제한. 초과하면 가장 오래된 활성 세션을 만료시킨다 */
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

  /** 세션 활동 갱신 + 토큰 교체(refresh 시 호출). 세션이 없거나 이미 만료됐으면 조용히 무시한다. */
  async rotateSession(oldRawToken: string, newRawToken: string): Promise<void> {
    try {
      const oldHash = this.hashToken(oldRawToken);
      const newHash = this.hashToken(newRawToken);
      // DB 만료시각과 JWT 만료시각이 어긋나지 않게 expiresAt 도 갱신한다.
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

  /** DB 세션 유효성 검증. 강제 로그아웃된 세션은 false 라 토큰 갱신이 막힌다. */
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
      // 오류 시 false 로 둔다. 강제 로그아웃된 세션이 DB 오류를 틈타 통과하면 안 된다.
      return false;
    }
  }

  /** 세션의 최초 IP·기기 정보. rotateSession 이 갱신하지 않으므로 로그인 시점 기준이다. */
  async getSessionMeta(
    rawToken: string
  ): Promise<{ ipAddress: string | null; userAgent: string | null } | null> {
    try {
      const sessionToken = this.hashToken(rawToken);
      const session = await UserSession.findOne({
        where: { sessionToken },
        attributes: ['ipAddress', 'userAgent'],
      });
      if (!session) return null;
      return { ipAddress: session.ipAddress ?? null, userAgent: session.userAgent ?? null };
    } catch {
      return null;
    }
  }

  /** 세션 만료 (로그아웃 시 호출) */
  async expireSession(rawToken: string): Promise<void> {
    try {
      const sessionToken = this.hashToken(rawToken);
      await UserSession.update({ isActive: false }, { where: { sessionToken } });
      this.invalidateStatus(sessionToken);
    } catch (error) {
      logError('세션 만료 처리 실패', error);
    }
  }

  /** 사용자의 모든 세션 만료 (강제 전체 로그아웃) */
  async expireAllUserSessions(userId: string): Promise<void> {
    try {
      // 끊을 세션을 먼저 읽어 상태 캐시를 그 자리에서 비운다. 안 비우면 끊긴 세션이 잠시 통과한다.
      const rows = await UserSession.findAll({
        where: { userId, isActive: true },
        attributes: ['sessionToken'],
      });
      await UserSession.update({ isActive: false }, { where: { userId, isActive: true } });
      for (const row of rows) this.invalidateStatus(row.sessionToken);
      // 열려 있는 알림 스트림도 함께 끊는다.
      closeUserConnections(userId);
    } catch (error) {
      logError('전체 세션 만료 처리 실패', error);
    }
  }

  /** 활성 세션 목록. currentRawToken 을 주면 현재 세션에 isCurrent 를 붙이고, sessionToken 은 응답에서 뺀다. */
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
   * 본인 세션 종료. tokenVersion 은 건드리지 않아 다른 세션은 그대로다. 현재 세션은 이 경로로 종료할 수 없다.
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
    // 해당 기기의 다음 요청에서 곧바로 막히도록 상태 캐시를 비운다.
    this.invalidateStatus(session.sessionToken);
    return 'ok';
  }

  /** 특정 세션 강제 종료 (관리자용) */
  async forceLogout(sessionId: string): Promise<boolean> {
    try {
      const session = await UserSession.findByPk(sessionId);
      if (!session) return false;
      await session.update({ isActive: false });
      // 강제 종료를 액세스 토큰에도 즉시 반영
      this.invalidateStatus(session.sessionToken);
      // 스트림은 붙을 때 한 번만 인증하므로 그 사람의 알림 연결도 모두 끊는다.
      closeUserConnections(session.userId);
      return true;
    } catch (error) {
      logError('강제 세션 종료 실패', error);
      return false;
    }
  }

  /** 만료된 세션 정리 */
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
