import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { GraphParam, ModelContent } from '../../types';
import { samplePoints, freeVariables, ExpressionError } from '../lib/mathExpression';
import { Artifact, GhostButton } from './Artifact';

type GraphContent = Extract<ModelContent, { type: 'interactive_graph' }>;

/* Series colours are assigned from the design tokens rather than Recharts'
   defaults, so a chart never introduces a colour the rest of the app lacks. */
const SERIES_COLORS = [
  'var(--color-accent)',
  'var(--color-correct)',
  'var(--color-wrong)',
  'var(--color-graphite)',
];

/* Charts scale with the viewport instead of sitting at one fixed height: short on a
   phone, taller once there is room for the detail to be worth reading. */
const CHART_BOX = 'h-56 sm:h-64 lg:h-72';

const AXIS_PROPS = {
  stroke: 'var(--color-pencil)',
  tick: { fill: 'var(--color-pencil)', fontSize: 11, fontFamily: 'var(--font-mono)' },
} as const;

const TOOLTIP_PROPS = {
  contentStyle: {
    background: 'var(--color-raised)',
    border: '1px solid var(--color-rule-strong)',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    color: 'var(--color-ink)',
  },
  labelStyle: { color: 'var(--color-graphite)', fontFamily: 'var(--font-mono)', fontSize: 11 },
} as const;

