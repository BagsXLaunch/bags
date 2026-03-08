import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env before importing parser
vi.mock('../../app/env.js', () => ({
  env: { BOT_USERNAME: 'LaunchOnBags' },
}));

import { parseLaunchCommand } from './parse-launch-command.js';

describe('parseLaunchCommand', () => {
  describe('plain syntax', () => {
    it('parses @Bot "Name" $TICKER', () => {
      const result = parseLaunchCommand('@LaunchOnBags "My Project" $MYPROJ');
      expect(result.success).toBe(true);
      expect(result.command?.name).toBe('My Project');
      expect(result.command?.ticker).toBe('MYPROJ');
    });

    it('parses with description after ticker', () => {
      const result = parseLaunchCommand('@LaunchOnBags "Cool Token" $COOL a great token');
      expect(result.success).toBe(true);
      expect(result.command?.name).toBe('Cool Token');
      expect(result.command?.ticker).toBe('COOL');
      expect(result.command?.description).toBe('a great token');
    });

    it('normalizes ticker to uppercase', () => {
      const result = parseLaunchCommand('@LaunchOnBags "Test" $mytoken');
      expect(result.success).toBe(true);
      expect(result.command?.ticker).toBe('MYTOKEN');
    });
  });

  describe('key/value syntax', () => {
    it('parses name:"..." ticker:"..."', () => {
      const result = parseLaunchCommand('@LaunchOnBags name:"My Project" ticker:"PROJ"');
      expect(result.success).toBe(true);
      expect(result.command?.name).toBe('My Project');
      expect(result.command?.ticker).toBe('PROJ');
    });

    it('parses with description', () => {
      const result = parseLaunchCommand(
        '@LaunchOnBags name:"My Project" ticker:"PROJ" desc:"short description"',
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
      const result = parseLaunchCommand('@LaunchOnBags');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty command');
    });

    it('rejects name too short', () => {
      const result = parseLaunchCommand('@LaunchOnBags "AB" $TK');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Name must be');
    });

    it('rejects ticker too short', () => {
      const result = parseLaunchCommand('@LaunchOnBags "Valid Name" $X');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ticker must be');
    });

    it('rejects ticker too long', () => {
      const result = parseLaunchCommand('@LaunchOnBags "Valid Name" $ABCDEFGHIJK');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ticker must be');
    });

    it('rejects missing ticker', () => {
      const result = parseLaunchCommand('@LaunchOnBags "Valid Name"');
      expect(result.success).toBe(false);
    });
  });

  describe('sanitization', () => {
    it('handles zero-width characters', () => {
      const result = parseLaunchCommand('@LaunchOnBags "My\u200B Project" $PROJ');
      expect(result.success).toBe(true);
      expect(result.command?.name).toBe('My Project');
    });

    it('handles extra whitespace', () => {
      const result = parseLaunchCommand('@LaunchOnBags   "My  Project"   $PROJ');
      expect(result.success).toBe(true);
    });
  });
});
