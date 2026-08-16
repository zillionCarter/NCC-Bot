import { useState, type FormEvent, type KeyboardEvent } from 'react';

export function MessageInput({ onSend, disabled }: { onSend: (message: string) => void; disabled: boolean }) {
  const [value, setValue] = useState('');

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-line bg-surface p-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask NCC Bot anything…"
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none rounded border border-line bg-canvas px-3 py-2 text-ink disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded bg-primary px-4 py-2 text-primary-ink disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
