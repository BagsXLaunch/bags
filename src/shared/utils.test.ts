import { describe, it, expect } from 'vitest';
import { sanitizeText, normalizeTicker, generateCorrelationId } from './utils.js';

describe('sanitizeText', () => {
  it('removes zero-width characters', () => {
    expect(sanitizeText('hello\u200Bworld')).toBe('helloworld');
  });

  it('normalizes whitespace', () => {
    expect(sanitizeText('  hello   world  ')).toBe('hello world');
  });
});

describe('normalizeTicker', () => {
  it('uppercases', () => {
    expect(normalizeTicker('mytoken')).toBe('MYTOKEN');
  });

  it('removes non-alphanumeric', () => {
    expect(normalizeTicker('MY-TOKEN!')).toBe('MYTOKEN');
  });
});

describe('generateCorrelationId', () => {
  it('returns a string', () => {
    const id = generateCorrelationId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateCorrelationId()));
    expect(ids.size).toBe(100);
  });
});
