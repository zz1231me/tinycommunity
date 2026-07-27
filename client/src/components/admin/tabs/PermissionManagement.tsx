// PermissionManagement.tsx - 권한 관리 컴포넌트

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Info, Map, Table2, AlertTriangle, RotateCw } from 'lucide-react';
import { useBoardManagement } from '../../../hooks/admin/useBoardManagement';
import { useRoleManagement } from '../../../hooks/admin/useRoleManagement';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { PermissionGraph } from '../PermissionGraph';
import { fetchWikiPermissions, updateWikiPermissions } from '../../../api/admin';
import { toast } from '../../../utils/toast';

// 토글 스위치 — 체크박스를 대체. 접근성을 위해 role="switch" + aria-checked 사용.
// 트랙은 단일 <button>이며 내부엔 presentational <span>만 둔다(중첩 인터랙티브 요소 금지).
const Toggle = ({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-800 ${
      checked ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'
    }`}
  >
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      }`}
    />
  </button>
);

// 위키 자동 저장 상태 표시 — 이모지 대신 lucide 아이콘 + 절제된 색상.
const WikiSaveStatus = ({ saving }: { saving: boolean }) =>
  saving ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      저장 중
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <Check className="h-3.5 w-3.5" />
      자동 저장됨
    </span>
  );

