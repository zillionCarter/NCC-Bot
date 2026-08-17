import type { ArtifactContent, GraphParam, GraphSeries, ModelContent, SourceItem, WorkedStep } from '../types';
import type { FunctionCall } from './client';

const STRING = { type: 'STRING' } as const;
const NUMBER = { type: 'NUMBER' } as const;

export const TOOL_DECLARATIONS = [
  {
    name: 'render_worked_example',
    description:
      "Solve a PARALLEL version of a problem the student was set — same method and difficulty, different numbers — step by step. Required whenever the student asks for the answer to a specific problem they have to hand in. Never put their own problem's answer in the steps.",
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: "The method being demonstrated, e.g. 'Solving linear equations'." },
        original_restated: {
          type: 'STRING',
          description: "The student's own problem, restated but NOT solved.",
        },
        parallel_problem: {
          type: 'STRING',
          description:
            'A structurally identical problem with different values, which you will solve in full. Use LaTeX.',
        },
        what_changed: {
          type: 'STRING',
          description: "Which values you swapped, e.g. 'coefficient 3 became 5, constant 7 became 4'.",
        },
        steps: {
          type: 'ARRAY',
          description: 'Every step of the working, in order. Do not skip algebra.',
          items: {
            type: 'OBJECT',
            properties: {
              latex: { type: 'STRING', description: 'The mathematical line for this step, LaTeX without $ delimiters.' },
              explanation: { type: 'STRING', description: 'What was done in this step and why.' },
            },
            required: ['explanation'],
          },
        },
        final_answer: { type: 'STRING', description: 'The answer to the PARALLEL problem, in LaTeX.' },
        your_turn: {
          type: 'STRING',
          description: "A direct instruction telling the student how to apply this method to their own problem.",
        },
      },
      required: ['original_restated', 'parallel_problem', 'what_changed', 'steps', 'final_answer', 'your_turn'],
    },
  },
  {
    name: 'render_interactive_graph',
    description:
      "Plot something the student can manipulate. Use mode 'function' with params for algebra/calculus so coefficients become sliders; use mode 'series' for datasets.",
    parameters: {
      type: 'OBJECT',
      properties: {
        mode: { type: 'STRING', description: "'function' or 'series'." },
        title: STRING,
        caption: { type: 'STRING', description: 'What the student should notice or try.' },
        chartType: { type: 'STRING', description: "series mode: 'line', 'bar', 'area' or 'scatter'." },
        labels: { type: 'ARRAY', description: 'series mode: x-axis category labels.', items: STRING },
        series: {
          type: 'ARRAY',
          description: 'series mode: one or more named data series.',
          items: {
            type: 'OBJECT',
            properties: { name: STRING, values: { type: 'ARRAY', items: NUMBER } },
            required: ['name', 'values'],
          },
        },
        xLabel: STRING,
        yLabel: STRING,
        expressions: {
          type: 'ARRAY',
          description:
            "function mode: expressions in x, e.g. 'a*x^2 + b*x + c'. Supported: + - * / ^ ( ), sin cos tan asin acos atan sqrt abs ln log exp, pi, e.",
          items: STRING,
        },
        params: {
          type: 'ARRAY',
          description:
            'function mode: adjustable coefficients used in the expressions, rendered as sliders. Start each one at a value that shows the interesting case, never a degenerate one — a quadratic demo opening at a=0 draws a straight line and teaches nothing.',
          items: {
            type: 'OBJECT',
            properties: { name: STRING, value: NUMBER, min: NUMBER, max: NUMBER, step: NUMBER },
            required: ['name', 'value', 'min', 'max'],
          },
        },
        xMin: NUMBER,
        xMax: NUMBER,
      },
      required: ['mode'],
    },
  },
  {
    name: 'render_diagram',
    description:
      'Draw a diagram with Mermaid: process flow, hierarchy, timeline, cycle or sequence. Keep node labels short and avoid quotes, parentheses and semicolons inside them.',
    parameters: {
      type: 'OBJECT',
      properties: {
        kind: { type: 'STRING', description: "e.g. 'flowchart', 'mindmap', 'timeline', 'sequence'." },
        mermaid: { type: 'STRING', description: 'Complete valid Mermaid source, including the opening directive.' },
        title: STRING,
        caption: STRING,
      },
      required: ['kind', 'mermaid'],
    },
  },
  {
    name: 'render_table',
    description: 'Display structured data or a comparison as a sortable table. Cells may contain inline LaTeX.',
    parameters: {
      type: 'OBJECT',
      properties: {
        columns: { type: 'ARRAY', items: STRING },
        rows: { type: 'ARRAY', description: 'Each row is an array of cells matching the columns.', items: { type: 'ARRAY', items: STRING } },
        title: STRING,
        caption: STRING,
      },
      required: ['columns', 'rows'],
    },
  },
  {
    name: 'render_summary',
    description: 'Condense notes, an article or a chapter the student supplied into a structured summary.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: STRING,
        tldr: { type: 'STRING', description: 'One or two sentences capturing the whole thing.' },
        key_points: { type: 'ARRAY', items: STRING },
        key_terms: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { term: STRING, definition: STRING },
            required: ['term', 'definition'],
          },
        },
      },
      required: ['tldr', 'key_points'],
    },
  },
  {
    name: 'render_study_plan',
    description: 'Lay out a revision timetable as dated sessions with tickable tasks.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: STRING,
        sessions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              label: { type: 'STRING', description: "e.g. 'Session 1' or 'Monday'." },
              date: { type: 'STRING', description: 'ISO date if a real date is known.' },
              focus: { type: 'STRING', description: 'What this session covers.' },
              minutes: NUMBER,
              tasks: { type: 'ARRAY', items: STRING },
            },
            required: ['label', 'focus', 'tasks'],
          },
        },
      },
      required: ['sessions'],
    },
  },
  {
    name: 'find_sources',
    description:
      'Find real, citable websites for an assignment or research topic. Use this instead of writing URLs yourself — URLs you write from memory are frequently wrong.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'STRING', description: 'The research topic, as specifically as possible.' },
        context: {
          type: 'STRING',
          description: 'What the assignment needs from these sources, e.g. subject, year level, angle required.',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'render_flashcards',
    description: 'Display a set of study flashcards.',
    parameters: {
      type: 'OBJECT',
      properties: {
        cards: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { front: STRING, back: STRING },
            required: ['front', 'back'],
          },
        },
      },
      required: ['cards'],
    },
  },
  {
    name: 'render_practice_test',
    description: 'Display an interactive practice test the student answers and submits for marking.',
    parameters: {
      type: 'OBJECT',
      properties: {
        questions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              prompt: STRING,
              choices: { type: 'ARRAY', items: STRING },
              correct_answer: STRING,
              explanation: STRING,
            },
            required: ['prompt', 'correct_answer', 'explanation'],
          },
        },
      },
      required: ['questions'],
    },
  },
] as const;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function functionCallToContent(call: FunctionCall): ArtifactContent {
  const args = call.args ?? {};
  switch (call.name) {
    case 'render_flashcards':
      return { type: 'flashcards', cards: args.cards as { front: string; back: string }[] };
    case 'render_practice_test':
      return {
        type: 'practice_test',
        questions: args.questions as {
          prompt: string;
          choices?: string[];
          correct_answer: string;
          explanation: string;
        }[],
      };
    case 'render_graph':
      return {
        type: 'graph',
        chartType: asString(args.chartType, 'line'),
        data: args.data,
        labels: asStringArray(args.labels),
        title: asString(args.title) || undefined,
      };
    case 'render_worked_example':
      return {
        type: 'worked_example',
        title: asString(args.title) || undefined,
        original_restated: asString(args.original_restated),
        parallel_problem: asString(args.parallel_problem),
        what_changed: asString(args.what_changed),
        steps: (Array.isArray(args.steps) ? (args.steps as WorkedStep[]) : []).map((s) => ({
          latex: asString(s?.latex) || undefined,
          explanation: asString(s?.explanation),
        })),
        final_answer: asString(args.final_answer),
        your_turn: asString(args.your_turn),
      };
    case 'render_interactive_graph':
      return {
        type: 'interactive_graph',
        mode: args.mode === 'function' ? 'function' : 'series',
        title: asString(args.title) || undefined,
        caption: asString(args.caption) || undefined,
        chartType: asString(args.chartType) || undefined,
        labels: asStringArray(args.labels),
        series: Array.isArray(args.series)
          ? (args.series as GraphSeries[]).map((s) => ({
              name: asString(s?.name, 'Series'),
              values: Array.isArray(s?.values) ? s.values.filter((v): v is number => typeof v === 'number') : [],
            }))
          : undefined,
        xLabel: asString(args.xLabel) || undefined,
        yLabel: asString(args.yLabel) || undefined,
        expressions: asStringArray(args.expressions),
        params: Array.isArray(args.params)
          ? (args.params as GraphParam[])
              .filter((p) => typeof p?.name === 'string')
              .map((p) => ({
                name: p.name,
                value: asNumber(p.value) ?? 1,
                min: asNumber(p.min) ?? -10,
                max: asNumber(p.max) ?? 10,
                step: asNumber(p.step),
              }))
          : undefined,
        xMin: asNumber(args.xMin),
        xMax: asNumber(args.xMax),
      };
    case 'render_diagram':
      return {
        type: 'diagram',
        kind: asString(args.kind, 'flowchart'),
        mermaid: asString(args.mermaid),
        title: asString(args.title) || undefined,
        caption: asString(args.caption) || undefined,
      };
    case 'render_table':
      return {
        type: 'table',
        columns: asStringArray(args.columns),
        rows: Array.isArray(args.rows) ? (args.rows as unknown[]).map((r) => asStringArray(r)) : [],
        title: asString(args.title) || undefined,
        caption: asString(args.caption) || undefined,
      };
    case 'render_summary':
      return {
        type: 'summary',
        title: asString(args.title) || undefined,
        tldr: asString(args.tldr),
        key_points: asStringArray(args.key_points),
        key_terms: Array.isArray(args.key_terms)
          ? (args.key_terms as { term: string; definition: string }[])
              .filter((t) => typeof t?.term === 'string')
              .map((t) => ({ term: t.term, definition: asString(t.definition) }))
          : [],
      };
    case 'render_study_plan':
      return {
        type: 'study_plan',
        title: asString(args.title) || undefined,
        sessions: (Array.isArray(args.sessions) ? args.sessions : []).map((s) => {
          const session = (s ?? {}) as Record<string, unknown>;
          return {
            label: asString(session.label, 'Session'),
            date: asString(session.date) || undefined,
            focus: asString(session.focus),
            minutes: asNumber(session.minutes),
            tasks: asStringArray(session.tasks),
          };
        }),
      };
    default:
      throw new Error(`unknown tool: ${call.name}`);
  }
}

