import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { Gate } from './Gate';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Gate>
          <Routes>
            <Route path="/login" element={<div>login screen</div>} />
            <Route path="/onboarding" element={<div>onboarding screen</div>} />
            <Route path="/" element={<div>chat screen</div>} />
          </Routes>
        </Gate>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Gate', () => {
  it('redirects to /login when /api/me is unauthorized', async () => {
    vi.spyOn(api, 'getMe').mockRejectedValue(new api.ApiError(401, 'unauthorized'));
    renderAt('/');
    await waitFor(() => expect(screen.getByText('login screen')).toBeInTheDocument());
  });

  it('redirects to /onboarding when the user has not onboarded', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: null, role: 'student', grade_or_subject: null, onboarded: 0 },
    });
    renderAt('/');
    await waitFor(() => expect(screen.getByText('onboarding screen')).toBeInTheDocument());
  });

  it('renders the requested route once logged in and onboarded', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: 'Sam', role: 'student', grade_or_subject: 'Year 9', onboarded: 1 },
    });
    renderAt('/');
    await waitFor(() => expect(screen.getByText('chat screen')).toBeInTheDocument());
  });
});
