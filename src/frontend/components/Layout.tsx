import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThemeSwitcher } from './ThemeSwitcher';
import { logout } from '../api/client';

export function Layout({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();

  async function handleLogout() {
    await logout();
    await refresh();
  }

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2">
        <Link to="/" className="font-heading text-lg font-semibold text-primary">
          NCC Bot
        </Link>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && (
            <Link to="/admin" className="text-sm text-ink-muted hover:text-ink">
              Admin
            </Link>
          )}
          <ThemeSwitcher />
          <button onClick={handleLogout} className="text-sm text-ink-muted hover:text-ink">
            Log out
          </button>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
