// 본인 메뉴 숨기기. 안 쓰는 메뉴를 사이드바·사용자 메뉴에서 뺀다.
// 권한이 아니라 보기 설정이라 주소로 들어가면 그대로 열린다. 스위치를 누르면 바로 저장한다.

import { useState } from 'react';
import { LayoutList } from 'lucide-react';
import { saveHiddenMenus } from '../api/features';
import { getApiErrorMessage } from '../api/utils';
import { HIDEABLE_MENUS } from '../constants/menus';
import { useFeatures } from '../store/features';
import { toast } from '../utils/toast';
import { ToggleSwitch } from './common/ToggleSwitch';

export function MenuSettings() {
  const features = useFeatures(s => s.features);
  const hidden = useFeatures(s => s.hidden);
  const setHidden = useFeatures(s => s.setHidden);
  const [saving, setSaving] = useState(false);

  // 관리자가 꺼 둔 기능은 숨기고 말고가 없으니 보여 주지 않는다
  const menus = HIDEABLE_MENUS.filter(m => features[m.key] !== false);

  const toggle = async (key: string, show: boolean) => {
    const before = hidden;
    const next = show ? hidden.filter(k => k !== key) : [...hidden, key];
    setHidden(next); // 메뉴가 바로 사라지거나 나타나게 먼저 반영한다
    setSaving(true);
    try {
      setHidden(await saveHiddenMenus(next));
    } catch (err) {
      setHidden(before);
      toast.error(getApiErrorMessage(err, '메뉴 설정을 저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <LayoutList className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <h3 className="card-title">메뉴 표시</h3>
      </div>
      <p className="px-4 pt-3 text-xs text-slate-500 dark:text-slate-400 sm:px-6">
        안 쓰는 메뉴를 사이드바에서 숨깁니다. 숨겨도 주소로 들어가면 그대로 열리고, 다른 사람에게는
        영향이 없습니다.
      </p>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {menus.map(menu => {
          const shown = !hidden.includes(menu.key);
          return (
            <div key={menu.key} className="flex items-center gap-4 px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {menu.label}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{menu.description}</p>
              </div>
              <ToggleSwitch
                checked={shown}
                label={`${menu.label} 메뉴 보이기`}
                disabled={saving}
                onChange={next => void toggle(menu.key, next)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
