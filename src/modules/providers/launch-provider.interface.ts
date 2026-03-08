export interface LaunchProvider {
  name: string;
  launch(input: LaunchProviderInput): Promise<LaunchProviderResult>;
}

export interface LaunchProviderInput {
  sourceTweetId: string;
  authorId: string;
  authorUsername: string;
  name: string;
  ticker: string;
  description?: string;
  mediaUrls?: string[];
  feeClaimers?: Array<{ username: string; provider: 'twitter'; bps: number }>;
}

export interface LaunchProviderResult {
  success: boolean;
  tokenAddress?: string;
  coinUrl?: string;
  providerLaunchId?: string;
  raw?: unknown;
  errorCode?: string;
  errorMessage?: string;
}
