import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Chat } from './Chat';
import * as api from '../api/client';
import type { StreamHandlers } from '../api/client';
import { AuthProvider } from '../context/AuthContext';

function renderChat(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/c/:conversationId" element={<Chat />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

function composer() {
  return screen.getByLabelText('Message');
}

beforeEach(() => {
  vi.spyOn(api, 'getMe').mockResolvedValue({
    user: { id: 'u1', email: 'a@b.edu.au', name: 'Sam', role: 'student', grade_or_subject: 'Year 9', onboarded: 1 },
  });
  vi.spyOn(api, 'listConversations').mockResolvedValue({ conversations: [] });
});

afterEach(() => vi.restoreAllMocks());

describe('Chat', () => {
  it('opens on the welcome screen with a greeting and starting points', async () => {
    renderChat();
    await waitFor(() => expect(screen.getByText(/Sam\./)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /get unstuck on a problem/i })).toBeInTheDocument();
    // The expectation-setting line matters: it is what stops the first refusal
    // reading as a malfunction.
    expect(screen.getByText(/won.t write your essay/i)).toBeInTheDocument();
  });

  it('loads a suggestion into the composer instead of sending it outright', async () => {
    renderChat();
    await waitFor(() => screen.getByRole('button', { name: /plan my revision/i }));
    fireEvent.click(screen.getByRole('button', { name: /plan my revision/i }));

    expect((composer() as HTMLTextAreaElement).value).toMatch(/revision plan/i);
  });

  it('streams a reply, showing deltas as they arrive', async () => {
    let captured: StreamHandlers | null = null;
    vi.spyOn(api, 'sendMessageStream').mockImplementation((_message, _id, handlers) => {
      captured = handlers;
      return () => {};
    });

    renderChat();
    await waitFor(() => screen.getByLabelText('Message'));

    fireEvent.change(composer(), { target: { value: 'what is an api' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(screen.getByText('what is an api')).toBeInTheDocument();

    captured!.onDelta!('An API is ');
    await waitFor(() => expect(screen.getByText(/An API is/)).toBeInTheDocument());

    captured!.onDelta!('a contract between programs.');
    captured!.onDone({
      conversationId: 'c1',
      messageId: 'm1',
      message: { type: 'text', text: 'An API is a contract between programs.' },
    });

    await waitFor(() =>
      expect(screen.getByText('An API is a contract between programs.')).toBeInTheDocument()
    );
  });

  it('clears streamed preamble and names the work when a tool takes over', async () => {
    let captured: StreamHandlers | null = null;
    vi.spyOn(api, 'sendMessageStream').mockImplementation((_message, _id, handlers) => {
      captured = handlers;
      return () => {};
    });

    renderChat();
    await waitFor(() => screen.getByLabelText('Message'));
    fireEvent.change(composer(), { target: { value: 'solve 3x + 7 = 22' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    captured!.onDelta!('Let me show you on a similar one');
    await waitFor(() => screen.getByText(/Let me show you/));

    captured!.onTool!('render_worked_example');
    await waitFor(() => expect(screen.getByText(/parallel problem/i)).toBeInTheDocument());
    // The half-sentence must not linger above the card that replaced it.
    expect(screen.queryByText(/Let me show you/)).not.toBeInTheDocument();
  });

  it('drops the unanswered question and offers a retry when the turn fails', async () => {
    let captured: StreamHandlers | null = null;
    const stream = vi.spyOn(api, 'sendMessageStream').mockImplementation((_message, _id, handlers) => {
      captured = handlers;
      return () => {};
    });

    renderChat();
    await waitFor(() => screen.getByLabelText('Message'));
    fireEvent.change(composer(), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    captured!.onError('NCC Bot is unavailable right now.');

    await waitFor(() => expect(screen.getByText(/unavailable right now/i)).toBeInTheDocument());
    // A lone question with no reply would misrepresent what happened.
    expect(screen.queryByText('hello')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(stream).toHaveBeenCalledTimes(2);
    expect(stream.mock.calls[1][0]).toBe('hello');
  });

  it('swaps Send for Stop while a reply is in flight, and aborts on Stop', async () => {
    const abort = vi.fn();
    vi.spyOn(api, 'sendMessageStream').mockImplementation(() => abort);
    vi.spyOn(api, 'getConversation').mockResolvedValue({ messages: [] });

    renderChat();
    await waitFor(() => screen.getByLabelText('Message'));
    fireEvent.change(composer(), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const stopButton = await waitFor(() => screen.getByRole('button', { name: /stop/i }));
    fireEvent.click(stopButton);
    expect(abort).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: /^send$/i })).toBeInTheDocument());
  });

  it('loads history for an existing conversation from the URL', async () => {
    vi.spyOn(api, 'getConversation').mockResolvedValue({
      messages: [
        { id: 'h1', role: 'user', content: { type: 'text', text: 'earlier question' }, created_at: '2026-01-01' },
        { id: 'h2', role: 'model', content: { type: 'text', text: 'earlier answer' }, created_at: '2026-01-01' },
      ],
    });

    renderChat('/c/existing-convo');

    await waitFor(() => expect(screen.getByText('earlier question')).toBeInTheDocument());
    expect(screen.getByText('earlier answer')).toBeInTheDocument();
    expect(api.getConversation).toHaveBeenCalledWith('existing-convo');
  });

  it('passes the conversation id along on a follow-up message', async () => {
    vi.spyOn(api, 'getConversation').mockResolvedValue({ messages: [] });
    const stream = vi.spyOn(api, 'sendMessageStream').mockImplementation(() => () => {});

    renderChat('/c/existing-convo');
    await waitFor(() => screen.getByLabelText('Message'));
    fireEvent.change(composer(), { target: { value: 'follow up' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(stream.mock.calls[0][1]).toBe('existing-convo');
  });

  it('will not send an empty or whitespace-only message', async () => {
    const stream = vi.spyOn(api, 'sendMessageStream').mockImplementation(() => () => {});
    renderChat();
    await waitFor(() => screen.getByLabelText('Message'));

    fireEvent.change(composer(), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
    fireEvent.submit(composer());
    expect(stream).not.toHaveBeenCalled();
  });
});
