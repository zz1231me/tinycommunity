// client/src/components/admin/tabs/SiteSettingsManagement.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { FeatureOffNotice } from '../common/FeatureOffNotice';
import { SettingList, SettingRow } from '../common/SettingRow';
import { AlertTriangle } from 'lucide-react';
import {
  getAdminSiteSettings,
  updateSiteSettings,
  uploadSiteAsset,
  SiteSettings,
} from '../../../api/siteSettings';
import { useSiteSettings, DEFAULT_SETTINGS as STORE_DEFAULTS } from '../../../store/siteSettings';
import { cacheSiteIdentity } from '../../../utils/siteIdentityCache';
import { AdminSection } from '../common/AdminSection';
import { ToggleSwitch } from '../../common/ToggleSwitch';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { adminInputCls } from '../common/AdminFormField';

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

  // 이름·설명은 SettingRow 가 왼쪽 열에 그린다 — 이 화면의 다른 항목들과 같은 줄에 선다.
  return (
    <SettingRow label={label} description={hint}>
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

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </SettingRow>
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

  // 이름·설명은 SettingRow 가 왼쪽 열에 그린다 — 이 화면의 다른 항목들과 같은 줄에 선다.
  return (
    <SettingRow label={label} description={description}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          }}
          className="input max-w-[120px]"
        />
        {unit && <span className="text-sm text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>
    </SettingRow>
  );
};

// ─── DEFAULT_SETTINGS ─────────────────────────────────────────────────────────
//
// 스토어의 기본값을 그대로 쓴다. 같은 항목을 여기에 다시 적으면 설정을 추가할 때마다
// 두 곳을 고쳐야 하고, 한쪽을 잊으면 어긋난다.
//
// 다른 점은 사이트 이름·타이틀뿐이다. 서버 값이 오기 전에 기본 이름이 미리 채워져 있으면
// 관리자가 그대로 저장해 버릴 수 있어, 빈 칸으로 두고 placeholder 를 보인다.
const DEFAULT_SETTINGS: SiteSettings = { ...STORE_DEFAULTS, siteName: '', siteTitle: '' };

// ─── Main component ──────────────────────────────────────────────────────────