export function modelContentToText(content: ModelContent): string {
  switch (content.type) {
    case 'text':
      return content.text;
    case 'composite':
      // Both halves go into history: the prose is what the model actually said, and
      // the card summary lets it refer back to what it drew.
      return `${content.text}\n${modelContentToText(content.artifact)}`;
    case 'flashcards':
      return `[Generated ${content.cards.length} flashcard${content.cards.length === 1 ? '' : 's'}]`;
    case 'practice_test':
      return `[Generated a ${content.questions.length}-question practice test]`;
    case 'graph':
      return `[Generated a ${content.chartType} graph${content.title ? `: ${content.title}` : ''}]`;
    case 'worked_example':
      // The parallel problem is safe to echo into history — it is deliberately
      // not the student's own problem — and keeping it lets the model refer back
      // to the method it just demonstrated.
      return `[Worked a parallel example. Their problem: ${content.original_restated}. Parallel problem solved instead: ${content.parallel_problem} (answer ${content.final_answer})]`;
    case 'interactive_graph':
      return `[Generated an interactive ${content.mode} graph${content.title ? `: ${content.title}` : ''}]`;
    case 'diagram':
      return `[Generated a ${content.kind} diagram${content.title ? `: ${content.title}` : ''}]`;
    case 'table':
      return `[Generated a table${content.title ? `: ${content.title}` : ''} with ${content.rows.length} rows]`;
    case 'summary':
      return `[Generated a summary${content.title ? `: ${content.title}` : ''}. TL;DR: ${content.tldr}]`;
    case 'study_plan':
      return `[Generated a study plan with ${content.sessions.length} sessions]`;
    case 'sources':
      return `[Found ${content.items.length} sources on ${content.topic}: ${content.items
        .map((i) => i.domain)
        .join(', ')}]`;
  }
}

