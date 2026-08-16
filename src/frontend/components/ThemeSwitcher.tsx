import { useTheme, type Theme } from '../context/ThemeContext';

const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  ncc: 'NCC',
};

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <select
      aria-label="Theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value as Theme)}
      className="rounded border border-line bg-canvas px-2 py-1 text-sm text-ink"
    >
      {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
        <option key={t} value={t}>
          {THEME_LABELS[t]}
        </option>
      ))}
    </select>
  );
}
