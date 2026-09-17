import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { unwrap } from '../../api/utils';
import { adminKeys } from '../../api/queryKeys';
import { Role } from '../../types/admin.types';

// 역할 목록은 RoleManagement·PermissionManagement 두 탭이 동시에 쓴다.
// React Query 캐시를 공유하므로 두 탭을 오가도 요청은 한 번만 나간다.
export const useRoleManagement = () => {
  const queryClient = useQueryClient();

  const {
    data: roles = [],
    isPending,
    isSuccess,
    error,
    refetch,
  } = useQuery({
    queryKey: adminKeys.roles.all,
    queryFn: async () => unwrap<Role[]>(await api.get('/admin/roles')),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminKeys.roles.all });

  const addRoleMutation = useMutation({
    mutationFn: (roleData: { id: string; name: string; description: string }) =>
      api.post('/admin/roles', roleData),
    onSuccess: invalidate,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ roleId, updates }: { roleId: string; updates: Partial<Role> }) =>
      api.put(`/admin/roles/${roleId}`, updates),
    onSuccess: invalidate,
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/roles/${id}`),
    onSuccess: invalidate,
  });

  return {
    roles,
    loading: isPending,
    dataLoaded: isSuccess,
    fetchError: error ? '권한 목록을 불러오지 못했습니다.' : null,
    refetch,
    addRole: (roleData: { id: string; name: string; description: string }) =>
      addRoleMutation.mutateAsync(roleData),
    updateRole: (roleId: string, updates: Partial<Role>) =>
      updateRoleMutation.mutateAsync({ roleId, updates }),
    deleteRole: (id: string) => deleteRoleMutation.mutateAsync(id),
  };
};
