import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { requiresAuth: false, public: true },
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/403/ForbiddenView.vue'),
    meta: { requiresAuth: false, public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: 'overview' },
      },
      // P2 起在此追加业务页：users / events / knowledge / notifications / monitor / audit / op-audit / sessions / observability / system
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

export default routes
