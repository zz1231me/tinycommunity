// client/src/components/TwoFactorSettings.tsx - 프로필 페이지용 2FA 설정 컴포넌트
import { useState, useEffect } from 'react';
import api from '../api/axios';

export const TwoFactorSettings = () => {
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── 활성화 플로우 ──────────────────────────────────────────────────────────
  // 1단계: 비밀번호 확인 패널
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [setupPassword, setSetupPassword] = useState<string>('');
  // 2단계: QR 코드 패널
  const [showSetup, setShowSetup] = useState(false);
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [token, setToken] = useState<string>('');

  // ── 비활성화 플로우 ────────────────────────────────────────────────────────
  const [showDisableInput, setShowDisableInput] = useState(false);
  const [disableCode, setDisableCode] = useState<string>('');
  const [disablePassword, setDisablePassword] = useState<string>('');

  // ── 공통 ──────────────────────────────────────────────────────────────────
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // 2FA 상태 조회
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await api.get('/2fa/status');
        setIs2FAEnabled(response.data.data?.enabled || false);
      } catch (err) {
        if (import.meta.env.DEV) console.error('2FA 상태 조회 실패:', err);
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, []);

  // 활성화 버튼 클릭 → 비밀번호 확인 단계 진입
  const handleClickEnable = () => {
    setSetupPassword('');
    setError('');
    setShowPasswordPrompt(true);
  };

  // 비밀번호 확인 후 2FA 비밀키 생성 요청
  const handleStartSetup = async () => {
    if (!setupPassword) {
      setError('현재 비밀번호를 입력해주세요.');
      return;
    }
    try {
      setIsProcessing(true);
      setError('');
      const response = await api.post('/2fa/generate', { currentPassword: setupPassword });
      setQrCode(response.data.data.qrCode);
      setSecret(response.data.data.secret);
      setShowPasswordPrompt(false);
      setShowSetup(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.message || '설정 생성에 실패했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 2FA 활성화 (QR 스캔 후 코드 검증)
  const handleEnable2FA = async () => {
    if (!token || token.length !== 6) {
      setError('6자리 인증 코드를 입력해주세요.');
      return;
    }

    try {
      setIsProcessing(true);
      setError('');
      await api.post('/2fa/enable', { token });
      setIs2FAEnabled(true);
      setShowSetup(false);
      setToken('');
      setSetupPassword('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.message || '잘못된 인증 코드입니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 2FA 비활성화
  const handleDisable2FA = async () => {
    if (!disableCode || !disablePassword) return;

    try {
      setIsProcessing(true);
      setError('');
      await api.post('/2fa/disable', { token: disableCode, currentPassword: disablePassword });
      setIs2FAEnabled(false);
      setShowDisableInput(false);
      setDisableCode('');
      setDisablePassword('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.message || '비활성화에 실패했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
        <div className="animate-pulse flex space-x-4 w-full">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded w-1/4"></div>
            <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 2FA 상태 표시 */}
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
        <div>
          <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
            🔐 2단계 인증 (2FA)
            {is2FAEnabled && (
              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                활성화됨
              </span>
            )}
          </h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {is2FAEnabled
              ? 'Authenticator 앱으로 로그인 시 추가 인증이 필요합니다.'
              : '로그인 보안을 강화하려면 2단계 인증을 활성화하세요.'}
          </p>
        </div>

        {!showSetup && !showPasswordPrompt && (
          <button
            onClick={is2FAEnabled ? () => setShowDisableInput(true) : handleClickEnable}
            disabled={isProcessing || showDisableInput}
            className={`
              px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-opacity-50
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                is2FAEnabled
                  ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:ring-red-500'
                  : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:ring-blue-500'
              }
            `}
          >
            {isProcessing ? '처리 중...' : is2FAEnabled ? '비활성화' : '활성화'}
          </button>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="p-3 text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* 1단계: 비밀번호 확인 (활성화 시작 전) */}
      {showPasswordPrompt && (
        <div className="p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/10">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
            2FA를 설정하려면 현재 비밀번호를 입력하세요.
          </p>
          <input
            type="password"
            value={setupPassword}
            onChange={e => setSetupPassword(e.target.value)}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
            className="
              w-full px-4 py-3 text-sm
              border border-slate-300 dark:border-slate-600 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
              bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100
            "
          />
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleStartSetup}
              disabled={isProcessing || !setupPassword}
              className="
                flex-1 px-4 py-2 text-sm font-medium text-white
                bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400
                rounded-lg transition-all duration-200 disabled:cursor-not-allowed
              "
            >
              {isProcessing ? '확인 중...' : '계속'}
            </button>
            <button
              onClick={() => {
                setShowPasswordPrompt(false);
                setSetupPassword('');
                setError('');
              }}
              className="
                flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300
                bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600
                rounded-lg transition-all duration-200
              "
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 2FA 비활성화 인라인 입력 */}
      {showDisableInput && (
        <div className="mt-4 p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/10">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
            비활성화하려면 현재 비밀번호와 인증 코드를 입력하세요.
          </p>
          <input
            type="password"
            value={disablePassword}
            onChange={e => setDisablePassword(e.target.value)}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
            className="
              w-full px-4 py-3 text-sm mb-3
              border border-slate-300 dark:border-slate-600 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50
              bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100
            "
          />
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={disableCode}
            onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
            placeholder="인증 코드 6자리 입력"
            className="
              w-full px-4 py-3 text-center text-xl font-mono tracking-widest
              border border-slate-300 dark:border-slate-600 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50
              bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100
            "
            maxLength={6}
          />
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleDisable2FA}
              disabled={isProcessing || disableCode.length !== 6 || !disablePassword}
              className="
                flex-1 px-4 py-2 text-sm font-medium text-white
                bg-red-600 hover:bg-red-700 disabled:bg-red-400
                rounded-lg transition-all duration-200 disabled:cursor-not-allowed
              "
            >
              {isProcessing ? '처리 중...' : '확인'}
            </button>
            <button
              onClick={() => {
                setShowDisableInput(false);
                setDisableCode('');
                setDisablePassword('');
                setError('');
              }}
              className="
                flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300
                bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600
                rounded-lg transition-all duration-200
              "
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 2FA 설정 패널 (2단계: QR 코드) */}
      {showSetup && (
        <div className="p-5 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/10">
          <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-4">
            📱 Authenticator 앱으로 등록하기
          </h5>

          <div className="space-y-4">
            {/* QR 코드 */}
            <div className="flex justify-center">
              {qrCode && (
                <img
                  src={qrCode}
                  alt="2FA QR Code"
                  className="border-2 border-slate-200 dark:border-slate-600 rounded-lg"
                />
              )}
            </div>

            {/* 수동 입력 키 */}
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">수동 입력 키:</p>
              <code className="text-sm font-mono text-slate-800 dark:text-slate-200 break-all select-all">
                {secret}
              </code>
            </div>

            {/* 인증 코드 입력 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                인증 코드 입력
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="
                  w-full px-4 py-3 text-center text-xl font-mono tracking-widest
                  border border-slate-300 dark:border-slate-600 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
                  bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100
                "
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSetup(false);
                  setToken('');
                  setSetupPassword('');
                  setError('');
                }}
                className="
                  flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300
                  bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600
                  rounded-lg transition-all duration-200
                "
              >
                취소
              </button>
              <button
                onClick={handleEnable2FA}
                disabled={isProcessing || token.length !== 6}
                className="
                  flex-1 px-4 py-2 text-sm font-medium text-white
                  bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400
                  rounded-lg transition-all duration-200
                  disabled:cursor-not-allowed
                "
              >
                {isProcessing ? '확인 중...' : '2FA 활성화'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
