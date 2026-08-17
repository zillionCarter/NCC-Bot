import { Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Gate } from './routes/Gate';
import { RequireAdmin } from './routes/RequireAdmin';
import { Layout } from './components/Layout';
import { Login } from './routes/Login';
import { Onboarding } from './routes/Onboarding';
import { Chat } from './routes/Chat';
import { Admin } from './routes/Admin';

function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="max-w-sm text-center">
        <p className="eyebrow">Nothing here</p>
        <h1 className="mt-2 font-display text-title font-semibold text-ink">That page doesn&apos;t exist.</h1>
        <p className="mt-2 text-base text-graphite">The link may be old, or the chat may have been deleted.</p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-md bg-accent px-4 py-2 text-base font-medium text-accent-ink transition-opacity hover:opacity-90"
        >
          Back to chat
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route
            path="/"
            element={
              <Layout>
                <Chat />
              </Layout>
            }
          />
          <Route
            path="/c/:conversationId"
            element={
              <Layout>
                <Chat />
              </Layout>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Layout withSidebar={false}>
                  <Admin />
                </Layout>
              </RequireAdmin>
            }
          />
          <Route
            path="*"
            element={
              <Layout withSidebar={false}>
                <NotFound />
              </Layout>
            }
          />
        </Routes>
      </Gate>
    </AuthProvider>
  );
}
