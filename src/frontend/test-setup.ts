import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});

// Ensure localStorage and sessionStorage are available in jsdom
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] ?? null;
  }

  get length(): number {
    return Object.keys(this.store).length;
  }
}

if (typeof global.localStorage === 'undefined') {
  Object.defineProperty(global, 'localStorage', {
    value: new LocalStorageMock(),
    writable: true,
  });
}

if (typeof global.sessionStorage === 'undefined') {
  Object.defineProperty(global, 'sessionStorage', {
    value: new LocalStorageMock(),
    writable: true,
  });
}
