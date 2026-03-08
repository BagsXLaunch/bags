import { describe, it, expect } from 'vitest';
import { replyTemplates } from './reply.templates.js';

describe('replyTemplates', () => {
  it('generates success reply with coinUrl', () => {
    const result = replyTemplates.success('https://bags.fm/0xabc');
    expect(result).toContain('https://bags.fm/0xabc');
    expect(result).toContain('live');
  });

  it('generates validation failure', () => {
    const result = replyTemplates.validationFailure();
    expect(result).toContain('Could not launch');
    expect(result).toContain('$TICKER');
  });

  it('generates internal failure', () => {
    const result = replyTemplates.internalFailure();
    expect(result).toContain('try again later');
  });

  it('generates rate limited reply', () => {
    const result = replyTemplates.rateLimited();
    expect(result).toContain('daily launch limit');
  });
});
