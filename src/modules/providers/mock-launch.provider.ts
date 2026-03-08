import { createChildLogger } from '../../app/logger.js';
import type {
  LaunchProvider,
  LaunchProviderInput,
  LaunchProviderResult,
} from './launch-provider.interface.js';

const log = createChildLogger('mock-provider');

export class MockLaunchProvider implements LaunchProvider {
  name = 'mock';

  async launch(input: LaunchProviderInput): Promise<LaunchProviderResult> {
    log.info({ name: input.name, ticker: input.ticker }, 'Mock launching token');

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Generate a fake token address
    const fakeAddress =
      '0x' +
      Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    return {
      success: true,
      tokenAddress: fakeAddress,
      coinUrl: `https://bags.fm/${fakeAddress}`,
      providerLaunchId: `mock_${Date.now()}`,
      raw: {
        mock: true,
        input,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
