import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../store/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/Login.vue') },
    {
      path: '/',
      component: () => import('../views/Layout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/cards' },
        { path: 'cards', name: 'cards', component: () => import('../views/Cards.vue') },
        { path: 'dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthed) return { name: 'login' };
  if (to.name === 'login' && auth.isAuthed) return { name: 'cards' };
  return true;
});

export default router;
