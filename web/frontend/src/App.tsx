import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/app-shell';
import { LoadingState } from '@/components/states';
import { getToken } from '@/lib/api';

const AccountsPage = lazy(() => import('@/pages/accounts').then((module) => ({ default: module.AccountsPage })));
const AdminPage = lazy(() => import('@/pages/admin').then((module) => ({ default: module.AdminPage })));
const AiPage = lazy(() => import('@/pages/ai').then((module) => ({ default: module.AiPage })));
const DashboardPage = lazy(() => import('@/pages/dashboard').then((module) => ({ default: module.DashboardPage })));
const FriendsPage = lazy(() => import('@/pages/friends').then((module) => ({ default: module.FriendsPage })));
const LoginPage = lazy(() => import('@/pages/login').then((module) => ({ default: module.LoginPage })));
const MembershipPage = lazy(() => import('@/pages/membership').then((module) => ({ default: module.MembershipPage })));
const OrdersPage = lazy(() => import('@/pages/orders').then((module) => ({ default: module.OrdersPage })));
const PaymentAdminPage = lazy(() => import('@/pages/payment-admin').then((module) => ({ default: module.PaymentAdminPage })));
const PlatformTemplatesPage = lazy(() => import('@/pages/platform-templates').then((module) => ({ default: module.PlatformTemplatesPage })));
const ProfilePage = lazy(() => import('@/pages/profile').then((module) => ({ default: module.ProfilePage })));
const TaskDetailPage = lazy(() => import('@/pages/task-detail').then((module) => ({ default: module.TaskDetailPage })));
const TaskNewPage = lazy(() => import('@/pages/task-new').then((module) => ({ default: module.TaskNewPage })));
const TasksPage = lazy(() => import('@/pages/tasks').then((module) => ({ default: module.TasksPage })));
const TemplatesPage = lazy(() => import('@/pages/templates').then((module) => ({ default: module.TemplatesPage })));
const VariablesPage = lazy(() => import('@/pages/variables').then((module) => ({ default: module.VariablesPage })));

function Protected() { return getToken() ? <AppShell /> : <Navigate to="/login" replace />; }

export function App() {
  return <Suspense fallback={<LoadingState label="正在打开页面" fullScreen />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route index element={<DashboardPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/new" element={<TaskNewPage />} />
        <Route path="tasks/:id" element={<TaskDetailPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="friends" element={<FriendsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="variables" element={<VariablesPage />} />
        <Route path="ai" element={<AiPage />} />
        <Route path="membership" element={<MembershipPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="admin/payment" element={<PaymentAdminPage />} />
        <Route path="admin/templates" element={<PlatformTemplatesPage />} />
        <Route path="admin/orders" element={<OrdersPage admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>;
}
