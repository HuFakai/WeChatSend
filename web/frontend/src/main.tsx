import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/error-boundary';
import { ToastProvider } from './components/toast';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary><ToastProvider><BrowserRouter><App /></BrowserRouter></ToastProvider></ErrorBoundary>
  </React.StrictMode>,
);
