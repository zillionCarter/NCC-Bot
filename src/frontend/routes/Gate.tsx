import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Gate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-paper">
        <p className="thinking font-mono text-micro uppercase tracking-[0.1em] text-pencil">
          loading<span>.</span>
          <span>.</span>
          <span>.</span>
        </p>
      </div>
    );
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
