import axios from 'axios';
import { useAuthStore } from '../store/auth';
import router from '../router';
import { adminApiMock } from './mock';

// Same-origin in production (nginx proxies /admin to the backend).
const api = axios.create({ baseURL: '/' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore().logout();
      if (router.currentRoute.value.name !== 'login') router.push({ name: 'login' });
    }
    return Promise.reject(err);
  },
);

export interface CardItem {
  id: number;
  code: string;
  status: 'UNUSED' | 'ACTIVE' | 'EXPIRED' | 'BANNED';
  durationDays: number | null;
  hwid: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  lastSeenAt: string | null;
  sessionId: string | null;
  online: boolean;
  note: string | null;
  batch?: { id: number; name: string } | null;
  createdAt: string;
}

const realAdminApi = {
  login: (username: string, password: string) =>
    api.post('/admin/login', { username, password }).then((r) => r.data),
  listCards: (params: Record<string, unknown>) =>
    api.get('/admin/cards', { params }).then((r) => r.data),
  createBatch: (payload: { name: string; count: number; durationDays: number | null; note?: string }) =>
    api.post('/admin/cards/batch', payload).then((r) => r.data),
  ban: (id: number) => api.patch(`/admin/cards/${id}/ban`).then((r) => r.data),
  unban: (id: number) => api.patch(`/admin/cards/${id}/unban`).then((r) => r.data),
  unbind: (id: number) => api.patch(`/admin/cards/${id}/unbind`).then((r) => r.data),
  remove: (id: number) => api.delete(`/admin/cards/${id}`).then((r) => r.data),
  extendCards: (payload: {
    days: number;
    scope: 'ids' | 'filter';
    ids?: number[];
    status?: string;
    code?: string;
    hwid?: string;
    batchId?: number;
  }) => api.post('/admin/cards/extend', payload).then((r) => r.data),
  stats: () => api.get('/admin/stats').then((r) => r.data),
  pubkey: () => api.get('/admin/pubkey').then((r) => r.data),
  exportCsv: (params: Record<string, unknown>) =>
    api.get('/admin/cards/export', { params, responseType: 'blob' }).then((r) => r.data as Blob),
};

// Demo mode (VITE_DEMO=1): serve the whole UI from an in-memory mock, no backend.
const isDemo = import.meta.env.VITE_DEMO === '1' || import.meta.env.VITE_DEMO === 'true';
export const adminApi: typeof realAdminApi = isDemo
  ? (adminApiMock as typeof realAdminApi)
  : realAdminApi;

export default api;
