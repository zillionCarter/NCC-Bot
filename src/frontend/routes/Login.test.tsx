import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Login } from './Login';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

describe('Login', () => {
  it('shows a confirmation after successfully requesting a magic link', async () => {
    vi.spyOn(api, 'requestMagicLink').mockResolvedValue({ ok: true });
    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText(/yourschool/), { target: { value: 's@school.edu.au' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(api.requestMagicLink).toHaveBeenCalledWith('s@school.edu.au');
  });

  it('shows an error message when the request fails', async () => {
    vi.spyOn(api, 'requestMagicLink').mockRejectedValue(
      new api.ApiError(400, 'Only .edu.au email addresses can sign in.')
    );
    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText(/yourschool/), { target: { value: 'x@gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send sign-in link/i }));

    await waitFor(() => expect(screen.getByText(/only \.edu\.au/i)).toBeInTheDocument());
  });
});
