export type Role = 'student' | 'teacher' | 'admin';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GEMINI_API_KEY: string;
  RESEND_API_KEY: string;
  ADMIN_EMAIL: string;
  EMAIL_FROM: string;
  SITE_URL: string;
  ALLOW_ANY_EMAIL_DOMAIN?: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  grade_or_subject: string | null;
  onboarded: number;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
}

export type ModelContent =
  | { type: 'text'; text: string }
  | { type: 'flashcards'; cards: { front: string; back: string }[] }
  | {
      type: 'practice_test';
      questions: {
        prompt: string;
        choices?: string[];
        correct_answer: string;
        explanation: string;
      }[];
    }
  | { type: 'graph'; chartType: string; data: unknown; labels?: string[]; title?: string };
