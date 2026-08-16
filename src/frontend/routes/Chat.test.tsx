import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Chat } from './Chat';
import * as api from '../api/client';

afterEach(() => vi.restoreAllMocks());

describe('Chat', () => {
  it('sends a message and renders the reply', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({ conversations: [] });
    vi.spyOn(api, 'sendMessage').mockResolvedValue({
      conversationId: 'c1',
      messageId: 'm1',
      message: { type: 'text', text: 'An API is a way for programs to talk to each other.' },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/c/:conversationId" element={<Chat />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/ask ncc bot/i), { target: { value: 'what is an api' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByText('what is an api')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('An API is a way for programs to talk to each other.')).toBeInTheDocument()
    );
    expect(api.sendMessage).toHaveBeenCalledWith('what is an api', undefined);
  });

  it('loads history for an existing conversation from the URL', async () => {
    vi.spyOn(api, 'listConversations').mockResolvedValue({ conversations: [] });
    vi.spyOn(api, 'getConversation').mockResolvedValue({
      messages: [
        { id: 'h1', role: 'user', content: { type: 'text', text: 'earlier question' }, created_at: '2026-01-01' },
        { id: 'h2', role: 'model', content: { type: 'text', text: 'earlier answer' }, created_at: '2026-01-01' },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/c/existing-convo']}>
        <Routes>
          <Route path="/c/:conversationId" element={<Chat />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('earlier question')).toBeInTheDocument());
    expect(screen.getByText('earlier answer')).toBeInTheDocument();
    expect(api.getConversation).toHaveBeenCalledWith('existing-convo');
  });
});
