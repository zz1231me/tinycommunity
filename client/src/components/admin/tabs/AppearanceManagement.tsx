// 테마(브랜드 색) 관리 화면. 대표색 하나를 받아 11칸(50~950) 계단을 만들고 그 자리에서 미리 보여 준다.

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Palette, RotateCcw } from 'lucide-react';
import { getSiteSettings, updateSiteSettings } from '../../../api/siteSettings';
import { getApiErrorMessage } from '../../../api/utils';
import { useSiteSettings } from '../../../store/siteSettings';
import { applyTheme } from '../../../utils/applyTheme';
import {
  buildColorScale,
  contrastRatio,
  isWhiteTextReadable,
  SCALE_STEPS,
} from '../../../utils/themeColor';
import { toast } from '../../../utils/toast';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';

/** '지정 안 함' 일 때 쓰이는 기본 색 */
const DEFAULT_PRIMARY = '#545c6b';
const DEFAULT_SECONDARY = '#0d9488';

const PRESETS: Array<{ name: string; primary: string; secondary: string }> = [
  { name: '기본 (그래파이트)', primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY },
  { name: '블루', primary: '#2563eb', secondary: '#0891b2' },
  { name: '그린', primary: '#15803d', secondary: '#0d9488' },
  { name: '퍼플', primary: '#7c3aed', secondary: '#db2777' },
  { name: '오렌지', primary: '#c2410c', secondary: '#0f766e' },
  { name: '레드', primary: '#b91c1c', secondary: '#525252' },
];

function ScalePreview({ hex }: { hex: string }) {
  const scale = buildColorScale(hex);
  if (!scale) return null;
  return (
    <div className="flex overflow-hidden rounded-lg">
      {SCALE_STEPS.map(step => (
        <div
          key={step}
          className="h-8 flex-1"
          style={{ backgroundColor: scale[step] }}
          title={`${step}: ${scale[step]}`}
        />
      ))}
    </div>
  );
}

