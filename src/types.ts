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

/** One step of a worked example. `latex` holds the mathematical line, if any. */
export interface WorkedStep {
  latex?: string;
  explanation: string;
}

export interface SourceItem {
  title: string;
  url: string;
  domain: string;
  why?: string;
}

/** A named, adjustable coefficient in a plotted expression (the slider). */
export interface GraphParam {
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number;
}

export interface GraphSeries {
  name: string;
  values: number[];
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
  // Legacy single-series graph. Retained because conversations created before
  // interactive_graph existed still hold rows with this shape, and
  // conversationsRoutes parses stored JSON straight back out. The frontend
  // renders it through the same component as interactive_graph.
  | { type: 'graph'; chartType: string; data: unknown; labels?: string[]; title?: string }
  | {
      // The product's centrepiece: never the student's own problem, always a
      // structurally identical one with different values, solved in full.
      type: 'worked_example';
      title?: string;
      original_restated: string;
      parallel_problem: string;
      what_changed: string;
      steps: WorkedStep[];
      final_answer: string;
      your_turn: string;
    }
  | { type: 'diagram'; kind: string; mermaid: string; title?: string; caption?: string }
  | { type: 'table'; columns: string[]; rows: string[][]; title?: string; caption?: string }
  | {
      type: 'interactive_graph';
      mode: 'series' | 'function';
      title?: string;
      caption?: string;
      // series mode
      chartType?: string;
      labels?: string[];
      series?: GraphSeries[];
      xLabel?: string;
      yLabel?: string;
      // function mode
      expressions?: string[];
      params?: GraphParam[];
      xMin?: number;
      xMax?: number;
    }
  | {
      type: 'summary';
      title?: string;
      tldr: string;
      key_points: string[];
      key_terms: { term: string; definition: string }[];
    }
  | {
      type: 'study_plan';
      title?: string;
      sessions: { label: string; date?: string; focus: string; minutes?: number; tasks: string[] }[];
    }
  | {
      type: 'sources';
      topic: string;
      note?: string;
      items: SourceItem[];
      search_queries?: string[];
      // Google's own Search Suggestions markup. Grounding's terms of service
      // require displaying it next to a grounded answer, so it is carried
      // through to the client and rendered in a sandboxed iframe.
      search_entry_point?: string;
    };