function SeriesChart({ content }: { content: GraphContent }) {
  const series = content.series ?? [];
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const length = Math.max(0, ...series.map((s) => s.values.length));
    return Array.from({ length }, (_, i) => {
      const row: Record<string, string | number> = { label: content.labels?.[i] ?? String(i + 1) };
      for (const s of series) row[s.name] = s.values[i];
      return row;
    });
  }, [series, content.labels]);

  if (rows.length === 0) {
    return <p className="text-small text-pencil">This chart arrived without any data to plot.</p>;
  }

  const visible = series.filter((s) => !hidden.has(s.name));

  function toggle(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      // Never let the last visible series be hidden — an empty chart reads as broken.
      if (next.has(name)) next.delete(name);
      else if (series.length - next.size > 1) next.add(name);
      return next;
    });
  }

  const shared = (
    <>
      <CartesianGrid strokeDasharray="2 4" stroke="var(--color-rule)" vertical={false} />
      <XAxis
        dataKey="label"
        {...AXIS_PROPS}
        label={
          content.xLabel
            ? { value: content.xLabel, position: 'insideBottom', offset: -4, fill: 'var(--color-graphite)', fontSize: 12 }
            : undefined
        }
      />
      <YAxis
        {...AXIS_PROPS}
        label={
          content.yLabel
            ? { value: content.yLabel, angle: -90, position: 'insideLeft', fill: 'var(--color-graphite)', fontSize: 12 }
            : undefined
        }
      />
      <Tooltip {...TOOLTIP_PROPS} />
      {series.length > 1 && (
        <Legend
          onClick={(entry) => toggle(String(entry.value))}
          wrapperStyle={{ fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
        />
      )}
    </>
  );

  const type = content.chartType ?? 'line';

  return (
    <div className={CHART_BOX}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'bar' ? (
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: content.xLabel ? 16 : 0, left: 0 }}>
          {shared}
          {visible.map((s, i) => (
            <Bar key={s.name} dataKey={s.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      ) : type === 'area' ? (
        <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: content.xLabel ? 16 : 0, left: 0 }}>
          {shared}
          {visible.map((s, i) => (
            <Area
              key={s.name}
              dataKey={s.name}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              fill={SERIES_COLORS[i % SERIES_COLORS.length]}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      ) : type === 'scatter' ? (
        <ScatterChart data={rows} margin={{ top: 4, right: 8, bottom: content.xLabel ? 16 : 0, left: 0 }}>
          {shared}
          {visible.map((s, i) => (
            <Scatter key={s.name} dataKey={s.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
          ))}
        </ScatterChart>
      ) : (
        <LineChart data={rows} margin={{ top: 4, right: 8, bottom: content.xLabel ? 16 : 0, left: 0 }}>
          {shared}
          {visible.map((s, i) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Plots one or more expressions in x, with every named coefficient exposed as a
 * slider. Dragging `a` in `a*x^2 + b*x + c` and watching the parabola open, close
 * and invert is the whole reason this exists.
 */
function FunctionChart({ content }: { content: GraphContent }) {
  const expressions = (content.expressions ?? []).filter(Boolean);
  const xMin = content.xMin ?? -10;
  const xMax = content.xMax ?? 10;

  // A model that names a coefficient in the expression but forgets to declare it
  // would otherwise render a permanently broken plot; infer the missing ones.
  const declared = content.params ?? [];
  const params: GraphParam[] = useMemo(() => {
    const byName = new Map(declared.map((p) => [p.name, p]));
    for (const expression of expressions) {
      let names: string[] = [];
      try {
        names = freeVariables(expression);
      } catch {
        continue;
      }
      for (const name of names) {
        if (name !== 'x' && !byName.has(name)) {
          byName.set(name, { name, value: 1, min: -5, max: 5, step: 0.1 });
        }
      }
    }
    return [...byName.values()];
  }, [declared, expressions]);

  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(params.map((p) => [p.name, p.value]))
  );

  const { rows, error } = useMemo(() => {
    if (expressions.length === 0) return { rows: [], error: 'This plot arrived without an expression.' };
    try {
      const sampled = expressions.map((expression) => samplePoints(expression, values, xMin, xMax));
      const points = sampled[0].map((point, i) => {
        const row: Record<string, number | null> = { x: Number(point.x.toFixed(4)) };
        sampled.forEach((series, index) => {
          row[expressions[index]] = series[i].y === null ? null : Number(series[i].y!.toFixed(4));
        });
        return row;
      });
      return { rows: points, error: null as string | null };
    } catch (err) {
      return {
        rows: [],
        error: err instanceof ExpressionError ? err.message : "That expression couldn't be plotted.",
      };
    }
  }, [expressions, values, xMin, xMax]);

  if (error) {
    return <p className="font-mono text-small text-wrong">{error}</p>;
  }

  return (
    <div>
      <div className={CHART_BOX}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-grid)" />
          <XAxis dataKey="x" type="number" domain={[xMin, xMax]} {...AXIS_PROPS} allowDataOverflow />
          <YAxis {...AXIS_PROPS} />
          <Tooltip {...TOOLTIP_PROPS} />
          {expressions.length > 1 && <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)' }} />}
          {expressions.map((expression, i) => (
            <Line
              key={expression}
              type="monotone"
              dataKey={expression}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={false}
              // Asymptotes and undefined regions come back as null; breaking the
              // line there is more honest than joining across the gap.
              connectNulls={false}
            />
          ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {params.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-rule pt-4">
          {params.map((param) => (
            <label key={param.name} className="flex items-center gap-3">
              <span className="w-8 shrink-0 font-mono text-small text-accent">{param.name}</span>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step ?? 0.1}
                value={values[param.name] ?? param.value}
                onChange={(e) => setValues((prev) => ({ ...prev, [param.name]: Number(e.target.value) }))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-rule accent-accent"
                aria-label={`Coefficient ${param.name}`}
              />
              <output className="w-14 shrink-0 text-right font-mono text-small text-graphite">
                {(values[param.name] ?? param.value).toFixed(2)}
              </output>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Default-exported as well, so the message thread can load it lazily and keep
// Recharts out of the initial bundle.
export default function InteractiveGraph({ content }: { content: GraphContent }) {
  const [resetKey, setResetKey] = useState(0);
  const isFunction = content.mode === 'function';

  return (
    <Artifact
      label={isFunction ? 'Interactive plot' : 'Chart'}
      title={content.title}
      caption={content.caption}
      actions={
        isFunction ? <GhostButton onClick={() => setResetKey((k) => k + 1)}>Reset</GhostButton> : undefined
      }
    >
      {isFunction ? (
        // Remounting is the simplest correct reset: slider state lives in the child.
        <FunctionChart key={resetKey} content={content} />
      ) : (
        <SeriesChart content={content} />
      )}
    </Artifact>
  );
}
