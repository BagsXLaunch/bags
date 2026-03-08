import type { Logger } from 'pino';
import { env } from '../../app/env.js';
import { createChildLogger } from '../../app/logger.js';
import { metrics } from '../../shared/metrics.js';
import type { TweetData } from '../../shared/types.js';
import { generateCorrelationId } from '../../shared/utils.js';
import { parseLaunchCommand } from '../parser/parse-launch-command.js';
import { validateLaunchRequest } from '../validation/validation.service.js';
import {
  upsertUser,
  createSourceTweet,
  createLaunchRequest,
  updateLaunchRequestStatus,
  createLaunch,
  updateLaunch,
  findSuccessfulLaunchByRequestId,
} from '../db/repositories.js';
import { replyTemplates } from '../replies/reply.templates.js';
import { postReply } from '../replies/reply.service.js';
import type { LaunchProvider } from '../providers/launch-provider.interface.js';
import { MockLaunchProvider } from '../providers/mock-launch.provider.js';
import { BagsLaunchProvider } from '../providers/bags-launch.provider.js';

const log = createChildLogger('launch-orchestrator');

function getProvider(): LaunchProvider {
  switch (env.LAUNCH_PROVIDER) {
    case 'bags':
      return new BagsLaunchProvider();
    case 'mock':
    default:
      return new MockLaunchProvider();
  }
}

/**
 * Full pipeline: parse → validate → launch → reply
 */
export async function processTweet(tweet: TweetData): Promise<void> {
  const correlationId = generateCorrelationId();
  const plog = log.child({ correlationId, tweetId: tweet.tweetId });

  plog.info('Processing tweet');

  // ── Step 1: Parse ──
  const parseResult = parseLaunchCommand(tweet.text);

  if (!parseResult.success || !parseResult.command) {
    metrics.increment('parseFailure');
    plog.info({ error: parseResult.error }, 'Parse failed');
    return; // Silently ignore unparseable mentions
  }

  metrics.increment('parseSuccess');
  const command = parseResult.command;
  plog.info({ name: command.name, ticker: command.ticker }, 'Parsed command');

  // Attach media from tweet if parser didn't find inline media
  if (tweet.mediaUrls?.length) {
    command.mediaUrls = tweet.mediaUrls;
  }

  // ── Step 2: Validate ──
  const validation = await validateLaunchRequest(tweet, command);

  if (!validation.valid) {
    metrics.increment('validationFail');
    plog.info({ reason: validation.reason }, 'Validation failed');

    // Still persist the user and tweet for audit
    const user = await upsertUser(tweet);
    const sourceTweet = await createSourceTweet(tweet);
    await createLaunchRequest({
      sourceTweetId: sourceTweet.id,
      userId: user.id,
      requestName: command.name,
      requestTicker: command.ticker,
      requestDescription: command.description,
      requestMediaUrl: command.mediaUrls?.join(','),
      parseStatus: 'parsed',
      validationStatus: 'failed',
      validationReason: validation.reason,
      status: 'invalid',
    });

    // Reply with validation failure
    try {
      const replyText = validation.code === 'RATE_LIMITED'
        ? replyTemplates.rateLimited()
        : validation.code === 'DUPLICATE_TWEET'
          ? replyTemplates.duplicate()
          : replyTemplates.validationFailureWithReason(validation.reason ?? 'Invalid request');

      await postReply({
        sourceTweetId: sourceTweet.id,
        tweetId: tweet.tweetId,
        replyType: 'validation_failure',
        replyText,
      });
    } catch (e) {
      plog.error({ error: e }, 'Failed to post validation failure reply');
    }
    return;
  }

  metrics.increment('validationPass');

  // ── Step 3: Persist ──
  const user = await upsertUser(tweet);
  const sourceTweet = await createSourceTweet(tweet);
  const launchRequest = await createLaunchRequest({
    sourceTweetId: sourceTweet.id,
    userId: user.id,
    requestName: command.name,
    requestTicker: command.ticker,
    requestDescription: command.description,
    requestMediaUrl: command.mediaUrls?.join(','),
    parseStatus: 'parsed',
    validationStatus: 'passed',
    status: 'queued',
  });

  plog.info({ launchRequestId: launchRequest.id }, 'Launch request created');

  // ── Step 4: Launch ──
  await executeLaunch(launchRequest.id, tweet, command, plog);
}

