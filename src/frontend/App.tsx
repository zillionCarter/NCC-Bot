import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Gate } from './routes/Gate';
import { RequireAdmin } from './routes/RequireAdmin';
import { Layout } from './components/Layout';
import { Login } from './routes/Login';
import { Onboarding } from './routes/Onboarding';
import { Chat } from './routes/Chat';
import { Admin } from './routes/Admin';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
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
                  <Layout>
                    <Admin />
                  </Layout>
                </RequireAdmin>
              }
            />
          </Routes>
        </Gate>
      </ThemeProvider>
    </AuthProvider>
  );
}
