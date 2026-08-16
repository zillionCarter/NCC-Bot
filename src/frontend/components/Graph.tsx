import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ModelContent } from '../../types';

type GraphContent = Extract<ModelContent, { type: 'graph' }>;

function toChartData(data: unknown, labels?: string[]): { label: string; value: number }[] {
  const values = Array.isArray(data) ? (data as number[]) : [];
  return values.map((value, i) => ({ label: labels?.[i] ?? `${i + 1}`, value }));
}

export function Graph({ content }: { content: GraphContent }) {
  const chartData = toChartData(content.data, content.labels);

  return (
    <div className="w-full max-w-lg">
      {content.title && <p className="mb-2 font-medium">{content.title}</p>}
      <ResponsiveContainer width="100%" height={240}>
        {content.chartType === 'bar' ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
            <XAxis dataKey="label" stroke="var(--color-ink-muted)" />
            <YAxis stroke="var(--color-ink-muted)" />
            <Tooltip />
            <Bar dataKey="value" fill="var(--color-primary)" />
          </BarChart>
        ) : content.chartType === 'scatter' ? (
          <ScatterChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
            <XAxis dataKey="label" stroke="var(--color-ink-muted)" />
            <YAxis dataKey="value" stroke="var(--color-ink-muted)" />
            <Tooltip />
            <Scatter dataKey="value" fill="var(--color-primary)" />
          </ScatterChart>
        ) : (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
            <XAxis dataKey="label" stroke="var(--color-ink-muted)" />
            <YAxis stroke="var(--color-ink-muted)" />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="var(--color-primary)" />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
