import type { Conversation, ModelContent, Role } from '../../types';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  grade_or_subject: string | null;
  onboarded: number;
}

export interface ClientMessage {
  id: string;
  role: 'user' | 'model';
  content: ModelContent;
  created_at: string;
}

export interface GradeResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `request to ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

export function requestMagicLink(email: string): Promise<{ ok: true }> {
  return request('/auth/request', { method: 'POST', body: JSON.stringify({ email }) });
}

export function logout(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<{ user: ApiUser }> {
  return request('/api/me');
}

export function submitOnboarding(name: string, gradeOrSubject: string): Promise<{ ok: true }> {
  return request('/api/onboarding', { method: 'POST', body: JSON.stringify({ name, gradeOrSubject }) });
}

export function listConversations(): Promise<{ conversations: Conversation[] }> {
  return request('/api/conversations');
}

export function getConversation(id: string): Promise<{ messages: ClientMessage[] }> {
  return request(`/api/conversations/${id}`);
}

export function sendMessage(
  message: string,
  conversationId?: string
): Promise<{ conversationId: string; messageId: string; message: ModelContent }> {
  return request('/api/chat', { method: 'POST', body: JSON.stringify({ message, conversationId }) });
}

export function gradePracticeTest(
  conversationId: string,
  messageId: string,
  answers: string[]
): Promise<{ results: GradeResult[] }> {
  return request(`/api/conversations/${conversationId}/messages/${messageId}/grade`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export function listUsers(): Promise<{ users: AdminUser[] }> {
  return request('/api/admin/users');
}

export function setUserRole(id: string, role: Role): Promise<{ ok: true }> {
  return request(`/api/admin/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) });
}