/** 상태 키와 기본 이름 — 서버 workStatus.ts 와 짝이다(키가 늘면 여기도 늘린다) */
const WORK_STATUS_FIELDS = [
  { key: 'todo', fallback: '할 일' },
  { key: 'doing', fallback: '진행 중' },
  { key: 'done', fallback: '완료' },
] as const;

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
  // 스토어에는 보안 설정(잠금 횟수·bcrypt 라운드·토큰 수명·rate limit·로그 보관)이 없다 —
  // 공개 응답에서 빠지기 때문이다. 그래서 스토어만 믿고 폼을 먼저 열면 그 칸들이 기본값으로
  // 채워지고, 아래 조회가 돌아오기 전에 다른 칸을 건드리면(isDirty) 기본값이 그대로 저장된다.
  // 관리자 조회가 끝날 때까지는 폼을 열지 않는다.
  const [loading, setLoading] = useState(true);
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

  // 기능 설정 화면에서 '설정 열기' 로 들어오면 해당 구역까지 데려간다.
  // 이 페이지는 길어서, 그냥 열어 두면 어디를 보라는 건지 알 수 없다.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('ring-2', 'ring-primary-400', 'rounded-xl');
    const t = setTimeout(
      () => el.classList.remove('ring-2', 'ring-primary-400', 'rounded-xl'),
      2000
    );
    return () => clearTimeout(t);
  }, [hash, loading]);

  // 상품표 편집 — 확률 합계는 화면에서 바로 보여 주고, 최종 검사는 서버가 한다
  const prizeTotal =
    Math.round(
      (settings.lotteryPrizes ?? []).reduce((sum, p) => sum + (Number(p.weight) || 0), 0) * 100
    ) / 100;

  const updatePrize = (index: number, field: 'amount' | 'weight', value: number) => {
    const next = [...(settings.lotteryPrizes ?? [])];
    next[index] = { ...next[index], [field]: Number.isFinite(value) ? value : 0 };
    set('lotteryPrizes', next);
  };
  const addPrize = () =>
    set('lotteryPrizes', [...(settings.lotteryPrizes ?? []), { amount: 100, weight: 1 }]);
  const removePrize = (index: number) =>
    set(
      'lotteryPrizes',
      (settings.lotteryPrizes ?? []).filter((_, i: number) => i !== index)
    );

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
        const data = await getAdminSiteSettings();
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
      cacheSiteIdentity({
        siteName: updated.siteName,
        siteTitle: updated.siteTitle,
        faviconUrl: updated.faviconUrl,
      });
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
        <SettingList>
          <SettingRow label="사이트 이름" description="헤더와 사이드바에 표시되는 이름" required>
            <input
              type="text"
              value={settings.siteName}
              onChange={e => set('siteName', e.target.value)}
              // 빈 칸일 때 보이는 힌트는 지금 쓰이는 이름이어야 한다.
              // 제품 이름을 박아 두면 사이트 이름을 바꿔 둔 곳에서 딴 이름이 비친다.
              placeholder={storeSettings.siteName}
              required
              className="input max-w-sm"
            />
          </SettingRow>

          <SettingRow label="페이지 타이틀" description="브라우저 탭에 표시되는 제목" required>
            <input
              type="text"
              value={settings.siteTitle}
              onChange={e => set('siteTitle', e.target.value)}
              placeholder={storeSettings.siteTitle}
              required
              className="input max-w-sm"
            />
          </SettingRow>

          <SettingRow label="사이트 설명" description="메타 태그, SEO, 로그인 페이지에 사용">
            <textarea
              value={settings.description ?? ''}
              onChange={e => set('description', e.target.value || null)}
              rows={3}
              placeholder="사이트에 대한 간단한 설명을 입력하세요."
              className="input resize-none"
            />
          </SettingRow>
        </SettingList>
      </AdminSection>

      {/* ── 2. 브랜딩 ─────────────────────────────────────────────────────── */}
      <AdminSection title="브랜딩">
        <SettingList>
          <AssetUploader
            label="로고 이미지"
            hint="PNG · JPG · WebP · GIF 지원 — 파일 업로드 또는 외부 URL 직접 입력"
            accept="image/png,image/jpeg,image/webp,image/gif"
            value={settings.logoUrl}
            onChange={url => set('logoUrl', url)}
          />
          <AssetUploader
            label="파비콘"
            hint=".ico · PNG · JPG 지원 — 브라우저 탭에 표시되는 아이콘"
            accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/jpeg,image/webp,.ico"
            value={settings.faviconUrl}
            onChange={url => set('faviconUrl', url)}
          />
        </SettingList>
      </AdminSection>

      {/* ── 3. 회원가입 설정 ───────────────────────────────────────────────── */}
      <AdminSection title="회원가입 설정">
        <SettingList>
          <SettingRow
            label="회원가입 허용"
            description="끄면 로그인 페이지에서 회원가입 버튼이 사라집니다."
          >
            <ToggleSwitch
              checked={settings.allowRegistration}
              label="회원가입 허용"
              onChange={v => {
                set('allowRegistration', v);
                if (!v) set('requireApproval', false);
              }}
            />
          </SettingRow>

          {settings.allowRegistration && (
            <SettingRow
              label="신규 가입 승인 필요"
              description="켜면 관리자가 승인하기 전까지 신규 가입자가 로그인할 수 없습니다."
            >
              <ToggleSwitch
                checked={settings.requireApproval}
                label="신규 가입 승인 필요"
                onChange={v => set('requireApproval', v)}
              />
            </SettingRow>
          )}
        </SettingList>
      </AdminSection>

      {/* ── 4. 댓글 설정 ───────────────────────────────────────────────────── */}
      <AdminSection title="댓글 설정">
        <div className="space-y-4">
          <SettingRow
            label="비로그인 댓글 허용"
            description="켜면 로그인하지 않은 사람도 댓글을 쓸 수 있습니다."
          >
            <ToggleSwitch
              checked={settings.allowGuestComment}
              label="비로그인 댓글 허용"
              onChange={v => set('allowGuestComment', v)}
            />
          </SettingRow>
          <SettingList>
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
          </SettingList>

          {/* 업무 상태를 부르는 말.
              키(todo/doing/done)는 코드가 고정한다 — 저장된 값과 동작('진행 중'이면
              담당자 자동 지정)이 이름에 흔들리면 안 된다. 화면에 뜨는 말만 팀에 맞춘다. */}
          <div className="pt-2">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              업무 상태 이름
            </h4>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              업무용 게시판의 상태를 팀에서 부르는 말로 바꿉니다. 비워 두면 기본 이름을 씁니다.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {WORK_STATUS_FIELDS.map(field => (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    {field.fallback}
                  </span>
                  <input
                    type="text"
                    maxLength={20}
                    value={settings.workStatusLabels?.[field.key] ?? ''}
                    placeholder={field.fallback}
                    onChange={e =>
                      set('workStatusLabels', {
                        ...settings.workStatusLabels,
                        [field.key]: e.target.value,
                      })
                    }
                    className={adminInputCls('w-full')}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </AdminSection>

      {/* ── 포인트 뽑기 ────────────────────────────────────────────────────── */}
      <AdminSection id="lottery" title="포인트 뽑기">
        <FeatureOffNotice feature="tools.lottery" name="포인트 뽑기" />
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            확률·금액·횟수를 여기서 정합니다. 추첨은 서버에서만 이뤄지고, 아래 확률표는 사용자
            화면에도 그대로 보입니다. (기능 자체를 켜고 끄는 것은 <b>기능 설정</b> 탭입니다)
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                상품과 확률
              </h4>
              <span
                className={`text-xs font-semibold tabular-nums ${
                  prizeTotal > 100 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                합계 {prizeTotal}%{' '}
                {prizeTotal <= 100 &&
                  `· 미당첨 ${(100 - prizeTotal).toFixed(2).replace(/\.?0+$/, '')}%`}
              </span>
            </div>
            {prizeTotal > 100 && (
              <p className="text-xs font-medium text-red-500">
                확률의 합이 100%를 넘으면 뒤쪽 상품은 영영 나오지 않습니다. 저장이 거부됩니다.
              </p>
            )}
            <div className="space-y-2">
              {(settings.lotteryPrizes ?? []).map((prize, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={prize.amount}
                    onChange={e => updatePrize(i, 'amount', Number(e.target.value))}
                    className={adminInputCls('w-32')}
                    aria-label={`${i + 1}번 상품 포인트`}
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">P</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={prize.weight}
                    onChange={e => updatePrize(i, 'weight', Number(e.target.value))}
                    className={adminInputCls('w-24')}
                    aria-label={`${i + 1}번 상품 확률`}
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
                  <button
                    type="button"
                    onClick={() => removePrize(i)}
                    className="ml-auto rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addPrize}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              + 상품 추가
            </button>
          </div>

          <SettingList>
            <NumberInput
              label="하루 뽑기 횟수"
              description="한 사람이 하루에 뽑을 수 있는 횟수"
              min={1}
              max={100}
              value={settings.lotteryDailyLimit}
              onChange={v => set('lotteryDailyLimit', v)}
              unit="회"
            />
            <NumberInput
              label="뽑기 참가비"
              description="한 번 뽑을 때마다 깎이는 포인트. 0 이면 공짜입니다."
              min={0}
              max={100000}
              value={settings.lotteryDrawCost}
              onChange={v => set('lotteryDrawCost', v)}
              unit="P"
            />
            <NumberInput
              label="출석 포인트"
              description="하루 한 번 접속하면 자동 지급"
              min={0}
              max={100000}
              value={settings.attendanceBonus}
              onChange={v => set('attendanceBonus', v)}
              unit="P"
            />
          </SettingList>
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

          <SettingList>
            <SettingRow
              label="점검 모드 활성화"
              description="켜면 관리자·매니저를 뺀 모든 사람에게 점검 화면이 보입니다."
            >
              <ToggleSwitch
                checked={settings.maintenanceMode}
                label="점검 모드 활성화"
                tone="danger"
                onChange={v => set('maintenanceMode', v)}
              />
            </SettingRow>

            {settings.maintenanceMode && (
              <SettingRow label="점검 안내 메시지" description="비워 두면 기본 문구가 나갑니다.">
                <textarea
                  value={settings.maintenanceMessage ?? ''}
                  onChange={e => set('maintenanceMessage', e.target.value || null)}
                  rows={3}
                  placeholder="현재 서비스 점검 중입니다. 잠시 후 다시 이용해주세요."
                  className="input resize-none"
                />
              </SettingRow>
            )}
          </SettingList>
        </div>
      </AdminSection>

      {/* ── 6. 로그인 페이지 설정 ─────────────────────────────────────────── */}
      <AdminSection title="로그인 페이지 설정">
        <div>
          <label className="form-label">로그인 페이지 안내 메시지</label>
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
            <SettingList>
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
            </SettingList>
          </div>
        </div>
      </AdminSection>

      {/* ── 8. 파일 크기 제한 ─────────────────────────────────────────────── */}
      <AdminSection id="file-limits" title="파일 크기 제한 (카테고리별)">
        <FeatureOffNotice feature="post.attachments" name="파일 첨부" />
        <SettingList>
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
        </SettingList>
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
        <SettingList>
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
        </SettingList>
      </AdminSection>

      {/* ── 13. 에디터 설정 ───────────────────────────────────────────────── */}
      <AdminSection id="editor" title="에디터 설정">
        <SettingList>
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
        </SettingList>
      </AdminSection>

      {/* ── Save bar ──────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 pt-2 pb-4">
        <button
          type="button"
          onClick={async () => {
            setResetting(true);
            try {
              setSettings(await getAdminSiteSettings());
              isDirty.current = false; // 취소 시 dirty 플래그 초기화
            } catch {
              showMessage('error', '설정을 불러오는데 실패했습니다.');
            } finally {
              setResetting(false);
            }
          }}
          disabled={saving || resetting}
          className="px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2"
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
        <button type="submit" disabled={saving} className="btn-primary">
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
