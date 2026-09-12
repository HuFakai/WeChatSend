import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Web UI render failed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app-canvas flex min-h-screen items-center justify-center p-5"><section role="alert" className="w-full max-w-md rounded-2xl border border-neutral-300 bg-white p-7 shadow-xl"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-700"><AlertTriangle className="h-5 w-5" /></span><h1 className="mt-6 text-2xl font-semibold tracking-tight">页面暂时无法显示</h1><p className="mt-2 text-sm leading-6 text-neutral-600">页面遇到了意外错误。你的任务数据仍保存在服务端，可以刷新后继续操作。</p><Button className="mt-6 w-full" onClick={() => window.location.reload()}>重新加载页面</Button></section></main>;
  }
}
