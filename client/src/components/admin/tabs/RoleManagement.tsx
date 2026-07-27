import { useState, useEffect } from 'react';
import { Role } from '../../../types/admin.types';
import { useRoleManagement } from '../../../hooks/admin/useRoleManagement';
import { useAuth } from '../../../store/auth';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { AdminFormField, adminInputCls } from '../common/AdminFormField';
import { toast } from '../../../utils/toast';

export const RoleManagement = () => {
  const { roles, fetchRoles, addRole, updateRole, deleteRole, loading } = useRoleManagement();
  const { user: currentUser } = useAuth();

  useEffect(() => {
    fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [roleForm, setRoleForm] = useState({ id: '', name: '', description: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleAddRole = async () => {
    try {
      await addRole(roleForm);
      setRoleForm({ id: '', name: '', description: '' });
      toast.success('역할이 추가되었습니다.');
    } catch (err: unknown) {
      // 서버 검증 메시지(ID 형식: 2~50자 영문/숫자/_/- 등)를 노출
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message ?? '역할 추가에 실패했습니다.');
    }
  };

  const startEdit = (role: Role) => {
    setEditingId(role.id);
    setEditData({ name: role.name, description: role.description || '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({ name: '', description: '' });
  };

  const handleSaveEdit = async (roleId: string) => {
    try {
      await updateRole(roleId, editData);
      cancelEdit();
      toast.success('역할이 수정되었습니다.');
    } catch {
      toast.error('역할 수정에 실패했습니다.');
    }
  };

  const handleDeleteRole = async (id: string) => {
    try {
      await deleteRole(id);
      toast.success('역할이 삭제되었습니다.');
    } catch {
      toast.error('역할 삭제에 실패했습니다.');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  if (loading) return <LoadingSpinner message="역할 목록을 불러오는 중..." />;

  return (
    <div className="space-y-8">
      <ConfirmationModal
        open={!!confirmDeleteId}
        title="역할을 삭제하시겠습니까?"
        message="이 역할에 할당된 사용자가 있으면 삭제가 불가능할 수 있습니다."
        confirmLabel="삭제"
        onConfirm={() => confirmDeleteId && handleDeleteRole(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* 역할 추가 */}
      <AdminSection title="역할 추가">
        <div className="flex flex-wrap gap-3 items-end">
          <AdminFormField label="역할 ID" labelNote="(영문/숫자)">
            <input
              type="text"
              value={roleForm.id}
              onChange={e => setRoleForm({ ...roleForm, id: e.target.value })}
              className={adminInputCls('w-36')}
              placeholder="예: manager"
            />
          </AdminFormField>
          <AdminFormField label="역할 이름">
            <input
              type="text"
              value={roleForm.name}
              onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
              className={adminInputCls('w-36')}
              placeholder="예: 매니저"
            />
          </AdminFormField>
          <AdminFormField label="설명">
            <input
              type="text"
              value={roleForm.description}
              onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
              className={adminInputCls('w-48')}
              placeholder="역할 설명"
            />
          </AdminFormField>
          <button
            onClick={handleAddRole}
            disabled={!roleForm.id.trim() || !roleForm.name.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white transition-colors"
          >
            역할 추가
          </button>
        </div>
      </AdminSection>

      {/* 역할 목록 */}
      <AdminSection title={`역할 목록 (${roles.length}개)`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">
                  ID
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-36">
                  이름
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  설명
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-20">
                  상태
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {roles.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-slate-400 dark:text-slate-500"
                  >
                    등록된 역할이 없습니다.
                  </td>
                </tr>
              ) : (
                roles.map(role => (
                  <tr key={role.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-3 py-3 font-mono text-slate-700 dark:text-slate-300">
                      {role.id}
                    </td>
                    <td className="px-3 py-3">
                      {editingId === role.id ? (
                        <input
                          type="text"
                          value={editData.name}
                          onChange={e => setEditData({ ...editData, name: e.target.value })}
                          className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {role.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {editingId === role.id ? (
                        <input
                          type="text"
                          value={editData.description}
                          onChange={e => setEditData({ ...editData, description: e.target.value })}
                          className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">
                          {role.description || '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                          role.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${role.isActive ? 'bg-green-500' : 'bg-slate-400'}`}
                        ></span>
                        {role.isActive ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {editingId === role.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSaveEdit(role.id)}
                            disabled={!editData.name.trim()}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white transition-colors"
                          >
                            저장
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => startEdit(role)}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-600 dark:hover:bg-primary-900/20 transition-colors"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => {
                              if (currentUser?.role === role.id) {
                                toast.error('자신의 역할은 삭제할 수 없습니다.');
                                return;
                              }
                              setConfirmDeleteId(role.id);
                            }}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AdminSection>
    </div>
  );
};

export default RoleManagement;
