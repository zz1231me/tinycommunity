// 권한 관리 컴포넌트

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Info,
  Loader2,
  Map,
  RotateCw,
  Rows3,
  Search,
  Table2,
} from 'lucide-react';
import { useBoardManagement } from '../../../hooks/admin/useBoardManagement';
import { useRoleManagement } from '../../../hooks/admin/useRoleManagement';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import type { BoardPermission } from '../../../types/admin.types';
import { adminInputCls } from '../common/AdminFormField';
import { PermissionGraph } from '../PermissionGraph';
import { fetchWikiPermissions, updateWikiPermissions } from '../../../api/admin';
import { toast } from '../../../utils/toast';
import { ListState } from '../../common/ListState';

// 토글 스위치. 트랙 안에 별도 인터랙티브 요소를 두면 클릭이 두 번 발화한다.
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

// 위키 자동 저장 상태 표시
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

type PermKey = 'canRead' | 'canWrite' | 'canDelete';

const PERMS: { id: PermKey; label: string }[] = [
  { id: 'canRead', label: '읽기' },
  { id: 'canWrite', label: '쓰기' },
  { id: 'canDelete', label: '삭제' },
];

/**
 * 게시판 × 역할 표. 한 번에 권한 하나만 본다.
 *
 * 게시판별 카드는 "이 게시판은 누구에게 열려 있나" 만 답한다. 그 반대("이 역할은
 * 어느 게시판을 쓸 수 있나")를 보려면 게시판을 전부 펼쳐 눈으로 모아야 했다.
 * 가로줄로 읽으면 게시판 하나, 세로줄로 읽으면 역할 하나가 보인다.
 *
 * 읽기·쓰기·삭제를 한 칸에 다 넣으면 역할 여섯에 토글 열여덟이 한 줄에 들어가
 * 가로로 터진다. 권한을 먼저 고르게 해 칸마다 토글 하나만 둔다.
 */
