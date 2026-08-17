import { useMemo, useState } from 'react';
import type { ModelContent } from '../../types';
import { Markdown } from './Markdown';
import { Artifact } from './Artifact';

type TableContent = Extract<ModelContent, { type: 'table' }>;

type SortState = { column: number; direction: 'asc' | 'desc' } | null;

/** Sorts numerically when a column holds numbers, alphabetically otherwise. */
function compare(a: string, b: string): number {
  const numA = Number(a.replace(/[,\s]/g, ''));
  const numB = Number(b.replace(/[,\s]/g, ''));
  if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function DataTable({ content }: { content: TableContent }) {
  const [sort, setSort] = useState<SortState>(null);

  const rows = useMemo(() => {
    if (!sort) return content.rows;
    const sorted = [...content.rows].sort((a, b) =>
      compare(a[sort.column] ?? '', b[sort.column] ?? '')
    );
    return sort.direction === 'desc' ? sorted.reverse() : sorted;
  }, [content.rows, sort]);

  function toggleSort(column: number) {
    setSort((prev) => {
      if (prev?.column !== column) return { column, direction: 'asc' };
      // Third click clears the sort and restores the model's own ordering, which
      // is sometimes meaningful (chronology, steps, rank).
      return prev.direction === 'asc' ? { column, direction: 'desc' } : null;
    });
  }

  if (content.columns.length === 0) {
    return (
      <Artifact label="Table" title={content.title}>
        <p className="text-small text-pencil">This table arrived without any columns.</p>
      </Artifact>
    );
  }

  return (
    <Artifact label="Table" title={content.title} caption={content.caption}>
      <div className="subtle-scroll -mx-1 overflow-x-auto px-1">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr>
              {content.columns.map((column, index) => {
                const active = sort?.column === index;
                return (
                  <th key={index} scope="col" className="border-b border-rule-strong p-0 text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort(index)}
                      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="flex w-full items-center gap-1.5 px-2 py-2 font-mono text-micro font-medium uppercase tracking-[0.08em] text-pencil transition-colors hover:text-ink"
                    >
                      <span className="whitespace-nowrap">{column}</span>
                      <span aria-hidden className={active ? 'text-accent' : 'text-transparent'}>
                        {active && sort.direction === 'desc' ? '↓' : '↑'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-rule last:border-0 hover:bg-sunken">
                {content.columns.map((_, cellIndex) => (
                  <td key={cellIndex} className="px-2 py-2 align-top">
                    <Markdown inline>{row[cellIndex] ?? ''}</Markdown>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Artifact>
  );
}
