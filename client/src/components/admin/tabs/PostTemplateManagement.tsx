// 글 템플릿 관리. 회의록·보고서처럼 틀이 정해진 글을 미리 만들어 둔다.
//
// 본문은 글과 같은 자리에서 그려지므로 저장할 때 서버가 글과 똑같이 씻는다. 여기서는
// HTML 을 그대로 적을 수 있게 두되(간단한 틀은 <h2>·<ul> 로 충분하다) 미리보기로 확인시킨다.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  fetchAdminPostTemplates,
  createPostTemplate,
  updatePostTemplate,
  deletePostTemplate,
  type AdminPostTemplate,
  type TemplateInput,
} from '../../../api/postTemplates';
import { getAllBoardsWithManagers } from '../../../api/boardManagers';
import { templateKeys, adminKeys } from '../../../api/queryKeys';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { ListError, ListLoading, ListState } from '../../common/ListState';
import { toast } from '../../../utils/toast';
import { getApiErrorMessage } from '../../../api/utils';
import { sanitizeHTML } from '../../../utils/htmlSanitizer';

const EMPTY: TemplateInput = {
  name: '',
  description: '',
  boardType: '',
  title: '',
  content: '',
  order: 0,
  isActive: true,
};

export default function PostTemplateManagement() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminPostTemplate | null>(null);
  const [form, setForm] = useState<TemplateInput>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminPostTemplate | null>(null);

  const {
    data: templates = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: templateKeys.admin,
    queryFn: ({ signal }) => fetchAdminPostTemplates(signal),
  });

  const { data: boards = [] } = useQuery({
    queryKey: adminKeys.boards.all,
    queryFn: () => getAllBoardsWithManagers(),
    staleTime: 5 * 60_000,
  });

  const done = (message: string) => {
    toast.success(message);
    // 쓰는 사람 쪽 목록도 함께 맞춘다
    void queryClient.invalidateQueries({ queryKey: templateKeys.all });
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY);
  };

  const save = useMutation({
    mutationFn: (input: TemplateInput) =>
      editing ? updatePostTemplate(editing.id, input) : createPostTemplate(input),
    onSuccess: () => done(editing ? '템플릿을 저장했습니다.' : '템플릿을 만들었습니다.'),
    onError: err => toast.error(getApiErrorMessage(err, '템플릿을 저장하지 못했습니다.')),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deletePostTemplate(id),
    onSuccess: () => {
      toast.success('템플릿을 지웠습니다.');
      void queryClient.invalidateQueries({ queryKey: templateKeys.all });
      setDeleteTarget(null);
    },
    onError: err => toast.error(getApiErrorMessage(err, '템플릿을 지우지 못했습니다.')),
  });

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  };

  const openEdit = (template: AdminPostTemplate) => {
    setEditing(template);
    setForm({
      name: template.name,
      description: template.description ?? '',
      boardType: template.boardType ?? '',
      title: template.title ?? '',
      content: template.content,
      order: template.order,
      isActive: template.isActive,
    });
    setShowForm(true);
  };

  const boardName = (id: string | null) =>
    id ? (boards.find(b => b.id === id)?.name ?? id) : '모든 게시판';

  return (
    <AdminSection
      id="post-templates"
      title="글 템플릿"
      description="회의록·보고서처럼 틀이 정해진 글을 미리 만들어 둡니다. 글쓰기 화면에서 고르면 제목과 본문이 채워집니다."
      actions={
        <button type="button" onClick={openNew} className="btn-primary text-xs">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />새 템플릿
        </button>
      }
    >
      {isLoading ? (
        <ListLoading />
      ) : isError ? (
        <ListError what="템플릿" />
      ) : templates.length === 0 ? (
        <ListState size="roomy">
          아직 템플릿이 없습니다.
          <br />
          자주 쓰는 글의 틀을 만들어 두면 글쓰기에서 바로 고를 수 있습니다.
        </ListState>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {templates.map(template => (
            <li key={template.id} className="flex items-start gap-3 py-3">
              <FileText
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {template.name}
                  </span>
                  {!template.isActive && (
                    <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      꺼 둠
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {boardName(template.boardType)}
                  {template.description ? ` · ${template.description}` : ''}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(template)}
                  aria-label={`${template.name} 고치기`}
                  className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(template)}
                  aria-label={`${template.name} 지우기`}
                  className="rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <form
          onSubmit={e => {
            e.preventDefault();
            save.mutate(form);
          }}
          className="mt-4 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">이름</span>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                maxLength={100}
                placeholder="주간 회의록"
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                쓰이는 게시판
              </span>
              <select
                value={form.boardType ?? ''}
                onChange={e => setForm(f => ({ ...f, boardType: e.target.value }))}
                className="input mt-1"
              >
                <option value="">모든 게시판</option>
                {boards.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              설명 (고르는 자리에 함께 보입니다)
            </span>
            <input
              value={form.description ?? ''}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              maxLength={300}
              placeholder="안건·결정·할 일 세 칸으로 적는 틀"
              className="input mt-1"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              미리 넣을 제목 (비우면 제목은 그대로 빈칸)
            </span>
            <input
              value={form.title ?? ''}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              maxLength={200}
              placeholder="주간 회의록 ("
              className="input mt-1"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              본문 (HTML)
            </span>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              required
              rows={8}
              placeholder={'<h2>안건</h2>\n<ul><li></li></ul>\n<h2>결정</h2>'}
              className="input mt-1 font-mono text-xs"
            />
          </label>

          {form.content.trim() && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                미리보기
              </p>
              <div
                className="ck-content text-sm"
                // 관리자가 적은 HTML 이지만 미리보기도 씻어서 그린다. 서버도 저장할 때 다시 씻는다.
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(form.content) }}
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.isActive !== false}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                />
                켜 둠
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                순서
                <input
                  type="number"
                  value={form.order ?? 0}
                  onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))}
                  className="input w-20"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="btn-secondary text-xs"
              >
                취소
              </button>
              <button type="submit" disabled={save.isPending} className="btn-primary text-xs">
                {editing ? '저장' : '만들기'}
              </button>
            </div>
          </div>
        </form>
      )}

      <ConfirmationModal
        open={deleteTarget !== null}
        title="템플릿을 지울까요?"
        message={`'${deleteTarget?.name ?? ''}' 을(를) 지웁니다. 이미 이 틀로 쓴 글은 그대로 남습니다.`}
        confirmLabel="지우기"
        variant="danger"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminSection>
  );
}