function PermissionMatrix({
  boards,
  allBoards,
  roles,
  permissions,
  perm,
  onPermChange,
  onToggle,
  disabled,
  dirtyBoards,
}: {
  /** 지금 그릴 줄(찾기로 걸러진 것). */
  boards: { id: string; name: string }[];
  /** 세로줄 합계를 세는 모집단. 찾기로 거른다고 역할이 닿는 범위가 변하는 것은 아니므로,
      걸러진 것만 세면 '자유' 로 찾았을 때 1/1 처럼 보여 실제(3/9)를 숨긴다. */
  allBoards: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  permissions: Record<string, BoardPermission[]>;
  perm: PermKey;
  onPermChange: (p: PermKey) => void;
  onToggle: (boardId: string, roleId: string, key: PermKey) => void;
  disabled: boolean;
  dirtyBoards: Set<string>;
}) {
  const on = (boardId: string, roleId: string) =>
    permissions[boardId]?.find(p => p.roleId === roleId)?.[perm] ?? false;
  const label = PERMS.find(p => p.id === perm)!.label;

  return (
    <div className="space-y-3">
      <div role="group" aria-label="볼 권한" className="flex gap-1">
        {PERMS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPermChange(p.id)}
            aria-pressed={perm === p.id}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              perm === p.id
                ? 'bg-primary-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 역할이 늘면 가로로 넘친다. 게시판 이름 칸은 붙여 두어 어느 줄인지 놓치지 않게 한다. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="admin-th sticky left-0 z-10 bg-white text-left dark:bg-slate-800">
                게시판
              </th>
              {roles.map(role => {
                const count = allBoards.filter(b => on(b.id, role.id)).length;
                return (
                  <th key={role.id} className="admin-th whitespace-nowrap px-3 text-center">
                    <span className="block">{role.name}</span>
                    {/* 세로줄 합계 — 이 역할이 몇 개 게시판에서 이 권한을 갖는지 */}
                    <span className="block text-xs font-normal tabular-nums text-slate-400">
                      {count}/{allBoards.length}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {boards.map(board => (
              <tr key={board.id}>
                <th
                  scope="row"
                  className="admin-td sticky left-0 z-10 max-w-[14rem] truncate bg-white text-left font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  title={board.name}
                >
                  {board.name}
                  {dirtyBoards.has(board.id) && (
                    <span
                      className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"
                      title="저장하지 않은 변경"
                    />
                  )}
                </th>
                {roles.map(role => (
                  <td key={role.id} className="admin-td px-3 text-center">
                    <Toggle
                      checked={on(board.id, role.id)}
                      onChange={() => onToggle(board.id, role.id, perm)}
                      disabled={disabled}
                      label={`${board.name} ${role.name} ${label} 권한`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

  const { roles, loading: loadingRoles } = useRoleManagement();

  /**
   * 보기 셋. 묻는 것이 서로 달라서 한 화면으로는 둘 다 답하지 못한다.
   *
   *  게시판별 — "이 게시판은 누구에게 열려 있나" (한 게시판을 꼼꼼히 고칠 때)
   *  한눈에   — "이 역할은 어느 게시판을 쓸 수 있나" (가로줄·세로줄 양쪽으로 읽힌다)
   *  관계도   — 전체 얼개만 훑어볼 때
   *
   * 예전에는 '관계도 보기' 를 눌러도 게시판 카드가 그대로 남은 채 관계도가 아래에
   * 덧붙었다(실측 1,659 → 2,175px). 그런데 단추 이름은 '테이블 보기' 로 바뀌어,
   * 보고 있지도 않은 곳으로 돌아가라고 말하고 있었다. 이제 한 번에 하나만 보여 준다.
   */
  const [view, setView] = useState<'board' | 'matrix' | 'graph'>('board');
  /** 한눈에 보기에서 지금 보고 있는 권한. 셋을 한 칸에 넣으면 표가 가로로 터진다. */
  const [matrixPerm, setMatrixPerm] = useState<'canRead' | 'canWrite' | 'canDelete'>('canRead');
  const [wikiRoles, setWikiRoles] = useState<string[]>([]);
  const [wikiSaving, setWikiSaving] = useState(false);
  // 저장 중 들어온 후속 토글을 모아 두어 클릭 유실을 막는다
  const wikiSavingRef = useRef(false);
  const wikiPendingRef = useRef<string[] | null>(null);
  // wikiRoles 의 최신 스냅샷. setState updater 의 비동기 실행에 의존하지 않기 위함.
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

  // 위키 역할 목록을 직렬로 저장한다. 저장 중 쌓인 변경은 끝난 뒤 이어서 저장한다.
  const flushWikiSave = useCallback(
    async (roles: string[]) => {
      wikiSavingRef.current = true;
      setWikiSaving(true);
      try {
        const data = await updateWikiPermissions(roles);
        // 대기 중 후속 변경이 없을 때만 서버 정규화 결과를 반영한다
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
    // ref 에서 동기 계산해야 한다. setState updater 로 계산하면 빈 목록이 저장될 수 있다.
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
    loadWikiPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 게시판 목록이 새로 들어오면 권한 초안을 다시 채운다.
  // 미저장 변경이 있으면 덮어쓰지 않는다. fetchBoardPermissions 가 dirtyBoards 를 초기화한다.
  useEffect(() => {
    if (boards.length > 0 && dirtyBoards.size === 0) {
      fetchBoardPermissions(boards);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards]);

  // 미저장 변경이 있으면 페이지 이탈 시 경고한다
  useEffect(() => {
    if (dirtyBoards.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyBoards]);

  // 펼쳐 둔 게시판. 고친 게시판은 아래에서 늘 펼친 것으로 친다.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleBoard = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const [boardQuery, setBoardQuery] = useState('');
  const needle = boardQuery.trim().toLowerCase();
  const shownBoards = needle
    ? boards.filter(b => `${b.name} ${b.id}`.toLowerCase().includes(needle))
    : boards;

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
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              선택된 역할만 위키 페이지를 생성·수정·삭제할 수 있습니다.
            </p>
            <WikiSaveStatus saving={wikiSaving} />
          </div>
          <div className="flex flex-wrap gap-3">
            {roles.map(role => {
              const active = wikiRoles.includes(role.id);
              // 버튼 자체가 스위치다. 안에 button 을 두면 클릭이 두 번 발화해 토글이 상쇄된다.
              return (
                <button
                  key={role.id}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={`${role.name} 위키 권한`}
                  onClick={() => toggleWikiRole(role.id)}
                  disabled={wikiSaving}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
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
          <div className="flex flex-wrap items-center gap-2">
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
              className="btn-primary"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? '저장 중' : dirtyCount > 0 ? `저장 (${dirtyCount})` : '저장됨'}
            </button>
            <div
              role="group"
              aria-label="권한 보기"
              className="inline-flex gap-1 rounded-lg border border-slate-200 p-1 dark:border-slate-600"
            >
              {(
                [
                  { id: 'board', label: '게시판별', icon: Rows3 },
                  { id: 'matrix', label: '한눈에', icon: Table2 },
                  { id: 'graph', label: '관계도', icon: Map },
                ] as const
              ).map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  aria-pressed={view === v.id}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    view === v.id
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <v.icon className="h-4 w-4" />
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="space-y-6">
          {/* 게시판마다 역할 여섯 줄짜리 표를 다 펴 두면 아홉 게시판에 4,958px 이 된다.
              게시판이 스무 개면 만 픽셀을 넘는다. 접어 두고 요약만 보여 준다 —
              고친 게시판은 접지 않는다(저장 안 된 것을 숨기면 안 된다). */}
          {boards.length > 1 && (
            <div className="relative max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={boardQuery}
                onChange={e => setBoardQuery(e.target.value)}
                placeholder="게시판 이름으로 찾기"
                aria-label="게시판 이름으로 찾기"
                className={adminInputCls('w-full pl-9')}
              />
            </div>
          )}
          {boards.length === 0 ? (
            <ListState size="roomy">게시판이 없습니다. 먼저 게시판을 생성해주세요.</ListState>
          ) : view === 'matrix' ? (
            <PermissionMatrix
              boards={shownBoards}
              allBoards={boards}
              roles={roles}
              permissions={boardPermissions}
              perm={matrixPerm}
              onPermChange={setMatrixPerm}
              onToggle={onPermissionToggle}
              disabled={saving}
              dirtyBoards={dirtyBoards}
            />
          ) : view === 'graph' ? (
            <PermissionGraph roles={roles} boards={boards} accesses={graphAccesses} />
          ) : (
            shownBoards.map(board => {
              const isDirty = dirtyBoards.has(board.id);
              const perms = roles.map(
                role =>
                  boardPermissions[board.id]?.find(p => p.roleId === role.id) ?? {
                    roleId: role.id,
                    roleName: role.name,
                    canRead: false,
                    canWrite: false,
                    canDelete: false,
                  }
              );
              // 접은 채로도 이 게시판이 얼마나 열려 있는지는 보여야 한다.
              const summary = {
                read: perms.filter(p => p.canRead).length,
                write: perms.filter(p => p.canWrite).length,
                del: perms.filter(p => p.canDelete).length,
              };
              const open = expanded.has(board.id) || isDirty;
              return (
                <div key={board.id} className="card p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    {/* 게시판 이름은 100자까지 허용되므로 줄이지 않으면 화면이 가로로 늘어난다 */}
                    <h3 className="flex min-w-0 items-baseline gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                      <button
                        type="button"
                        onClick={() => toggleBoard(board.id)}
                        aria-expanded={open}
                        className="flex min-w-0 items-baseline gap-2 text-left hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        <ChevronRight
                          className={`h-4 w-4 flex-shrink-0 self-center transition-transform ${open ? 'rotate-90' : ''}`}
                          aria-hidden="true"
                        />
                        <span className="truncate" title={board.name}>
                          {board.name}
                        </span>
                      </button>
                      <span className="flex-shrink-0 text-xs font-normal text-slate-400">
                        {board.id}
                      </span>
                      <span className="flex-shrink-0 text-xs font-normal tabular-nums text-slate-500 dark:text-slate-400">
                        읽기 {summary.read} · 쓰기 {summary.write} · 삭제 {summary.del}
                      </span>
                    </h3>
                    {isDirty ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        변경됨 (미저장)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                        <Check className="h-3.5 w-3.5" />
                        저장됨
                      </span>
                    )}
                  </div>

                  {open && (
                    <>
                      <div className="overflow-x-auto">
                        {/* 칼럼 폭 고정. 카드마다 토글 칼럼 위치를 맞춘다. */}
                        <table className="w-full table-fixed text-sm">
                          <colgroup>
                            <col />
                            <col style={{ width: '90px' }} />
                            <col style={{ width: '90px' }} />
                            <col style={{ width: '90px' }} />
                          </colgroup>
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                              <th className="admin-th">역할</th>
                              <th className="admin-th text-center">읽기</th>
                              <th className="admin-th text-center">쓰기</th>
                              <th className="admin-th text-center">삭제</th>
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
                                  <td className="admin-td font-medium text-slate-800 dark:text-slate-100">
                                    {role.name}
                                  </td>
                                  <td className="admin-td text-center">
                                    <Toggle
                                      checked={permission.canRead}
                                      onChange={() =>
                                        onPermissionToggle(board.id, role.id, 'canRead')
                                      }
                                      disabled={saving}
                                      label={`${role.name} 읽기 권한`}
                                    />
                                  </td>
                                  <td className="admin-td text-center">
                                    <Toggle
                                      checked={permission.canWrite}
                                      onChange={() =>
                                        onPermissionToggle(board.id, role.id, 'canWrite')
                                      }
                                      disabled={saving}
                                      label={`${role.name} 쓰기 권한`}
                                    />
                                  </td>
                                  <td className="admin-td text-center">
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
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </AdminSection>
    </div>
  );
};

export default PermissionManagement;
