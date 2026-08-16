import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Admin } from './Admin';
import * as api from '../api/client';
import { AuthProvider } from '../context/AuthContext';

afterEach(() => vi.restoreAllMocks());

describe('Admin', () => {
  it('lists users, marks the acting admin as (you), and promotes a student via the role select', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@school.edu.au', name: 'Admin', role: 'admin', grade_or_subject: null, onboarded: 1 },
    });
    vi.spyOn(api, 'listUsers').mockResolvedValue({
      users: [
        { id: 'admin-1', email: 'admin@school.edu.au', name: 'Admin', role: 'admin', created_at: '2026-01-01' },
        { id: 'student-1', email: 'student@school.edu.au', name: 'Sam', role: 'student', created_at: '2026-01-02' },
      ],
    });
    const setRoleSpy = vi.spyOn(api, 'setUserRole').mockResolvedValue({ ok: true });

    render(
      <AuthProvider>
        <Admin />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('student@school.edu.au')).toBeInTheDocument());
    expect(screen.getByText('admin (you)')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('student'), { target: { value: 'teacher' } });
    await waitFor(() => expect(setRoleSpy).toHaveBeenCalledWith('student-1', 'teacher'));
  });
});
