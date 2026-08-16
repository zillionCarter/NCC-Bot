import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Gate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-ink-muted">Loading…</div>;
  }

  if (!user) {
    return location.pathname === '/login' ? <>{children}</> : <Navigate to="/login" replace />;
  }

  if (!user.onboarded) {
    return location.pathname === '/onboarding' ? <>{children}</> : <Navigate to="/onboarding" replace />;
  }

  if (location.pathname === '/login' || location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
