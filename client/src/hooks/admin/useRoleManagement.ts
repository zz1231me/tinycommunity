import { useState } from 'react';
import api from '../../api/axios';
import { Role } from '../../types/admin.types';

export const useRoleManagement = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchRoles = async () => {
    if (loading) return;
    try {
      setLoading(true);
      setFetchError(null);
      const res = await api.get('/admin/roles');
      setRoles(res.data.data || res.data);
      setDataLoaded(true);
    } catch (err) {
      if (import.meta.env.DEV) console.error('권한 목록 오류:', err);
      setFetchError('권한 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const addRole = async (roleData: { id: string; name: string; description: string }) => {
    await api.post('/admin/roles', roleData);
    await fetchRoles();
  };

  const updateRole = async (roleId: string, updates: Partial<Role>) => {
    await api.put(`/admin/roles/${roleId}`, updates);
    await fetchRoles();
  };

  const deleteRole = async (id: string) => {
    await api.delete(`/admin/roles/${id}`);
    await fetchRoles();
  };

  return {
    roles,
    loading,
    dataLoaded,
    fetchRoles,
    addRole,
    updateRole,
    deleteRole,
    setDataLoaded,
    fetchError,
  };
};
