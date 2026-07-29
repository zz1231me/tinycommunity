// CustomPageManagement.tsx — 관리자 커스텀 HTML 페이지 CRUD.
// 두 가지 방식: (1) HTML 직접 입력, (2) 폴더를 ZIP으로 압축해 업로드(index.html + 자산).
// 저장된 내용은 사용자 화면에서 sandbox iframe으로 격리 렌더된다(앱과 분리).
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, ExternalLink, Save, X, UploadCloud, FolderArchive, Code } from 'lucide-react';
import {
  fetchAllPages,
  createCustomPage,
  updateCustomPage,
  deleteCustomPage,
  uploadPageBundle,
  fetchBundleFiles,
  type CustomPage,
  type CustomPageInput,
} from '../../../api/customPages';
import { AdminSection } from '../common/AdminSection';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';
import { getApiErrorMessage } from '../../../api/utils';

const EMPTY: CustomPageInput = { slug: '', title: '', html: '', isPublished: false, order: 0 };
type Mode = 'html' | 'bundle';

export const CustomPageManagement = () => {
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null=목록, 'new'=신규
  const [form, setForm] = useState<CustomPageInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CustomPage | null>(null);

  // 번들 모드 상태
  const [mode, setMode] = useState<Mode>('html');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [bundleEntry, setBundleEntry] = useState('');
  const [bundleHtmlFiles, setBundleHtmlFiles] = useState<string[]>([]);
  const [editingSlug, setEditingSlug] = useState(''); // 편집 시작 시점의 서버 slug(미리보기 링크용)

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

  const resetBundle = () => {
    setZipFile(null);
    setUploadPct(0);
    setBundleEntry('');
    setBundleHtmlFiles([]);
    setEditingSlug('');
  };

  const startNew = () => {
    setForm(EMPTY);
    setMode('html');
    resetBundle();
    setEditingId('new');
  };
  const startEdit = (p: CustomPage) => {
    setForm({ slug: p.slug, title: p.title, html: p.html, isPublished: p.isPublished, order: p.order });
    setEditingId(p.id);
    setEditingSlug(p.slug);
    resetBundle();
    if (p.bundlePath) {
      setMode('bundle');
      // 진입 파일 선택용 목록 로드
      fetchBundleFiles(p.id)
        .then(r => {
          setBundleHtmlFiles(r.htmlFiles);
          setBundleEntry(r.entryFile);
        })
        .catch(() => {
          setBundleEntry(p.entryFile ?? 'index.html');
        });
    } else {
      setMode('html');
    }
  };
  const cancel = () => {
    setEditingId(null);
    setForm(EMPTY);
    resetBundle();
  };

  const save = async () => {
    if (saving) return;
    // 신규 번들 페이지는 ZIP이 반드시 필요
    if (mode === 'bundle' && editingId === 'new' && !zipFile) {
      toast.error('업로드할 ZIP 파일을 선택해주세요.');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'html') {
        if (editingId === 'new') await createCustomPage(form);
        else if (editingId) await updateCustomPage(editingId, form);
      } else {
        // 번들 모드: (신규면) 페이지 먼저 생성 → ZIP 업로드 → 필드/진입파일 저장
        let id = editingId;
        if (id === 'new') {
          const created = await createCustomPage({ ...form, html: '' });
          id = created.id;
        }
        let entryToSave = bundleEntry;
        if (zipFile && id) {
          const r = await uploadPageBundle(id, zipFile, setUploadPct);
          setBundleHtmlFiles(r.htmlFiles);
          entryToSave = bundleEntry && r.htmlFiles.includes(bundleEntry) ? bundleEntry : r.entryFile;
          setBundleEntry(entryToSave);
        }
        if (id) {
          await updateCustomPage(id, {
            ...form,
            html: '',
            entryFile: entryToSave || undefined,
          });
        }
      }
      toast.success('저장했습니다.');
      cancel();
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, '저장에 실패했습니다.'));
    } finally {
      setSaving(false);
      setUploadPct(0);
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
    const isNew = editingId === 'new';
    return (
      <AdminSection
        title={isNew ? 'HTML 페이지 추가' : 'HTML 페이지 수정'}
        description="저장된 내용은 사용자 화면에서 격리(sandbox)된 iframe으로 렌더됩니다. 스크립트도 동작하지만 앱의 쿠키·데이터엔 접근할 수 없습니다."
        actions={
          <button type="button" onClick={cancel} className="btn-secondary gap-1.5">
            <X className="h-4 w-4" />
            취소
          </button>
        }
      >
        <div className="space-y-4">
          {/* 방식 선택 (신규만 전환 가능 — 기존 페이지는 방식 고정) */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => isNew && setMode('html')}
              disabled={!isNew && mode !== 'html'}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'html'
                  ? 'border-secondary-500 bg-secondary-50 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-300'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
              } ${!isNew && mode !== 'html' ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <Code className="h-4 w-4" />
              HTML 직접 입력
            </button>
            <button
              type="button"
              onClick={() => isNew && setMode('bundle')}
              disabled={!isNew && mode !== 'bundle'}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'bundle'
                  ? 'border-secondary-500 bg-secondary-50 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-300'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
              } ${!isNew && mode !== 'bundle' ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <FolderArchive className="h-4 w-4" />
              폴더(ZIP) 업로드
            </button>
          </div>

          {/* 공통: 제목 / slug */}
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

          {/* 모드별 본문 */}
          {mode === 'html' ? (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                HTML
              </label>
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
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                폴더(ZIP) 업로드
              </label>
              {/* 드롭존/파일선택 */}
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-8 text-center transition-colors hover:border-secondary-400 hover:bg-secondary-50/40 dark:border-slate-700 dark:hover:border-secondary-600 dark:hover:bg-secondary-900/10">
                <UploadCloud className="h-8 w-8 text-slate-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {zipFile ? zipFile.name : 'index.html이 포함된 폴더를 ZIP으로 압축해 선택'}
                </span>
                <span className="text-xs text-slate-400">.zip · 최대 30MB · 상대경로 자산 지원</span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0] ?? null;
                    setZipFile(f);
                  }}
                />
              </label>

              {uploadPct > 0 && uploadPct < 100 && (
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-secondary-500 transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              )}

              {/* 진입 파일 선택 (업로드/편집으로 목록이 있을 때) */}
              {bundleHtmlFiles.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    처음 열릴 파일
                  </label>
                  <select
                    className="input"
                    value={bundleEntry}
                    onChange={e => setBundleEntry(e.target.value)}
                  >
                    {bundleHtmlFiles.map(f => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">
                    기본은 index.html입니다. 다른 파일을 시작 페이지로 지정할 수 있어요.
                  </p>
                </div>
              )}

              {!isNew && editingSlug && (
                <a
                  href={`/dashboard/pages/${editingSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-secondary-600 hover:underline dark:text-secondary-400"
                >
                  <ExternalLink className="h-4 w-4" />
                  현재 저장된 페이지 미리보기(새 탭)
                </a>
              )}

              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                자산은 <span className="font-mono">./style.css</span> 처럼 <b>상대경로</b>로 참조하세요.
                서버 실행 파일(.php/.jsp/.sh 등)은 업로드가 거부됩니다. 페이지는 앱과 격리된
                sandbox에서 렌더됩니다.
              </p>
            </div>
          )}

          {/* 공통: 게시 / 정렬 */}
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
        description="관리자가 HTML을 직접 넣거나 폴더(ZIP)를 업로드해 만드는 커스텀 페이지입니다."
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
                    {p.bundlePath && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        <FolderArchive className="h-3 w-3" />
                        폴더
                      </span>
                    )}
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
