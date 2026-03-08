export type LaunchStatus =
  | 'received'
  | 'parsed'
  | 'invalid'
  | 'queued'
  | 'launching'
  | 'launched'
  | 'reply_sent'
  | 'failed'
  | 'retryable_failed';

export interface FeeClaimer {
  username: string;
  provider: 'twitter';
  bps: number;
}

export interface ParsedLaunchCommand {
  name: string;
  ticker: string;
  description?: string;
  mediaUrls?: string[];
  feeClaimers?: FeeClaimer[];
}

export interface TweetData {
  tweetId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName?: string;
  text: string;
  tweetUrl: string;
  mediaUrls?: string[];
  rawPayload?: unknown;
}

export interface MetricsCounters {
  mentionsSeen: number;
  parseSuccess: number;
  parseFailure: number;
  validationPass: number;
  validationFail: number;
  launchSuccess: number;
  launchFailure: number;
  replySuccess: number;
  replyFailure: number;
}
