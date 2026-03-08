import { nanoid } from 'nanoid';

export function generateCorrelationId(): string {
  return nanoid(12);
}

/** Remove zero-width characters and normalize whitespace */
export function sanitizeText(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '') // zero-width chars
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize ticker to uppercase alphanumeric */
export function normalizeTicker(ticker: string): string {
  return ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
