import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Login } from './Login';
import * as api from '../api/client';
import { AuthProvider } from '../context/AuthContext';

function renderLogin() {
  return render(
    <AuthProvider>
      <Login />
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.spyOn(api, 'getMe').mockRejectedValue(new api.ApiError(401, 'unauthorized'));
});

afterEach(() => vi.restoreAllMocks());

describe('Login', () => {
  it('asks only for an email and confirms where the link went', async () => {
    vi.spyOn(api, 'requestMagicLink').mockResolvedValue({ ok: true });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/school email/i), { target: { value: 's@school.edu.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(screen.getByText(/s@school\.edu\.au/)).toBeInTheDocument();
    expect(api.requestMagicLink).toHaveBeenCalledWith('s@school.edu.au');
  });

  it('lowercases and trims the address before sending it', async () => {
    vi.spyOn(api, 'requestMagicLink').mockResolvedValue({ ok: true });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/school email/i), { target: { value: '  S.Person@School.EDU.AU ' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));

    await waitFor(() => expect(api.requestMagicLink).toHaveBeenCalledWith('s.person@school.edu.au'));
  });

  it('surfaces the server error message', async () => {
    vi.spyOn(api, 'requestMagicLink').mockRejectedValue(
      new api.ApiError(400, 'Only .edu.au email addresses can sign in.')
    );
    renderLogin();

    fireEvent.change(screen.getByLabelText(/school email/i), { target: { value: 'x@gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));

    await waitFor(() => expect(screen.getByText(/only \.edu\.au/i)).toBeInTheDocument());
  });

  it('signs in with a typed code, for a device that has no mailbox on it', async () => {
    vi.spyOn(api, 'requestMagicLink').mockResolvedValue({ ok: true });
    const verify = vi.spyOn(api, 'verifySignInCode').mockResolvedValue({ ok: true });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/school email/i), { target: { value: 'c@school.edu.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /enter the code instead/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /enter the code instead/i }));

    fireEvent.change(screen.getByLabelText(/sign-in code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(verify).toHaveBeenCalledWith('c@school.edu.au', '123456'));
  });

  it('clears a rejected code and explains why', async () => {
    vi.spyOn(api, 'requestMagicLink').mockResolvedValue({ ok: true });
    vi.spyOn(api, 'verifySignInCode').mockRejectedValue(new api.ApiError(400, 'That code is wrong or has expired.'));
    renderLogin();

    fireEvent.change(screen.getByLabelText(/school email/i), { target: { value: 'c@school.edu.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));
    await waitFor(() => screen.getByRole('button', { name: /enter the code instead/i }));
    fireEvent.click(screen.getByRole('button', { name: /enter the code instead/i }));

    const codeInput = screen.getByLabelText(/sign-in code/i);
    fireEvent.change(codeInput, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText(/that code is wrong/i)).toBeInTheDocument());
    // Clearing the field means the next attempt starts from scratch rather than
    // resubmitting the digits that just failed.
    expect((codeInput as HTMLInputElement).value).toBe('');
  });

  it('rate-limits resends so the button cannot be hammered', async () => {
    vi.spyOn(api, 'requestMagicLink').mockResolvedValue({ ok: true });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/school email/i), { target: { value: 'r@school.edu.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /resend in \d+s/i })).toBeDisabled());
  });
});