function ColorField({
  label,
  hint,
  value,
  fallback,
  onChange,
}: {
  label: string;
  hint: string;
  value: string | null;
  fallback: string;
  onChange: (next: string | null) => void;
}) {
  const effective = value ?? fallback;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <input
            type="color"
            aria-label={`${label} 색상 선택`}
            value={effective}
            onChange={e => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-600"
          />
          <input
            type="text"
            aria-label={`${label} 색상 코드`}
            value={effective}
            onChange={e => onChange(e.target.value)}
            spellCheck={false}
            className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-800"
          />
          {value !== null && (
            <button
              type="button"
              onClick={() => onChange(null)}
              title="기본 색으로"
              aria-label={`${label} 기본 색으로`}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <ScalePreview hex={effective} />
    </div>
  );
}

const AppearanceManagement = () => {
  const storeSettings = useSiteSettings(s => s.settings);
  const setStoreSettings = useSiteSettings(s => s.setSettings);

  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** 불러오기 실패. 편집 화면을 열지 않는다. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSiteSettings()
      .then(s => {
        if (cancelled) return;
        setPrimary(s.themePrimaryColor);
        setSecondary(s.themeSecondaryColor);
      })
      .catch(() => {
        // 못 불러온 채로 저장하면 기본 색이 서버의 테마를 덮어쓴다.
        if (!cancelled) setLoadFailed(true);
        toast.error('테마 설정을 불러오지 못했습니다.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // 고르는 즉시 적용하고, 화면을 떠날 때 저장된 값으로 되돌린다.
  useEffect(() => {
    if (loading) return;
    applyTheme(primary, secondary);
  }, [primary, secondary, loading]);

  useEffect(
    () => () => {
      applyTheme(
        useSiteSettings.getState().settings.themePrimaryColor,
        useSiteSettings.getState().settings.themeSecondaryColor
      );
    },
    []
  );

  if (loading) return <LoadingSpinner message="테마 설정을 불러오는 중..." />;

  if (loadFailed) {
    return (
      <div className="alert alert-danger">
        <p className="font-medium">테마 설정을 불러오지 못했습니다.</p>
        <p className="mt-1 text-sm">
          지금 저장하면 기본 색이 실제 테마를 덮어쓸 수 있어, 편집 화면을 열지 않았습니다.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-secondary btn-sm mt-3"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const effectivePrimary = primary ?? DEFAULT_PRIMARY;
  const ratio = contrastRatio(effectivePrimary, '#ffffff');
  const readable = isWhiteTextReadable(effectivePrimary);
  const dirty =
    primary !== storeSettings.themePrimaryColor || secondary !== storeSettings.themeSecondaryColor;

  const save = async () => {
    setSaving(true);
    try {
      // 빈 값은 서버에서 기본색으로 해석한다.
      const updated = await updateSiteSettings({
        themePrimaryColor: primary ?? '',
        themeSecondaryColor: secondary ?? '',
      });
      setStoreSettings(updated);
      applyTheme(updated.themePrimaryColor, updated.themeSecondaryColor);
      toast.success('테마를 저장했습니다.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, '테마를 저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPrimary(storeSettings.themePrimaryColor);
    setSecondary(storeSettings.themeSecondaryColor);
  };

  return (
    <div className="space-y-6">
      <AdminSection
        title="브랜드 색"
        description="대표색 하나를 고르면 밝은 톤부터 어두운 톤까지 11단계를 자동으로 만들어 앱 전체에 적용합니다. 고르는 즉시 이 화면에 반영되며, 저장해야 다른 사람에게도 적용됩니다."
      >
        <div className="card space-y-5 p-5">
          <ColorField
            label="주 색상"
            hint="버튼·링크·강조에 쓰입니다."
            value={primary}
            fallback={DEFAULT_PRIMARY}
            onChange={setPrimary}
          />
          <ColorField
            label="보조 색상"
            hint="배지·차트 등 보조 강조에 쓰입니다."
            value={secondary}
            fallback={DEFAULT_SECONDARY}
            onChange={setSecondary}
          />

          {/* 색을 막지 않고 대비 결과만 알려 준다. */}
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-3 text-xs ${
              readable
                ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
            }`}
          >
            {readable ? (
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            )}
            <span>
              주 색상 위 흰 글씨 명암비 {ratio ? ratio.toFixed(1) : '—'}:1
              {readable
                ? ' — 읽기 좋습니다 (WCAG AA 4.5:1 이상).'
                : ' — 버튼 글자가 잘 보이지 않습니다. 더 어두운 색을 권합니다.'}
            </span>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="프리셋" description="자주 쓰는 조합입니다. 고른 뒤 다듬어도 됩니다.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PRESETS.map(preset => (
            <button
              key={preset.name}
              type="button"
              onClick={() => {
                setPrimary(preset.primary);
                setSecondary(preset.secondary);
              }}
              className="card flex items-center gap-3 p-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span className="flex flex-shrink-0 gap-1">
                <span
                  className="h-6 w-6 rounded-full"
                  style={{ backgroundColor: preset.primary }}
                />
                <span
                  className="h-6 w-6 rounded-full"
                  style={{ backgroundColor: preset.secondary }}
                />
              </span>
              <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                {preset.name}
              </span>
            </button>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="미리보기" description="저장 전에 실제 구성요소로 확인합니다.">
        <div className="card space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary">
              주요 버튼
            </button>
            <button type="button" className="btn-secondary">
              보조 버튼
            </button>
            <span className="badge badge-info">배지</span>
            <a href="#preview" className="text-sm text-primary-600 dark:text-primary-400">
              링크 예시
            </a>
          </div>
          <div className="rounded-lg bg-primary-50 p-3 text-sm text-primary-900 dark:bg-primary-900/30 dark:text-primary-100">
            연한 배경 위의 본문입니다. 알림·안내 영역에 이 조합이 쓰입니다.
          </div>
        </div>
      </AdminSection>

      {dirty && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg dark:border-amber-700 dark:bg-amber-900/30">
          <span className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Palette className="h-4 w-4" />
            저장하지 않은 테마 변경이 있습니다.
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="btn-secondary">
              되돌리기
            </button>
            <button type="button" disabled={saving} onClick={save} className="btn-primary">
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppearanceManagement;
