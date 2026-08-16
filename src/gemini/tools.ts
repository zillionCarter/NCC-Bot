import type { ModelContent } from '../types';
import type { FunctionCall } from './client';

export const TOOL_DECLARATIONS = [
  {
    name: 'render_flashcards',
    description: 'Display a set of study flashcards to the student.',
    parameters: {
      type: 'OBJECT',
      properties: {
        cards: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { front: { type: 'STRING' }, back: { type: 'STRING' } },
            required: ['front', 'back'],
          },
        },
      },
      required: ['cards'],
    },
  },
  {
    name: 'render_practice_test',
    description: 'Display an interactive practice test to the student.',
    parameters: {
      type: 'OBJECT',
      properties: {
        questions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              prompt: { type: 'STRING' },
              choices: { type: 'ARRAY', items: { type: 'STRING' } },
              correct_answer: { type: 'STRING' },
              explanation: { type: 'STRING' },
            },
            required: ['prompt', 'correct_answer', 'explanation'],
          },
        },
      },
      required: ['questions'],
    },
  },
  {
    name: 'render_graph',
    description: 'Display a graph to help explain a concept.',
    parameters: {
      type: 'OBJECT',
      properties: {
        chartType: { type: 'STRING', description: "e.g. 'line', 'bar', 'scatter'" },
        data: { type: 'ARRAY', items: { type: 'NUMBER' } },
        labels: { type: 'ARRAY', items: { type: 'STRING' } },
        title: { type: 'STRING' },
      },
      required: ['chartType', 'data'],
    },
  },
] as const;

export function functionCallToContent(call: FunctionCall): ModelContent {
  switch (call.name) {
    case 'render_flashcards':
      return { type: 'flashcards', cards: call.args.cards as { front: string; back: string }[] };
    case 'render_practice_test':
      return {
        type: 'practice_test',
        questions: call.args.questions as {
          prompt: string;
          choices?: string[];
          correct_answer: string;
          explanation: string;
        }[],
      };
    case 'render_graph':
      return {
        type: 'graph',
        chartType: call.args.chartType as string,
        data: call.args.data,
        labels: call.args.labels as string[] | undefined,
        title: call.args.title as string | undefined,
      };
    default:
      throw new Error(`unknown tool: ${call.name}`);
  }
}

export function modelContentToText(content: ModelContent): string {
  switch (content.type) {
    case 'text':
      return content.text;
    case 'flashcards':
      return `[Generated ${content.cards.length} flashcard${content.cards.length === 1 ? '' : 's'}]`;
    case 'practice_test':
      return `[Generated a ${content.questions.length}-question practice test]`;
    case 'graph':
      return `[Generated a ${content.chartType} graph${content.title ? `: ${content.title}` : ''}]`;
  }
}

// REQUIRED CHOKEPOINT: this is the only thing standing between stored ModelContent
// (which may contain practice-test correct_answer/explanation fields) and a client
// response. Any route that might return ModelContent to a client — including any
// future conversation-history endpoint — must pass it through this function rather
// than reimplementing the redaction, or it risks leaking practice-test answers.
export function toClientSafeContent(content: ModelContent): ModelContent {
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
