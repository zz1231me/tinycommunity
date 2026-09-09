// client/src/api/ipRules.ts

import api from './axios';
import { unwrap } from './utils';

export type IpRuleType = 'whitelist' | 'blacklist';

export interface IpRule {
  id: string;
  type: IpRuleType;
  ip: string;
  description: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IpRuleStats {
  total: number;
  whitelist: number;
  blacklist: number;
  active: number;
  inactive: number;
}

export const getIpRules = (type?: IpRuleType) =>
  api.get('/admin/ip-rules', { params: type ? { type } : {} }).then(unwrap) as Promise<IpRule[]>;

export const getIpRuleStats = () =>
  api.get('/admin/ip-rules/stats').then(unwrap) as Promise<IpRuleStats>;

export const createIpRule = (data: { type: IpRuleType; ip: string; description?: string | null }) =>
  api.post('/admin/ip-rules', data).then(unwrap) as Promise<IpRule>;

export const updateIpRule = (
  id: string,
  data: { description?: string | null; isActive?: boolean }
) => api.patch(`/admin/ip-rules/${id}`, data).then(unwrap) as Promise<IpRule>;

export const deleteIpRule = (id: string) => api.delete(`/admin/ip-rules/${id}`).then(unwrap);