// REQUIRED CHOKEPOINT: this is the only thing standing between stored ModelContent
// (which may contain practice-test correct_answer/explanation fields) and a client
// response. Any route that might return ModelContent to a client — including any
// future conversation-history endpoint — must pass it through this function rather
// than reimplementing the redaction, or it risks leaking practice-test answers.
//
// Note on worked_example: its answer is deliberately NOT redacted. It answers a
// parallel problem, never the student's own, so showing it in full is the point.
export function toClientSafeContent(content: ModelContent): ModelContent {
  // A practice test wrapped in a composite is still a practice test — recursing here
  // is what stops the answers leaking through the new reply shape.
  if (content.type === 'composite') {
    return { ...content, artifact: toClientSafeContent(content.artifact) as ArtifactContent };
  }
  if (content.type !== 'practice_test') return content;
  return {
    type: 'practice_test',
    questions: content.questions.map(({ prompt, choices }) => ({
      prompt,
      choices,
      correct_answer: '',
      explanation: '',
    })),
  };
}

/** Pairs a card with the prose the model wrote to introduce it. */
export function compositeContent(text: string, artifact: ArtifactContent): ModelContent {
  const trimmed = text.trim();
  return trimmed ? { type: 'composite', text: trimmed, artifact } : artifact;
}

export function sourcesContent(
  topic: string,
  items: SourceItem[],
  extras: { note?: string; searchQueries?: string[]; searchEntryPoint?: string } = {}
): ArtifactContent {
  return {
    type: 'sources',
    topic,
    items,
    note: extras.note,
    search_queries: extras.searchQueries,
    search_entry_point: extras.searchEntryPoint,
  };
}