/**
 * Execute a queued launch request (also used for retries).
 */
export async function executeLaunch(
  launchRequestId: string,
  tweet: TweetData,
  command: { name: string; ticker: string; description?: string; mediaUrls?: string[] },
  parentLog?: Logger,
): Promise<void> {
  const plog = parentLog ?? log.child({ launchRequestId });
  const provider = getProvider();

  // Idempotency: check if already launched successfully
  const existingLaunch = await findSuccessfulLaunchByRequestId(launchRequestId);
  if (existingLaunch) {
    plog.warn('Launch already completed successfully, skipping');
    return;
  }

  await updateLaunchRequestStatus(launchRequestId, 'launching');

  const launch = await createLaunch({
    launchRequestId,
    providerName: provider.name,
    providerRequestJson: JSON.stringify({
      name: command.name,
      ticker: command.ticker,
      description: command.description,
      mediaUrls: command.mediaUrls,
    }),
    status: 'pending',
  });

  plog.info({ launchId: launch.id, provider: provider.name }, 'Executing launch');

  try {
    const result = await provider.launch({
      sourceTweetId: tweet.tweetId,
      authorId: tweet.authorId,
      authorUsername: tweet.authorUsername,
      name: command.name,
      ticker: command.ticker,
      description: command.description,
      mediaUrls: command.mediaUrls,
    });

    if (result.success) {
      metrics.increment('launchSuccess');
      await updateLaunch(launch.id, {
        providerResponseJson: JSON.stringify(result.raw),
        tokenAddress: result.tokenAddress,
        coinUrl: result.coinUrl,
        status: 'success',
        launchedAt: new Date(),
      });
      await updateLaunchRequestStatus(launchRequestId, 'launched');

      plog.info({ tokenAddress: result.tokenAddress, coinUrl: result.coinUrl }, 'Launch succeeded');

      // ── Step 5: Reply ──
      try {
        const replyText = replyTemplates.success(result.coinUrl ?? `https://bags.fm/${result.tokenAddress}`);
        // Need the source tweet DB record to get its id
        const { prisma } = await import('../../app/db.js');
        const lr = await prisma.launchRequest.findUnique({
          where: { id: launchRequestId },
          include: { sourceTweet: true },
        });

        if (lr) {
          await postReply({
            sourceTweetId: lr.sourceTweetId,
            tweetId: tweet.tweetId,
            replyType: 'success',
            replyText,
            launchId: launch.id,
          });
          await updateLaunchRequestStatus(launchRequestId, 'reply_sent');
        }
      } catch (e) {
        plog.error({ error: e }, 'Failed to post success reply');
      }
    } else {
      metrics.increment('launchFailure');
      await updateLaunch(launch.id, {
        providerResponseJson: JSON.stringify(result.raw),
        status: 'failed',
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      await updateLaunchRequestStatus(launchRequestId, 'failed');

      plog.error({ errorCode: result.errorCode, errorMessage: result.errorMessage }, 'Launch failed');

      // Reply with failure
      try {
        const { prisma } = await import('../../app/db.js');
        const lr = await prisma.launchRequest.findUnique({
          where: { id: launchRequestId },
        });
        if (lr) {
          await postReply({
            sourceTweetId: lr.sourceTweetId,
            tweetId: tweet.tweetId,
            replyType: 'failure',
            replyText: replyTemplates.internalFailure(),
            launchId: launch.id,
          });
        }
      } catch (e) {
        plog.error({ error: e }, 'Failed to post failure reply');
      }
    }
  } catch (error) {
    metrics.increment('launchFailure');
    await updateLaunch(launch.id, {
      status: 'failed',
      errorCode: 'PROVIDER_EXCEPTION',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    await updateLaunchRequestStatus(launchRequestId, 'retryable_failed');

    plog.error({ error }, 'Launch threw exception');
  }
}
