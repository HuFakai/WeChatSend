import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/app-shell';
import { getToken } from '@/lib/api';
import { AccountsPage } from '@/pages/accounts';
import { DashboardPage } from '@/pages/dashboard';
import { FriendsPage } from '@/pages/friends';
import { LoginPage } from '@/pages/login';
import { TaskDetailPage } from '@/pages/task-detail';
import { TaskNewPage } from '@/pages/task-new';
import { TasksPage } from '@/pages/tasks';
import { TemplatesPage } from '@/pages/templates';
import { VariablesPage } from '@/pages/variables';
import { AiPage } from '@/pages/ai';
import { AdminPage } from '@/pages/admin';

function Protected() { return getToken() ? <AppShell /> : <Navigate to="/login" replace />; }

export function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<Protected />}><Route index element={<DashboardPage />} /><Route path="accounts" element={<AccountsPage />} /><Route path="friends" element={<FriendsPage />} /><Route path="templates" element={<TemplatesPage />} /><Route path="variables" element={<VariablesPage />} /><Route path="ai" element={<AiPage />} /><Route path="admin" element={<AdminPage />} /><Route path="tasks" element={<TasksPage />} /><Route path="tasks/new" element={<TaskNewPage />} /><Route path="tasks/:id" element={<TaskDetailPage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
