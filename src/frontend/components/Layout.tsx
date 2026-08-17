import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sidebar } from './Sidebar';
import { logout } from '../api/client';
import logo from '../assets/logo.png';

/**
 * Lets a child ask the conversation list to refetch — the chat pane needs this
 * after a new conversation is created, and the list itself has no way to know.
 */
const RefreshSidebarContext = createContext<() => void>(() => {});

export function useRefreshSidebar(): () => void {
  return useContext(RefreshSidebarContext);
}

export function Layout({ children, withSidebar = true }: { children: ReactNode; withSidebar?: boolean }) {
  const { user, refresh } = useAuth();
  const location = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const bump = useCallback(() => setRefreshKey((key) => key + 1), []);

  // A drawer left open across a navigation would cover the thing just opened.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  async function handleLogout() {
    await logout();
    await refresh();
  }

  return (
    <RefreshSidebarContext.Provider value={bump}>
      <div className="flex h-dvh flex-col bg-paper text-ink">
        <header className="flex shrink-0 items-center gap-3 border-b border-rule px-3 py-2 sm:px-4">
          {withSidebar && (
            <button
              type="button"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-label={drawerOpen ? 'Close chat list' : 'Open chat list'}
              aria-expanded={drawerOpen}
              className="-ml-1 rounded-md p-2 text-graphite transition-colors hover:bg-sunken hover:text-ink md:hidden"
            >
              <span aria-hidden className="block text-body leading-none">
                ☰
              </span>
            </button>
          )}

          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src={logo} alt="" className="h-7 w-auto shrink-0" />
            <span className="truncate font-display text-body font-semibold tracking-[-0.01em] text-ink">NCC Bot</span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="font-mono text-micro uppercase tracking-[0.08em] text-pencil transition-colors hover:text-ink"
              >
                Admin
              </Link>
            )}
            <span className="hidden max-w-[13rem] truncate text-tiny text-pencil lg:block">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="font-mono text-micro uppercase tracking-[0.08em] text-pencil transition-colors hover:text-ink"
            >
              Log out
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {withSidebar && (
            <>
              <div className="hidden shrink-0 md:block">
                <Sidebar refreshKey={refreshKey} />
              </div>

              {drawerOpen && (
                <div className="fixed inset-0 z-40 md:hidden">
                  <button
                    type="button"
                    aria-label="Close chat list"
                    onClick={() => setDrawerOpen(false)}
                    className="absolute inset-0 bg-ink/30"
                  />
                  <div className="animate-slide-in-left absolute inset-y-0 left-0 w-[17rem] max-w-[82%] shadow-xl">
                    <Sidebar refreshKey={refreshKey} onNavigate={() => setDrawerOpen(false)} />
                  </div>
                </div>
              )}
            </>
          )}

          <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        </div>
      </div>
    </RefreshSidebarContext.Provider>
  );
}