export const PermissionManagement = () => {
  const {
    boards,
    permissions: boardPermissions,
    fetchBoards,
    fetchBoardPermissions,
    updatePermission,
    saveAllPermissions,
    discardChanges,
    dirtyBoards,
    saving,
    loading: loadingBoards,
    fetchError,
  } = useBoardManagement();

  const { roles, fetchRoles, loading: loadingRoles } = useRoleManagement();

  const [showGraph, setShowGraph] = useState(false);
  const [wikiRoles, setWikiRoles] = useState<string[]>([]);
  const [wikiSaving, setWikiSaving] = useState(false);
  // 저장 직렬화용 — 저장 중 들어온 후속 토글의 최신 상태를 적재(coalescing)해 클릭 유실 방지
  const wikiSavingRef = useRef(false);
  const wikiPendingRef = useRef<string[] | null>(null);
  // wikiRoles의 최신 스냅샷(ref) — setState updater 비동기 실행에 의존하지 않고 동기 계산하기 위함.
  const wikiRolesRef = useRef<string[]>([]);

  const loadWikiPermissions = useCallback(async () => {
    try {
      const data = await fetchWikiPermissions();
      const roles = data.roles ?? [];
      wikiRolesRef.current = roles;
      setWikiRoles(roles);
    } catch {
      // ignore
    }
  }, []);

  // 최신 위키 역할 목록을 직렬로 저장. 저장 중 쌓인 변경은 끝난 뒤 이어서 저장(클릭 유실 방지)
  const flushWikiSave = useCallback(
    async (roles: string[]) => {
      wikiSavingRef.current = true;
      setWikiSaving(true);
      try {
        const data = await updateWikiPermissions(roles);
        // 대기 중 후속 변경이 없을 때만 서버 정규화 결과를 반영(있으면 그게 최신이므로 덮어쓰지 않음)
        if (!wikiPendingRef.current && data.roles) {
          wikiRolesRef.current = data.roles;
          setWikiRoles(data.roles);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('위키 권한 저장 실패', err);
        toast.error('위키 권한 저장에 실패했습니다.');
        wikiPendingRef.current = null;
        await loadWikiPermissions(); // 실패 시 서버 상태로 롤백
      } finally {
        wikiSavingRef.current = false;
        if (wikiPendingRef.current) {
          const next = wikiPendingRef.current;
          wikiPendingRef.current = null;
          await flushWikiSave(next);
        } else {
          setWikiSaving(false);
        }
      }
    },
    [loadWikiPermissions]
  );

  const toggleWikiRole = (roleId: string) => {
    // ref(최신 스냅샷)에서 동기 계산 — setState updater 지연 실행 시 next가 빈 배열로 읽혀
    // 빈 역할 목록이 저장(전체 위키 권한 삭제)되던 버그 방지. 저장 중이면 대기열에 적재(드롭 방지).
    const next = wikiRolesRef.current.includes(roleId)
      ? wikiRolesRef.current.filter(r => r !== roleId)
      : [...wikiRolesRef.current, roleId];
    wikiRolesRef.current = next;
    setWikiRoles(next);
    if (wikiSavingRef.current) {
      wikiPendingRef.current = next;
      return;
    }
    void flushWikiSave(next);
  };

  useEffect(() => {
    fetchBoards();
    fetchRoles();
    loadWikiPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (boards.length > 0) {
      fetchBoardPermissions(boards);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards]);

  // 미저장 변경이 있으면 페이지 이탈(새로고침/닫기) 시 경고 — 자동저장이 아니므로 유실 방지
  useEffect(() => {
    if (dirtyBoards.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyBoards]);

  if (loadingBoards || loadingRoles) return <LoadingSpinner message="권한 설정을 불러오는 중..." />;

  const onPermissionToggle = (
    boardId: string,
    roleId: string,
    type: 'canRead' | 'canWrite' | 'canDelete'
  ) => {
    updatePermission(boardId, roleId, type, roles);
  };

  const handleSaveAll = async () => {
    const { failed } = await saveAllPermissions();
    if (failed.length === 0) {
      toast.success('게시판 권한이 저장되었습니다.');
    } else {
      toast.error(`${failed.length}개 게시판 권한 저장에 실패했습니다.`);
    }
  };

  const dirtyCount = dirtyBoards.size;
  const graphAccesses = Object.entries(boardPermissions).flatMap(([boardId, perms]) =>
    perms.map(p => ({
      boardId,
      roleId: p.roleId,
      canRead: p.canRead,
      canWrite: p.canWrite,
    }))
  );

  return (
    <div className="space-y-8">
      {fetchError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {fetchError} 표시된 권한이 실제와 다를 수 있으니 저장 전 다시 불러오세요.
          </span>
          <button
            type="button"
            onClick={() => fetchBoards()}
            disabled={loadingBoards}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loadingBoards ? 'animate-spin' : ''}`} />
            다시 불러오기
          </button>
        </div>
      )}
      <AdminSection title="위키 편집 권한">
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              선택된 역할만 위키 페이지를 생성·수정·삭제할 수 있습니다.
            </p>
            <WikiSaveStatus saving={wikiSaving} />
          </div>
          <div className="flex flex-wrap gap-2.5">
            {roles.map(role => {
              const active = wikiRoles.includes(role.id);
              // 펄(버튼) 자체가 스위치 — 내부에 별도 button을 두면 중첩 인터랙티브 요소가 되어
              // 클릭 이벤트가 두 번(내부+버블링) 발화해 토글이 상쇄되는 버그가 생긴다.
              // 따라서 트랙은 presentational <span>으로만 그린다.
              return (
                <button
                  key={role.id}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={`${role.name} 위키 권한`}
                  onClick={() => toggleWikiRole(role.id)}
                  disabled={wikiSaving}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                    active
                      ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                      active ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        active ? 'translate-x-[18px]' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                  {role.name}
                </button>
              );
            })}
          </div>
          <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            읽기는 모든 인증 사용자에게 허용됩니다. 이 설정은 쓰기(생성·수정·삭제)에만 적용됩니다.
          </p>
        </div>
      </AdminSection>

      <AdminSection
        title="게시판별 권한"
        actions={
          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
              <button
                type="button"
                onClick={discardChanges}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50"
              >
                변경 취소
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving || dirtyCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? '저장 중' : dirtyCount > 0 ? `저장 (${dirtyCount})` : '저장됨'}
            </button>
            <button
              type="button"
              onClick={() => setShowGraph(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50"
            >
              {showGraph ? (
                <>
                  <Table2 className="h-4 w-4" />
                  테이블 보기
                </>
              ) : (
                <>
                  <Map className="h-4 w-4" />
                  관계도 보기
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {boards.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              게시판이 없습니다. 먼저 게시판을 생성해주세요.
            </div>
          ) : (
            boards.map(board => {
              const isDirty = dirtyBoards.has(board.id);
              return (
                <div
                  key={board.id}
                  className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-baseline gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                      {board.name}
                      <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                        {board.id}
                      </span>
                    </h3>
                    {isDirty ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        변경됨 (미저장)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
                        <Check className="h-3.5 w-3.5" />
                        저장됨
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    {/* 칼럼 폭 고정 — 게시판 카드마다 토글 칼럼이 동일 위치로 정렬되도록 */}
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col />
                        <col style={{ width: '90px' }} />
                        <col style={{ width: '90px' }} />
                        <col style={{ width: '90px' }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            역할
                          </th>
                          <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            읽기
                          </th>
                          <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            쓰기
                          </th>
                          <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            삭제
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {roles.map(role => {
                          const permission = boardPermissions[board.id]?.find(
                            p => p.roleId === role.id
                          ) || {
                            roleId: role.id,
                            roleName: role.name,
                            canRead: false,
                            canWrite: false,
                            canDelete: false,
                          };

                          return (
                            <tr key={role.id}>
                              <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                                {role.name}
                              </td>
                              <td className="px-2 py-3 text-center">
                                <Toggle
                                  checked={permission.canRead}
                                  onChange={() => onPermissionToggle(board.id, role.id, 'canRead')}
                                  disabled={saving}
                                  label={`${role.name} 읽기 권한`}
                                />
                              </td>
                              <td className="px-2 py-3 text-center">
                                <Toggle
                                  checked={permission.canWrite}
                                  onChange={() => onPermissionToggle(board.id, role.id, 'canWrite')}
                                  disabled={saving}
                                  label={`${role.name} 쓰기 권한`}
                                />
                              </td>
                              <td className="px-2 py-3 text-center">
                                <Toggle
                                  checked={permission.canDelete}
                                  onChange={() =>
                                    onPermissionToggle(board.id, role.id, 'canDelete')
                                  }
                                  disabled={saving}
                                  label={`${role.name} 삭제 권한`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    읽기: 게시판·게시글 조회 | 쓰기: 게시글 작성 | 삭제: 게시글 삭제
                  </p>
                </div>
              );
            })
          )}
        </div>
        {showGraph && (
          <div className="mt-4">
            <PermissionGraph roles={roles} boards={boards} accesses={graphAccesses} />
          </div>
        )}
      </AdminSection>
    </div>
  );
};

export default PermissionManagement;
