import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import * as api from './api/client';

const signedInUser = {
  id: 'u1',
  email: 'a@b.edu.au',
  name: 'Sam',
  role: 'student' as const,
  grade_or_subject: 'Year 9',
  onboarded: 1,
};

function renderApp(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  it('shows the sign-in screen when logged out', async () => {
    vi.spyOn(api, 'getMe').mockRejectedValue(new api.ApiError(401, 'unauthorized'));
    renderApp();
    await waitFor(() => expect(screen.getByLabelText(/school email/i)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /your school email is all you need/i })).toBeInTheDocument();
  });

  it('sends an un-onboarded user to onboarding rather than the chat', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ user: { ...signedInUser, name: null, onboarded: 0 } });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { name: /what should i call you/i })).toBeInTheDocument());
  });

  it('shows the chat inside the layout when signed in and onboarded', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ user: signedInUser });
    vi.spyOn(api, 'listConversations').mockResolvedValue({ conversations: [] });
    renderApp();

    await waitFor(() => expect(screen.getByLabelText('Message')).toBeInTheDocument());
    // The app is light-only now, so there is no theme control to find.
    expect(screen.queryByLabelText('Theme')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });

  it('hides the admin link from a non-admin', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ user: signedInUser });
    vi.spyOn(api, 'listConversations').mockResolvedValue({ conversations: [] });
    renderApp();

    await waitFor(() => screen.getByLabelText('Message'));
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument();
  });

  it('shows the admin link to an admin', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ user: { ...signedInUser, role: 'admin' } });
    vi.spyOn(api, 'listConversations').mockResolvedValue({ conversations: [] });
    renderApp();

    await waitFor(() => expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument());
  });

  it('shows a real not-found page for an unknown path', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue({ user: signedInUser });
    renderApp('/no-such-page');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /that page doesn.t exist/i })).toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: /back to chat/i })).toBeInTheDocument();
  });
});
