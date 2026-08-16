import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import * as api from './api/client';

afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  it('shows the login screen when logged out', async () => {
    vi.spyOn(api, 'getMe').mockRejectedValue(new api.ApiError(401, 'unauthorized'));
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: /sign in to ncc bot/i })).toBeInTheDocument());
  });

  it('shows the chat screen inside the layout when logged in and onboarded', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({
      user: { id: 'u1', email: 'a@b.edu.au', name: 'Sam', role: 'student', grade_or_subject: 'Year 9', onboarded: 1 },
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByPlaceholderText(/ask ncc bot/i)).toBeInTheDocument());
    expect(screen.getByAltText('NCC Bot')).toBeInTheDocument();
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });
});
