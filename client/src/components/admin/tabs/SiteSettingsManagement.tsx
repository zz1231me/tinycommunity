// client/src/components/admin/tabs/SiteSettingsManagement.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  getSiteSettings,
  updateSiteSettings,
  uploadSiteAsset,
  SiteSettings,
} from '../../../api/siteSettings';
import { useSiteSettings } from '../../../store/siteSettings';
import { cacheSiteIdentity } from '../../../utils/siteIdentityCache';
import { AdminSection } from '../common/AdminSection';
import { ToggleSwitch } from '../common/ToggleSwitch';
import { LoadingSpinner } from '../common/LoadingSpinner';

// ─── Asset uploader (logo / favicon) ────────────────────────────────────────

interface AssetUploaderProps {
  label: string;
  hint: string;
  accept: string;
  value: string | null;
  onChange: (url: string | null) => void;
}

const AssetUploader: React.FC<AssetUploaderProps> = ({ label, hint, accept, value, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const url = await uploadSiteAsset(file);
      onChange(url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setError(e.message || '업로드 실패');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center bg-slate-50 dark:bg-slate-700/50 overflow-hidden flex-shrink-0">
          {value ? (
            <img
              src={value}
              alt={label}
              className="w-full h-full object-contain p-1"
              onError={e => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <svg
              className="w-6 h-6 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          )}
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          {/* type="text" — 업로드가 반환하는 상대경로(/uploads/...)도 허용해야 하므로 type="url" 금지.
              (type="url"은 절대 URL만 유효로 보고 상대경로를 막아 baseURL 수동입력을 강요함) */}
          <input
            type="text"
            value={value ?? ''}
            onChange={e => onChange(e.target.value || null)}
            placeholder="파일 업로드 시 자동 입력 (또는 https://... 직접 입력)"
            className="input"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-xs font-medium bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      className="opacity-25"
                    />
                    <path
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      className="opacity-75"
                    />
                  </svg>
                  업로드 중...
                </span>
              ) : (
                '파일 업로드'
              )}
            </button>

            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-500 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors"
              >
                초기화
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
};

// ─── NumberInput helper ───────────────────────────────────────────────────────

interface NumberInputProps {
  label: string;
  description: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
}
const NumberInput: React.FC<NumberInputProps> = ({
  label,
  description,
  min,
  max,
  value,
  onChange,
  unit,
}) => {
  const [raw, setRaw] = useState(String(value));

  // 외부 value가 바뀌면 raw 동기화 (초기 로드 시)
  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  const commit = (str: string) => {
    const n = parseInt(str);
    if (!isNaN(n)) {
      const clamped = Math.max(min, Math.min(max, n));
      onChange(clamped);
      // clamp 결과가 기존 value와 같으면 useEffect가 안 돌아 raw가 입력값에 묶이므로 직접 동기화
      setRaw(String(clamped));
    } else {
      setRaw(String(value)); // 유효하지 않은 값이면 원래 값으로 복원
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          }}
          className="input max-w-[120px]"
        />
        {unit && <span className="text-sm text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
    </div>
  );
};

// ─── DEFAULT_SETTINGS ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: '',
  siteTitle: '',
  faviconUrl: null,
  logoUrl: null,
  description: null,
  allowRegistration: true,
  requireApproval: false,
  maintenanceMode: false,
  maintenanceMessage: null,
  loginMessage: null,
  maxLoginAttempts: 5,
  accountLockMinutes: 30,
  maxFileCount: 5,
  maxFileSizeMb: 100,
  maxImageSizeMb: 10,
  maxAvatarSizeMb: 5,
  maxArchiveSizeMb: 100,
  maxImageCount: 1,
  bcryptRounds: 10,
  allowedImageExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico'],
  allowedDocumentExtensions: [
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
    '.csv',
    '.rtf',
    '.odt',
    '.ods',
    '.odp',
    '.hwp',
  ],
  allowedArchiveExtensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
  allowedMediaExtensions: ['.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
  defaultPageSize: 10,
  securityLogRetentionDays: 90,
  errorLogRetentionDays: 30,
  deletedPostRetentionDays: 7,
  jwtAccessTokenHours: 2,
  jwtRefreshTokenDays: 3,
  postTitleMaxLength: 200,
  postContentMaxLength: 500000,
  postSecretPasswordMinLength: 4,
  globalSearchLimit: 50,
  allowGuestComment: false,
  minPasswordLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumberOrSpecial: true,
  commentMaxDepth: 3,
  commentMaxCount: 1000,
  avatarSizePx: 200,
  avatarQuality: 90,
  passwordResetTokenHours: 1,
  rateLimitApiMax: 200,
  rateLimitAuthMax: 10,
  rateLimitUploadMax: 20,
  rateLimitDownloadMax: 100,
  autoSaveIntervalSeconds: 30,
  draftExpiryMinutes: 60,
  memoMaxPerUser: 200,
  commentContentMaxLength: 1000,
  eventBodyMaxLength: 10000,
  eventLocationMaxLength: 500,
};

// ─── Main component ──────────────────────────────────────────────────────────

export const SiteSettingsManagement = () => {
  const {
    setSettings: updateStore,
    settings: storeSettings,
    isLoadedFromServer,
  } = useSiteSettings();

  const [settings, setSettings] = useState<SiteSettings>(() =>
    isLoadedFromServer
      ? { ...DEFAULT_SETTINGS, ...(storeSettings as unknown as SiteSettings) }
      : DEFAULT_SETTINGS
  );
  const [loading, setLoading] = useState(!isLoadedFromServer);
  const isDirty = useRef(false);

  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setMessage({ type, text });
    messageTimerRef.current = setTimeout(() => setMessage(null), 5000);
  }, []);

  useEffect(
    () => () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    },
    []
  );

  const set = <K extends keyof SiteSettings>(key: K, val: SiteSettings[K]) => {
    isDirty.current = true;
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  const applyFavicon = (url: string) => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await getSiteSettings();
        // 사용자가 편집을 시작하지 않은 경우에만 서버 데이터로 폼 덮어쓰기
        if (!isDirty.current) {
          setSettings({ ...DEFAULT_SETTINGS, ...data });
        }
        // 스토어는 항상 최신 서버 값으로 유지
        updateStore(data as unknown as Parameters<typeof updateStore>[0]);
      } catch {
        setMessage({ type: 'error', text: '설정을 불러오는데 실패했습니다.' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.siteName.trim() || !settings.siteTitle.trim()) {
      showMessage('error', '사이트 이름과 페이지 타이틀은 필수입니다.');
      return;
    }
    try {
      setSaving(true);
      setMessage(null);
      const updated = await updateSiteSettings(settings);
      setSettings(updated);
      updateStore(updated);
      isDirty.current = false; // 저장 성공 시 dirty 플래그 초기화
      document.title = updated.siteTitle;
      if (updated.faviconUrl) applyFavicon(updated.faviconUrl);
      // 캐시도 갱신 — 안 하면 변경 직후 새로고침 시 index.html 인라인 스크립트가 옛 제목을
      // 잠깐 적용했다 교체하는 깜빡임이 남는다.
      cacheSiteIdentity(updated.siteTitle, updated.faviconUrl);
      showMessage('success', '설정이 저장되었습니다.');
    } catch {
      showMessage('error', '설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner message="설정을 불러오는 중..." />;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Toast message ─────────────────────────────────────────────────── */}
      {message && (
        <div
          className={`p-4 rounded-lg border-2 flex items-center justify-between gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          <span className="text-sm font-medium">{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-lg leading-none opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {/* ── 1. 기본 정보 ─────────────────────────────────────────────────── */}
      <AdminSection title="기본 정보">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              사이트 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={settings.siteName}
              onChange={e => set('siteName', e.target.value)}
              placeholder="TinyCommunity"
              required
              className="input max-w-sm"
            />
            <p className="mt-1 text-xs text-slate-400">헤더와 사이드바에 표시되는 이름</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              페이지 타이틀 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={settings.siteTitle}
              onChange={e => set('siteTitle', e.target.value)}
              placeholder="TinyCommunity"
              required
              className="input max-w-sm"
            />
            <p className="mt-1 text-xs text-slate-400">브라우저 탭에 표시되는 제목</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              사이트 설명
            </label>
            <textarea
              value={settings.description ?? ''}
              onChange={e => set('description', e.target.value || null)}
              rows={3}
              placeholder="사이트에 대한 간단한 설명을 입력하세요."
              className="input resize-none"
            />
            <p className="mt-1 text-xs text-slate-400">메타 태그, SEO, 로그인 페이지에 사용</p>
          </div>
        </div>
      </AdminSection>

      {/* ── 2. 브랜딩 ─────────────────────────────────────────────────────── */}
      <AdminSection title="브랜딩">
        <div className="space-y-6">
          <AssetUploader
            label="로고 이미지"
            hint="PNG · JPG · WebP · GIF 지원 — 파일 업로드 또는 외부 URL 직접 입력"
            accept="image/png,image/jpeg,image/webp,image/gif"
            value={settings.logoUrl}
            onChange={url => set('logoUrl', url)}
          />
          <div className="border-t border-slate-100 dark:border-slate-700" />
          <AssetUploader
            label="파비콘"
            hint=".ico · PNG · JPG 지원 — 브라우저 탭에 표시되는 아이콘"
            accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/jpeg,image/webp,.ico"
            value={settings.faviconUrl}
            onChange={url => set('faviconUrl', url)}
          />
        </div>
      </AdminSection>

      {/* ── 3. 회원가입 설정 ───────────────────────────────────────────────── */}
      <AdminSection title="회원가입 설정">
        <div className="space-y-4">
          <ToggleSwitch
            checked={settings.allowRegistration}
            onChange={v => {
              set('allowRegistration', v);
              if (!v) set('requireApproval', false);
            }}
            label="회원가입 허용"
            description="비활성화하면 로그인 페이지에서 회원가입 버튼이 숨겨집니다."
          />

          {settings.allowRegistration && (
            <div className="ml-4 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
              <ToggleSwitch
                checked={settings.requireApproval}
                onChange={v => set('requireApproval', v)}
                label="신규 가입 승인 필요"
                description="활성화하면 관리자가 승인하기 전까지 신규 가입자가 로그인할 수 없습니다."
              />
            </div>
          )}
        </div>
      </AdminSection>

      {/* ── 4. 댓글 설정 ───────────────────────────────────────────────────── */}
      <AdminSection title="댓글 설정">
        <div className="space-y-4">
          <ToggleSwitch
            checked={settings.allowGuestComment}
            onChange={v => set('allowGuestComment', v)}
            label="비로그인 댓글 허용"
            description="활성화하면 로그인하지 않은 사용자도 댓글을 작성할 수 있습니다."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberInput
              label="대댓글 최대 깊이"
              description="원댓글 포함 허용되는 댓글 중첩 단계 수"
              min={1}
              max={5}
              value={settings.commentMaxDepth}
              onChange={v => set('commentMaxDepth', v)}
              unit="단계"
            />
            <NumberInput
              label="게시글당 최대 댓글 수"
              description="DoS 방지를 위한 게시글당 댓글 상한"
              min={100}
              max={5000}
              value={settings.commentMaxCount}
              onChange={v => set('commentMaxCount', v)}
              unit="개"
            />
            <NumberInput
              label="댓글 본문 최대 글자수"
              description="댓글 1개의 본문 길이 상한"
              min={100}
              max={10000}
              value={settings.commentContentMaxLength}
              onChange={v => set('commentContentMaxLength', v)}
              unit="자"
            />
            <NumberInput
              label="사용자당 최대 메모 개수"
              description="개인 메모 보드의 사용자별 메모 상한 (DoS 방지)"
              min={10}
              max={2000}
              value={settings.memoMaxPerUser}
              onChange={v => set('memoMaxPerUser', v)}
              unit="개"
            />
            <NumberInput
              label="이벤트 본문 최대 글자수"
              description="캘린더 이벤트의 본문(설명) 길이 상한"
              min={100}
              max={100000}
              value={settings.eventBodyMaxLength}
              onChange={v => set('eventBodyMaxLength', v)}
              unit="자"
            />
            <NumberInput
              label="이벤트 장소 최대 글자수"
              description="캘린더 이벤트의 장소 필드 길이 상한"
              min={10}
              max={2000}
              value={settings.eventLocationMaxLength}
              onChange={v => set('eventLocationMaxLength', v)}
              unit="자"
            />
          </div>
        </div>
      </AdminSection>

      {/* ── 5. 점검 모드 ───────────────────────────────────────────────────── */}
      <AdminSection title="점검 모드">
        <div className="space-y-4">
          {settings.maintenanceMode && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-300 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                점검 모드가 활성화되면 관리자/매니저를 제외한 모든 사용자가 서비스 이용 불가 상태가
                됩니다.
              </span>
            </div>
          )}

          <ToggleSwitch
            checked={settings.maintenanceMode}
            onChange={v => set('maintenanceMode', v)}
            label="점검 모드 활성화"
            description="활성화하면 일반 사용자에게 503 점검 화면이 표시됩니다."
            variant="danger"
          />

          {settings.maintenanceMode && (
            <div className="ml-4 pl-4 border-l-2 border-red-200 dark:border-red-800">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                점검 안내 메시지
              </label>
              <textarea
                value={settings.maintenanceMessage ?? ''}
                onChange={e => set('maintenanceMessage', e.target.value || null)}
                rows={3}
                placeholder="현재 서비스 점검 중입니다. 잠시 후 다시 이용해 주세요."
                className="input resize-none"
              />
              <p className="mt-1 text-xs text-slate-400">비워두면 기본 메시지가 표시됩니다.</p>
            </div>
          )}
        </div>
      </AdminSection>

      {/* ── 6. 로그인 페이지 설정 ─────────────────────────────────────────── */}
      <AdminSection title="로그인 페이지 설정">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            로그인 페이지 안내 메시지
          </label>
          <textarea
            value={settings.loginMessage ?? ''}
            onChange={e => set('loginMessage', e.target.value || null)}
            rows={3}
            placeholder="로그인 페이지 하단에 표시할 메시지를 입력하세요. (예: 문의: admin@example.com)"
            className="input resize-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            공지사항, 문의처, 이용 안내 등을 입력할 수 있습니다.
          </p>
        </div>
      </AdminSection>

      {/* ── 7. 시스템 설정 ────────────────────────────────────────────────── */}
      <AdminSection title="시스템 설정">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 보안 설정 */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-2">
              보안 설정
            </h4>
            <NumberInput
              label="비밀번호 최소 길이"
              description="회원가입/변경 시 요구되는 최소 비밀번호 길이 (6~72자)"
              min={6}
              max={72}
              value={settings.minPasswordLength}
              onChange={v => set('minPasswordLength', v)}
              unit="자"
            />
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                비밀번호 복잡도 요구사항
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                각 조건을 끄면 해당 요건 없이도 비밀번호를 설정할 수 있습니다.
              </p>
              {(
                [
                  {
                    key: 'requireUppercase' as const,
                    label: '영문 대문자 포함 필수',
                    desc: '예: A, B, C …',
                  },
                  {
                    key: 'requireLowercase' as const,
                    label: '영문 소문자 포함 필수',
                    desc: '예: a, b, c …',
                  },
                  {
                    key: 'requireNumberOrSpecial' as const,
                    label: '숫자 또는 특수문자 포함 필수',
                    desc: '숫자(0-9) 또는 !@#$%^&*',
                  },
                ] as const
              ).map(({ key, label, desc }) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {label}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={e => set(key, e.target.checked)}
                    className="w-4 h-4 accent-primary-600"
                  />
                </label>
              ))}
            </div>
            <NumberInput
              label="로그인 최대 시도 횟수"
              description="초과 시 계정이 잠깁니다"
              min={1}
              max={20}
              value={settings.maxLoginAttempts}
              onChange={v => set('maxLoginAttempts', v)}
              unit="회"
            />
            <NumberInput
              label="계정 잠금 시간"
              description="잠금 해제까지 대기 시간"
              min={1}
              max={1440}
              value={settings.accountLockMinutes}
              onChange={v => set('accountLockMinutes', v)}
              unit="분"
            />
            <NumberInput
              label="JWT 액세스 토큰 만료"
              description="로그인 세션 유지 시간"
              min={1}
              max={168}
              value={settings.jwtAccessTokenHours}
              onChange={v => set('jwtAccessTokenHours', v)}
              unit="시간"
            />
            <NumberInput
              label="JWT 리프레시 토큰 만료"
              description="자동 로그인 유지 기간"
              min={1}
              max={30}
              value={settings.jwtRefreshTokenDays}
              onChange={v => set('jwtRefreshTokenDays', v)}
              unit="일"
            />
            <NumberInput
              label="비밀번호 재설정 링크 유효시간"
              description="재설정 이메일 발송 후 링크 만료까지의 시간"
              min={1}
              max={48}
              value={settings.passwordResetTokenHours}
              onChange={v => set('passwordResetTokenHours', v)}
              unit="시간"
            />
          </div>
          {/* 파일 & 게시글 설정 */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-2">
              파일 &amp; 게시글
            </h4>
            <NumberInput
              label="첨부파일 최대 개수"
              description="게시글당 허용되는 파일 수"
              min={1}
              max={20}
              value={settings.maxFileCount}
              onChange={v => set('maxFileCount', v)}
              unit="개"
            />
            <NumberInput
              label="문서/일반 파일 최대 크기"
              description="문서, 압축 첨부파일 1개당 최대 크기"
              min={1}
              max={1000}
              value={settings.maxFileSizeMb}
              onChange={v => set('maxFileSizeMb', v)}
              unit="MB"
            />
            <NumberInput
              label="기본 페이지 크기"
              description="목록에서 한 번에 표시할 항목 수"
              min={5}
              max={100}
              value={settings.defaultPageSize}
              onChange={v => set('defaultPageSize', v)}
              unit="개"
            />
            <NumberInput
              label="게시글 제목 최대 길이"
              description="게시글 제목에 입력 가능한 최대 글자 수"
              min={10}
              max={500}
              value={settings.postTitleMaxLength}
              onChange={v => set('postTitleMaxLength', v)}
              unit="자"
            />
            <NumberInput
              label="게시글 본문 최대 길이"
              description="게시글 본문에 입력 가능한 최대 글자 수"
              min={1000}
              max={2000000}
              value={settings.postContentMaxLength}
              onChange={v => set('postContentMaxLength', v)}
              unit="자"
            />
            <NumberInput
              label="비밀글 비밀번호 최소 길이"
              description="비밀글 생성 시 요구되는 최소 비밀번호 길이"
              min={4}
              max={20}
              value={settings.postSecretPasswordMinLength}
              onChange={v => set('postSecretPasswordMinLength', v)}
              unit="자"
            />
            <NumberInput
              label="전체 검색 최대 결과 수"
              description="검색 시 반환되는 최대 게시글 수"
              min={10}
              max={200}
              value={settings.globalSearchLimit}
              onChange={v => set('globalSearchLimit', v)}
              unit="개"
            />
          </div>
          {/* 로그 설정 */}
          <div className="space-y-4 md:col-span-2">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-2">
              로그 보존 기간
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberInput
                label="보안 로그 보존 기간"
                description="보안 감사 로그 자동 삭제 기간"
                min={7}
                max={365}
                value={settings.securityLogRetentionDays}
                onChange={v => set('securityLogRetentionDays', v)}
                unit="일"
              />
              <NumberInput
                label="에러 로그 보존 기간"
                description="에러 로그 자동 삭제 기간"
                min={7}
                max={365}
                value={settings.errorLogRetentionDays}
                onChange={v => set('errorLogRetentionDays', v)}
                unit="일"
              />
              <NumberInput
                label="삭제 게시글 보관 기간"
                description="삭제(숨김)된 게시글을 DB에서 영구 삭제하기까지의 기간"
                min={1}
                max={365}
                value={settings.deletedPostRetentionDays}
                onChange={v => set('deletedPostRetentionDays', v)}
                unit="일"
              />
            </div>
          </div>
        </div>
      </AdminSection>

      {/* ── 8. 파일 크기 제한 ─────────────────────────────────────────────── */}
      <AdminSection title="파일 크기 제한 (카테고리별)">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <NumberInput
            label="이미지 최대 크기"
            description="에디터·게시글 첨부 이미지"
            min={1}
            max={500}
            value={settings.maxImageSizeMb}
            onChange={v => set('maxImageSizeMb', v)}
            unit="MB"
          />
          <NumberInput
            label="아바타 최대 크기"
            description="프로필 사진 업로드 제한"
            min={1}
            max={100}
            value={settings.maxAvatarSizeMb}
            onChange={v => set('maxAvatarSizeMb', v)}
            unit="MB"
          />
        </div>
      </AdminSection>


      {/* ── 10. 보안 고급 설정 ────────────────────────────────────────────── */}
      <AdminSection title="보안 고급 설정">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs">
            <p className="font-medium">주의</p>
            <p>
              bcrypt 라운드를 높이면 비밀번호 보안이 강화되지만, 로그인 시 처리 시간이 증가합니다.
              (10: 기본, 12: 권장, 14: 최고 보안)
            </p>
          </div>
          <NumberInput
            label="bcrypt 해싱 라운드"
            description="비밀번호 해싱 강도 (높을수록 안전하나 로그인 속도 감소)"
            min={10}
            max={14}
            value={settings.bcryptRounds}
            onChange={v => set('bcryptRounds', v)}
            unit="라운드"
          />
        </div>
      </AdminSection>

      {/* ── 11. 아바타 처리 설정 ─────────────────────────────────────────── */}
      <AdminSection title="아바타 처리 설정">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput
            label="아바타 리사이징 크기"
            description="업로드된 프로필 사진을 이 크기의 정사각형으로 자릅니다"
            min={50}
            max={500}
            value={settings.avatarSizePx}
            onChange={v => set('avatarSizePx', v)}
            unit="px"
          />
          <NumberInput
            label="아바타 JPEG 품질"
            description="낮출수록 파일 크기 감소, 높일수록 화질 향상"
            min={50}
            max={100}
            value={settings.avatarQuality}
            onChange={v => set('avatarQuality', v)}
            unit="%"
          />
        </div>
      </AdminSection>

      {/* ── 12. Rate Limit 설정 ───────────────────────────────────────────── */}
      <AdminSection title="요청 속도 제한 (Rate Limit)">
        <div className="space-y-3 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs">
          <p className="font-medium">안내</p>
          <p>
            과도한 요청으로부터 서버를 보호합니다. 시간 창(window)은 고정이며, 최대 요청 수만 조정
            가능합니다.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput
            label="일반 API (15분 창)"
            description="일반 API 호출 최대 횟수"
            min={50}
            max={1000}
            value={settings.rateLimitApiMax}
            onChange={v => set('rateLimitApiMax', v)}
            unit="회"
          />
          <NumberInput
            label="인증 API (15분 창)"
            description="로그인·회원가입 최대 시도 횟수 (프로덕션)"
            min={3}
            max={100}
            value={settings.rateLimitAuthMax}
            onChange={v => set('rateLimitAuthMax', v)}
            unit="회"
          />
          <NumberInput
            label="파일 업로드 (1시간 창)"
            description="파일 업로드 최대 횟수"
            min={5}
            max={200}
            value={settings.rateLimitUploadMax}
            onChange={v => set('rateLimitUploadMax', v)}
            unit="회"
          />
          <NumberInput
            label="파일 다운로드 (1시간 창)"
            description="파일 다운로드 최대 횟수"
            min={10}
            max={500}
            value={settings.rateLimitDownloadMax}
            onChange={v => set('rateLimitDownloadMax', v)}
            unit="회"
          />
        </div>
      </AdminSection>

      {/* ── 13. 에디터 설정 ───────────────────────────────────────────────── */}
      <AdminSection title="에디터 설정">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput
            label="자동저장 주기"
            description="게시글 작성 중 임시저장 간격"
            min={10}
            max={300}
            value={settings.autoSaveIntervalSeconds}
            onChange={v => set('autoSaveIntervalSeconds', v)}
            unit="초"
          />
          <NumberInput
            label="임시저장 복원 유효시간"
            description="저장된 임시 초안을 복원 제안하는 최대 경과 시간"
            min={10}
            max={1440}
            value={settings.draftExpiryMinutes}
            onChange={v => set('draftExpiryMinutes', v)}
            unit="분"
          />
        </div>
      </AdminSection>

      {/* ── Save bar ──────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 pt-2 pb-4">
        <button
          type="button"
          onClick={async () => {
            setResetting(true);
            try {
              setSettings(await getSiteSettings());
              isDirty.current = false; // 취소 시 dirty 플래그 초기화
            } catch {
              showMessage('error', '설정을 불러오는데 실패했습니다.');
            } finally {
              setResetting(false);
            }
          }}
          disabled={saving || resetting}
          className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {resetting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="opacity-25"
                />
                <path
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  className="opacity-75"
                />
              </svg>
              불러오는 중...
            </>
          ) : (
            '변경 취소'
          )}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="opacity-25"
                />
                <path
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  className="opacity-75"
                />
              </svg>
              저장 중...
            </>
          ) : (
            '설정 저장'
          )}
        </button>
      </div>
    </form>
  );
};

export default SiteSettingsManagement;
