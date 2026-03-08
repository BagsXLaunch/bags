import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env before importing parser
vi.mock('../../app/env.js', () => ({
  env: { BOT_USERNAME: 'BagsLaunch' },
}));

import { parseLaunchCommand } from './parse-launch-command.js';

describe('parseLaunchCommand', () => {
  describe('plain syntax', () => {
    it('parses @Bot "Name" $TICKER', () => {
      const result = parseLaunchCommand('@BagsLaunch "My Project" $MYPROJ');
      expect(result.success).toBe(true);
      expect(result.command?.name).toBe('My Project');
      expect(result.command?.ticker).toBe('MYPROJ');
    });

    it('parses with description after ticker', () => {
      const result = parseLaunchCommand('@BagsLaunch "Cool Token" $COOL a great token');
      expect(result.success).toBe(true);
      expect(result.command?.name).toBe('Cool Token');
      expect(result.command?.ticker).toBe('COOL');
      expect(result.command?.description).toBe('a great token');
    });

    it('normalizes ticker to uppercase', () => {
      const result = parseLaunchCommand('@BagsLaunch "Test" $mytoken');
      expect(result.success).toBe(true);
      expect(result.command?.ticker).toBe('MYTOKEN');
    });
  });

  describe('key/value syntax', () => {
    it('parses name:"..." ticker:"..."', () => {
      const result = parseLaunchCommand('@BagsLaunch name:"My Project" ticker:"PROJ"');
      expect(result.success).toBe(true);
      expect(result.command?.name).toBe('My Project');
      expect(result.command?.ticker).toBe('PROJ');
    });

    it('parses with description', () => {
      const result = parseLaunchCommand(
        '@BagsLaunch name:"My Project" ticker:"PROJ" desc:"short description"',
      );
      expect(result.success).toBe(true);
      expect(result.command?.description).toBe('short description');
    });
  });

  describe('validation', () => {
    it('rejects when bot is not mentioned', () => {
      const result = parseLaunchCommand('"My Project" $TICKER');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Bot was not mentioned');
    });

    it('rejects empty command', () => {
      const result = parseLaunchCommand('@BagsLaunch');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty command');
    });

    it('rejects name too short', () => {
      const result = parseLaunchCommand('@BagsLaunch "AB" $TK');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Name must be');
    });

    it('rejects ticker too short', () => {
      const result = parseLaunchCommand('@BagsLaunch "Valid Name" $X');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ticker must be');
    });

    it('rejects ticker too long', () => {
      const result = parseLaunchCommand('@BagsLaunch "Valid Name" $ABCDEFGHIJK');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ticker must be');
    });

    it('rejects missing ticker', () => {
      const result = parseLaunchCommand('@BagsLaunch "Valid Name"');
      expect(result.success).toBe(false);
    });
  });

  describe('sanitization', () => {
    it('handles zero-width characters', () => {
      const result = parseLaunchCommand('@BagsLaunch "My\u200B Project" $PROJ');
      expect(result.success).toBe(true);
      expect(result.command?.name).toBe('My Project');
    });

    it('handles extra whitespace', () => {
      const result = parseLaunchCommand('@BagsLaunch   "My  Project"   $PROJ');
      expect(result.success).toBe(true);
    });
  });

  describe('fee claimers', () => {
    it('parses single fee claimer with %', () => {
      const result = parseLaunchCommand('@BagsLaunch "Token" $TKN (@alice 50%)');
      expect(result.success).toBe(true);
      expect(result.command?.feeClaimers).toEqual([
        { username: 'alice', provider: 'twitter', bps: 5000 },
      ]);
    });

    it('parses single fee claimer without % sign', () => {
      const result = parseLaunchCommand('@BagsLaunch "Token" $TKN (@alice 50)');
      expect(result.success).toBe(true);
      expect(result.command?.feeClaimers).toEqual([
        { username: 'alice', provider: 'twitter', bps: 5000 },
      ]);
    });

    it('parses multiple fee claimers', () => {
      const result = parseLaunchCommand('@BagsLaunch "Token" $TKN (@alice 30%) (@bob 20%)');
      expect(result.success).toBe(true);
      expect(result.command?.feeClaimers).toHaveLength(2);
      expect(result.command?.feeClaimers?.[0]).toEqual({ username: 'alice', provider: 'twitter', bps: 3000 });
      expect(result.command?.feeClaimers?.[1]).toEqual({ username: 'bob', provider: 'twitter', bps: 2000 });
    });

    it('caps 100% to 95%', () => {
      const result = parseLaunchCommand('@BagsLaunch "Token" $TKN (@target 100%)');
      expect(result.success).toBe(true);
      expect(result.command?.feeClaimers).toEqual([
        { username: 'target', provider: 'twitter', bps: 9500 },
      ]);
    });

    it('rejects total claimers exceeding 95%', () => {
      const result = parseLaunchCommand('@BagsLaunch "Token" $TKN (@alice 50%) (@bob 50%)');
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum 95%');
    });

    it('does not set feeClaimers when none present', () => {
      const result = parseLaunchCommand('@BagsLaunch "Token" $TKN');
      expect(result.success).toBe(true);
      expect(result.command?.feeClaimers).toBeUndefined();
    });

    it('removes fee claimer text from description', () => {
      const result = parseLaunchCommand('@BagsLaunch "Token" $TKN (@alice 30%) cool token');
      expect(result.success).toBe(true);
      expect(result.command?.description).toBe('cool token');
      expect(result.command?.feeClaimers).toHaveLength(1);
    });

    it('works with key/value syntax', () => {
      const result = parseLaunchCommand('@BagsLaunch name:"Token" ticker:"TKN" (@alice 50%)');
      expect(result.success).toBe(true);
      expect(result.command?.feeClaimers).toEqual([
        { username: 'alice', provider: 'twitter', bps: 5000 },
      ]);
    });
  });
});
