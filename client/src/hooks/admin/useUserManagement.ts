import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { unwrap } from '../../api/utils';
import { adminKeys } from '../../api/queryKeys';
import { User, Role } from '../../types/admin.types';

export const useUserManagement = () => {
  const queryClient = useQueryClient();

  const {
    data: users = [],
    isPending,
    isSuccess,
    error,
  } = useQuery({
    queryKey: adminKeys.users.all,
    queryFn: async () => unwrap<User[]>(await api.get('/admin/users')),
  });

  // useRoleManagement 와 같은 키를 쓰므로, 두 훅이 한 화면에 있어도 요청은 한 번이다.
  const { data: roles = [] } = useQuery({
    queryKey: adminKeys.roles.all,
    queryFn: async () => unwrap<Role[]>(await api.get('/admin/roles')),
  });

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: adminKeys.users.all });

  const addUserMutation = useMutation({
    mutationFn: (userData: { id: string; name: string; role: string; password: string }) =>
      api.post('/admin/users', {
        id: userData.id,
        name: userData.name,
        roleId: userData.role,
        password: userData.password,
      }),
    onSuccess: invalidateUsers,
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: string }) =>
      api.put(`/admin/users/${userId}`, { roleId: newRole }),
    onSuccess: invalidateUsers,
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: invalidateUsers,
  });

  // 관리자가 입력한 6자리 숫자를 임시 비밀번호로 설정하고 mustChangePassword 플래그를 켠다
  // (사용자는 로그인 후 강제 변경). 형식 검증은 서버에서도 수행.
  const resetPassword = async (id: string, tempPassword: string): Promise<string> => {
    const data = unwrap<{ tempPassword?: string } | null>(
      await api.post(`/admin/users/${id}/reset-password`, { tempPassword })
    );
    return data?.tempPassword ?? tempPassword;
  };

  return {
    users,
    roles,
    loading: isPending,
    dataLoaded: isSuccess,
    fetchError: error ? '사용자 목록을 불러오지 못했습니다.' : null,
    addUser: (userData: { id: string; name: string; role: string; password: string }) =>
      addUserMutation.mutateAsync(userData),
    updateUserRole: (userId: string, newRole: string) =>
      updateUserRoleMutation.mutateAsync({ userId, newRole }),
    deleteUser: (id: string) => deleteUserMutation.mutateAsync(id),
    resetPassword,
    // 직접 api 호출로 사용자를 변경한 뒤 목록을 새로 받기 위한 무효화 트리거
    fetchUsers: invalidateUsers,
  };
};
