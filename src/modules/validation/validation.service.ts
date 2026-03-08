import { prisma } from '../../app/db.js';
import { env } from '../../app/env.js';
import { createChildLogger } from '../../app/logger.js';
import { ValidationError } from '../../shared/errors.js';
import type { ParsedLaunchCommand, TweetData } from '../../shared/types.js';

const log = createChildLogger('validation');

const BLOCKED_TERMS: string[] = [
  // Add blocked terms here
];

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
}

export async function validateLaunchRequest(
  tweet: TweetData,
  command: ParsedLaunchCommand,
): Promise<ValidationResult> {
  const checks = [
    () => checkDuplicateTweet(tweet.tweetId),
    () => checkBlacklist(tweet.authorId, tweet.authorUsername),
    () => checkRateLimit(tweet.authorId),
    () => checkBlockedTerms(command.name, command.ticker, command.description),
    () => checkRequiredFields(command),
  ];

  for (const check of checks) {
    const result = await check();
    if (!result.valid) {
      log.warn({ reason: result.reason, tweetId: tweet.tweetId }, 'Validation failed');
      return result;
    }
  }

  log.info({ tweetId: tweet.tweetId }, 'Validation passed');
  return { valid: true };
}

async function checkDuplicateTweet(tweetId: string): Promise<ValidationResult> {
  const existing = await prisma.sourceTweet.findUnique({
    where: { tweetId },
  });
  if (existing) {
    return { valid: false, reason: 'Tweet already processed', code: 'DUPLICATE_TWEET' };
  }
  return { valid: true };
}

async function checkBlacklist(authorId: string, username: string): Promise<ValidationResult> {
  const entry = await prisma.blacklistEntry.findFirst({
    where: {
      OR: [
        { type: 'user', value: authorId },
        { type: 'user', value: username.toLowerCase() },
      ],
    },
  });
  if (entry) {
    return { valid: false, reason: 'User is blacklisted', code: 'BLACKLISTED_USER' };
  }
  return { valid: true };
}

async function checkRateLimit(authorId: string): Promise<ValidationResult> {
  const since = new Date();
  since.setHours(since.getHours() - 24);

  const count = await prisma.launchRequest.count({
    where: {
      user: { xUserId: authorId },
      createdAt: { gte: since },
    },
  });

  if (count >= env.RATE_LIMIT_PER_USER_PER_DAY) {
    return {
      valid: false,
      reason: `Rate limit exceeded (${env.RATE_LIMIT_PER_USER_PER_DAY}/day)`,
      code: 'RATE_LIMITED',
    };
  }
  return { valid: true };
}

async function checkBlockedTerms(
  name: string,
  ticker: string,
  description?: string,
): Promise<ValidationResult> {
  const text = `${name} ${ticker} ${description ?? ''}`.toLowerCase();

  // Check DB-stored blocked terms
  const dbTerms = await prisma.blacklistEntry.findMany({
    where: { type: 'term' },
  });
  const allTerms = [...BLOCKED_TERMS, ...dbTerms.map((t) => t.value.toLowerCase())];

  for (const term of allTerms) {
    if (text.includes(term)) {
      return {
        valid: false,
        reason: `Contains blocked term: ${term}`,
        code: 'BLOCKED_CONTENT',
      };
    }
  }
  return { valid: true };
}

function checkRequiredFields(command: ParsedLaunchCommand): ValidationResult {
  if (!command.name || !command.ticker) {
    return { valid: false, reason: 'Missing required fields (name, ticker)', code: 'MISSING_FIELDS' };
  }
  return { valid: true };
}
