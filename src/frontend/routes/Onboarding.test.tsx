import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Onboarding } from './Onboarding';
import * as api from '../api/client';
import { AuthProvider } from '../context/AuthContext';

function renderOnboarding() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Onboarding />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.spyOn(api, 'getMe').mockResolvedValue({
    user: { id: 'u1', email: 'a@b.edu.au', name: null, role: 'student', grade_or_subject: null, onboarded: 0 },
  });
});

afterEach(() => vi.restoreAllMocks());

describe('Onboarding', () => {
  it('collects a name and a year level', async () => {
    const submit = vi.spyOn(api, 'submitOnboarding').mockResolvedValue({ ok: true });
    renderOnboarding();

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // The second question addresses them by name — proof the first answer landed.
    await waitFor(() => expect(screen.getByText(/what year are you in, Sam/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Year 9' }));
    fireEvent.click(screen.getByRole('button', { name: /start using ncc bot/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith('Sam', 'Year 9'));
  });

  it('accepts a typed year level as well as the suggestions', async () => {
    const submit = vi.spyOn(api, 'submitOnboarding').mockResolvedValue({ ok: true });
    renderOnboarding();

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => screen.getByLabelText(/year level or subject/i));

    fireEvent.change(screen.getByLabelText(/year level or subject/i), { target: { value: 'Specialist Maths' } });
    fireEvent.click(screen.getByRole('button', { name: /start using ncc bot/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith('Sam', 'Specialist Maths'));
  });

  it('lets the year level be skipped, since it only tunes explanations', async () => {
    const submit = vi.spyOn(api, 'submitOnboarding').mockResolvedValue({ ok: true });
    renderOnboarding();

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip this/i }));

    fireEvent.click(screen.getByRole('button', { name: /skip this/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith('Sam', ''));
  });

  it('will not continue without a name', () => {
    renderOnboarding();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('keeps the student on the form and shows why when saving fails', async () => {
    vi.spyOn(api, 'submitOnboarding').mockRejectedValue(new api.ApiError(400, 'name is required'));
    renderOnboarding();

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip this/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip this/i }));

    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /start using ncc bot/i })).toBeEnabled();
  });
});
