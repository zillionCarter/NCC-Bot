import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAdmin } from './RequireAdmin';
import { AuthProvider } from '../context/AuthContext';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

describe('RequireAdmin', () => {
  it('redirects non-admins to /', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: 'Sam', role: 'student', grade_or_subject: 'Year 9', onboarded: 1 },
    });
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<div>chat screen</div>} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <div>admin screen</div>
                </RequireAdmin>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('chat screen')).toBeInTheDocument();
  });
});
