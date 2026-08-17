import type { ModelContent } from '../../types';

type GraphContent = Extract<ModelContent, { type: 'interactive_graph' }>;
type LegacyGraphContent = Extract<ModelContent, { type: 'graph' }>;

/**
 * Normalizes the legacy single-series `graph` shape onto the current one, so
 * conversations created before interactive_graph existed still render.
 *
 * Kept out of the chart component so the message thread can call it without
 * pulling Recharts into the initial bundle.
 */
export function fromLegacyGraph(content: LegacyGraphContent): GraphContent {
  const values = Array.isArray(content.data)
    ? (content.data as unknown[]).filter((value): value is number => typeof value === 'number')
    : [];

  return {
    type: 'interactive_graph',
    mode: 'series',
    chartType: content.chartType,
    title: content.title,
    labels: content.labels,
    series: [{ name: content.title || 'Value', values }],
  };
}
