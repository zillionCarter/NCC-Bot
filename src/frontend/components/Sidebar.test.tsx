import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import * as api from '../api/client';
import type { Conversation } from '../../types';

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function conversation(id: string, title: string, created_at: string): Conversation {
  return { id, user_id: 'u1', title, created_at };
}

function renderSidebar(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<Sidebar refreshKey={0} />} />
        <Route path="/c/:conversationId" element={<Sidebar refreshKey={0} />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('Sidebar', () => {
  it('groups conversations by recency', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({
      conversations: [
        conversation('c1', 'Today chat', new Date().toISOString()),
        conversation('c2', 'Yesterday chat', daysAgo(1)),
        conversation('c3', 'Last week chat', daysAgo(4)),
        conversation('c4', 'Ancient chat', daysAgo(200)),
      ],
    });

    renderSidebar();
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Previous 7 days')).toBeInTheDocument();
    expect(screen.getByText('Earlier')).toBeInTheDocument();
  });

  it('invites a first chat when the list is empty', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({ conversations: [] });
    renderSidebar();
    await waitFor(() => expect(screen.getByText(/your chats will appear here/i)).toBeInTheDocument());
  });

  it('labels an untitled conversation rather than showing a blank row', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({
      conversations: [conversation('c1', '', new Date().toISOString())],
    });
    renderSidebar();
    await waitFor(() => expect(screen.getByText('Untitled chat')).toBeInTheDocument());
  });

  it('renames a conversation and keeps the new name on success', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({
      conversations: [conversation('c1', 'Old name', new Date().toISOString())],
    });
    const rename = vi.spyOn(api, 'renameConversation').mockResolvedValue({ ok: true });

    renderSidebar();
    await waitFor(() => screen.getByText('Old name'));

    fireEvent.click(screen.getByRole('button', { name: /rename old name/i }));
    const input = screen.getByLabelText(/chat name/i);
    fireEvent.change(input, { target: { value: 'New name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(rename).toHaveBeenCalledWith('c1', 'New name'));
    expect(screen.getByText('New name')).toBeInTheDocument();
  });

  it('puts the old name back if the rename is rejected', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({
      conversations: [conversation('c1', 'Old name', new Date().toISOString())],
    });
    vi.spyOn(api, 'renameConversation').mockRejectedValue(new api.ApiError(404, 'not found'));

    renderSidebar();
    await waitFor(() => screen.getByText('Old name'));

    fireEvent.click(screen.getByRole('button', { name: /rename old name/i }));
    const input = screen.getByLabelText(/chat name/i);
    fireEvent.change(input, { target: { value: 'New name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Leaving the new name on screen would claim a rename that did not happen.
    await waitFor(() => expect(screen.getByText('Old name')).toBeInTheDocument());
  });

  it('abandons a rename on Escape', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({
      conversations: [conversation('c1', 'Old name', new Date().toISOString())],
    });
    const rename = vi.spyOn(api, 'renameConversation');

    renderSidebar();
    await waitFor(() => screen.getByText('Old name'));
    fireEvent.click(screen.getByRole('button', { name: /rename old name/i }));
    fireEvent.keyDown(screen.getByLabelText(/chat name/i), { key: 'Escape' });

    expect(rename).not.toHaveBeenCalled();
    expect(screen.getByText('Old name')).toBeInTheDocument();
  });

  it('confirms before deleting, and does nothing if declined', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({
      conversations: [conversation('c1', 'Doomed', new Date().toISOString())],
    });
    const remove = vi.spyOn(api, 'deleteConversation');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderSidebar();
    await waitFor(() => screen.getByText('Doomed'));
    fireEvent.click(screen.getByRole('button', { name: /delete doomed/i }));

    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText('Doomed')).toBeInTheDocument();
  });

  it('deletes on confirmation', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({
      conversations: [conversation('c1', 'Doomed', new Date().toISOString())],
    });
    const remove = vi.spyOn(api, 'deleteConversation').mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSidebar();
    await waitFor(() => screen.getByText('Doomed'));
    fireEvent.click(screen.getByRole('button', { name: /delete doomed/i }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith('c1'));
    expect(screen.queryByText('Doomed')).not.toBeInTheDocument();
  });

  it('restores the row when the delete fails', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({
      conversations: [conversation('c1', 'Doomed', new Date().toISOString())],
    });
    vi.spyOn(api, 'deleteConversation').mockRejectedValue(new api.ApiError(500, 'nope'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSidebar();
    await waitFor(() => screen.getByText('Doomed'));
    fireEvent.click(screen.getByRole('button', { name: /delete doomed/i }));

    await waitFor(() => expect(screen.getByText('Doomed')).toBeInTheDocument());
  });

  it('offers search only once the list is long enough to need it', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({
      conversations: Array.from({ length: 8 }, (_, i) =>
        conversation(`c${i}`, i === 0 ? 'Photosynthesis' : `Chat ${i}`, new Date().toISOString())
      ),
    });

    renderSidebar();
    const search = await waitFor(() => screen.getByLabelText(/search chats/i));

    fireEvent.change(search, { target: { value: 'photo' } });
    expect(screen.getByText('Photosynthesis')).toBeInTheDocument();
    expect(screen.queryByText('Chat 1')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText(/no chats match that/i)).toBeInTheDocument();
  });
});
