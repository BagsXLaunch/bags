import { describe, it, expect, vi } from 'vitest';
import { MockLaunchProvider } from './mock-launch.provider.js';

// Mock logger
vi.mock('../../app/logger.js', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

describe('MockLaunchProvider', () => {
  it('has name "mock"', () => {
    const provider = new MockLaunchProvider();
    expect(provider.name).toBe('mock');
  });

  it('returns successful result', async () => {
    const provider = new MockLaunchProvider();
    const result = await provider.launch({
      sourceTweetId: '123',
      authorId: 'user1',
      authorUsername: 'testuser',
      name: 'Test Token',
      ticker: 'TEST',
    });

    expect(result.success).toBe(true);
    expect(result.tokenAddress).toBeTruthy();
    expect(result.coinUrl).toContain('bags.fm');
    expect(result.providerLaunchId).toContain('mock_');
  });

  it('implements LaunchProvider interface correctly', async () => {
    const provider = new MockLaunchProvider();
    const result = await provider.launch({
      sourceTweetId: '456',
      authorId: 'user2',
      authorUsername: 'another',
      name: 'Another Token',
      ticker: 'ANTH',
      description: 'describes it',
      mediaUrls: ['https://example.com/img.png'],
    });

    expect(result.success).toBe(true);
    expect(result.raw).toBeDefined();
  });
});
