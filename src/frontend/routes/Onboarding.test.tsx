import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Onboarding } from './Onboarding';
import * as api from '../api/client';
import { AuthProvider } from '../context/AuthContext';

afterEach(() => vi.restoreAllMocks());

describe('Onboarding', () => {
  it("walks through intro -> name -> gradeOrSubject and submits both fields", async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: null, role: 'student', grade_or_subject: null, onboarded: 0 },
    });
    const submitSpy = vi.spyOn(api, 'submitOnboarding').mockResolvedValue({ ok: true });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Onboarding />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /let's go/i }));

    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByPlaceholderText(/year 10/i), { target: { value: 'Year 9' } });
    fireEvent.click(screen.getByRole('button', { name: /finish/i }));

    await waitFor(() => expect(submitSpy).toHaveBeenCalledWith('Sam', 'Year 9'));
  });
});
