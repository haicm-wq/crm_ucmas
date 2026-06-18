import { lazy, Suspense, Component, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';

// Helper to handle chunk loading failures due to new deployments (Vite hashing issues)
function lazyWithRetry(componentImport) {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      console.error('Lazy loading failed, reloading page:', error);
      const hasReloaded = window.sessionStorage.getItem('lazy-retry-reloaded');
      if (!hasReloaded) {
        window.sessionStorage.setItem('lazy-retry-reloaded', 'true');
        window.location.reload();
        return new Promise(() => {}); // Keep pending while page reloads
      }
      throw error;
    }
  });
}

// P1: Lazy-load route pages for smaller initial bundle
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'));
const LeadPoolPage = lazyWithRetry(() => import('./pages/LeadPoolPage'));
const LeadsPage = lazyWithRetry(() => import('./pages/LeadsPage'));
const CalendarPage = lazyWithRetry(() => import('./pages/CalendarPage'));
const ReportsPage = lazyWithRetry(() => import('./pages/ReportsPage'));
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'));

// DX2: Route-level loading fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-surface-400">Đang tải trang...</p>
      </div>
    </div>
  );
}

// DX2: Error Boundary

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="glass-card p-8 max-w-md text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold text-surface-800 dark:text-surface-100 mb-2">Đã xảy ra lỗi</h2>
            <p className="text-sm text-surface-500 mb-4">{this.state.error?.message || 'Trang gặp lỗi không mong muốn'}</p>
            <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              className="btn-primary text-sm">Tải lại trang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-surface-400">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  useEffect(() => {
    // Clear reload flag on successful mount
    window.sessionStorage.removeItem('lazy-retry-reloaded');
  }, []);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/kho-l0" element={<LeadPoolPage />} />
                    <Route path="/leads" element={<LeadsPage />} />
                    <Route path="/lich-hen" element={<CalendarPage />} />
                    <Route path="/bao-cao" element={<ReportsPage />} />
                    <Route path="/cai-dat/*" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
