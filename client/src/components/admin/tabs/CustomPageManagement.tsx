// CustomPageManagement.tsx — 관리자 커스텀 HTML 페이지 CRUD.
// 저장한 HTML은 사용자 화면에서 sandbox iframe으로 격리 렌더된다(앱과 분리).
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, ExternalLink, Save, X } from 'lucide-react';
import {
  fetchAllPages,
  createCustomPage,
  updateCustomPage,
  deleteCustomPage,
  type CustomPage,
  type CustomPageInput,
} from '../../../api/customPages';
import { AdminSection } from '../common/AdminSection';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';
import { getApiErrorMessage } from '../../../api/utils';

const EMPTY: CustomPageInput = { slug: '', title: '', html: '', isPublished: false, order: 0 };

export const CustomPageManagement = () => {
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null=목록, 'new'=신규
  const [form, setForm] = useState<CustomPageInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CustomPage | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setPages(await fetchAllPages());
    } catch {
      toast.error('목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = () => {
    setForm(EMPTY);
    setEditingId('new');
  };
  const startEdit = (p: CustomPage) => {
    setForm({ slug: p.slug, title: p.title, html: p.html, isPublished: p.isPublished, order: p.order });
    setEditingId(p.id);
  };
  const cancel = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (editingId === 'new') await createCustomPage(form);
      else if (editingId) await updateCustomPage(editingId, form);
      toast.success('저장했습니다.');
      cancel();
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, '저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const p = confirmDelete;
    setConfirmDelete(null);
    try {
      await deleteCustomPage(p.id);
      toast.success('삭제했습니다.');
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

  // ── 편집 폼 ──
  if (editingId) {
    return (
      <AdminSection
        title={editingId === 'new' ? 'HTML 페이지 추가' : 'HTML 페이지 수정'}
        description="입력한 HTML은 사용자 화면에서 격리(sandbox)된 iframe으로 렌더됩니다. 스크립트도 동작하지만 앱의 쿠키·데이터엔 접근할 수 없습니다."
        actions={
          <button type="button" onClick={cancel} className="btn-secondary gap-1.5">
            <X className="h-4 w-4" />
            취소
          </button>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                제목 *
              </label>
              <input
                className="input"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="예: 사내 가이드"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                주소(slug) *
              </label>
              <input
                className="input font-mono"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="guide (영문 소문자·숫자·하이픈)"
              />
              <p className="mt-1 text-xs text-slate-400">
                /dashboard/pages/<span className="font-mono">{form.slug || 'slug'}</span> 로 열립니다.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              HTML
            </label>
            {/* 편집(좌) + 실시간 미리보기(우, 격리 iframe) */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <textarea
                className="input min-h-[360px] font-mono text-xs leading-relaxed"
                value={form.html}
                onChange={e => setForm(f => ({ ...f, html: e.target.value }))}
                placeholder="<!doctype html><html>... 내 HTML을 그대로 붙여넣으세요 ...</html>"
                spellCheck={false}
              />
              <div className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                  미리보기 (사용자 화면과 동일하게 격리 렌더)
                </div>
                <iframe
                  title="미리보기"
                  srcDoc={form.html}
                  sandbox="allow-scripts allow-popups allow-forms allow-modals"
                  className="w-full flex-1 border-0 bg-white"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-secondary-600 focus:ring-secondary-500"
              />
              게시(사이드바에 노출)
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              정렬 순서
              <input
                type="number"
                className="input w-24"
                value={form.order}
                onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) || 0 }))}
              />
            </label>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" onClick={save} disabled={saving} className="btn-primary gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </AdminSection>
    );
  }

  // ── 목록 ──
  if (loading && pages.length === 0) return <LoadingSpinner message="불러오는 중..." />;

  return (
    <>
    <AdminSection
      title={`HTML 페이지 (${pages.length})`}
      description="관리자가 직접 HTML을 넣어 만드는 커스텀 페이지입니다."
      actions={
        <button type="button" onClick={startNew} className="btn-primary gap-1.5">
          <Plus className="h-4 w-4" />
          새 페이지
        </button>
      }
    >
      {pages.length === 0 ? (
        <div className="py-12 text-center text-slate-500 dark:text-slate-400">
          아직 페이지가 없습니다. “새 페이지”로 만들어보세요.
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map(p => (
            <div key={p.id} className="card flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{p.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.isPublished
                        ? 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {p.isPublished ? '게시됨' : '비공개'}
                  </span>
                </div>
                <div className="truncate font-mono text-xs text-slate-400">/dashboard/pages/{p.slug}</div>
              </div>
              {p.isPublished && (
                <a
                  href={`/dashboard/pages/${p.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  title="새 탭에서 보기"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => startEdit(p)}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(p)}
                title="삭제"
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminSection>

    <ConfirmationModal
      open={confirmDelete !== null}
      title="페이지 삭제"
      message={`"${confirmDelete?.title ?? ''}" 페이지를 삭제할까요?`}
      variant="danger"
      onConfirm={doDelete}
      onCancel={() => setConfirmDelete(null)}
    />
    </>
  );
};

export default CustomPageManagement;
