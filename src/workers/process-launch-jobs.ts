import { createChildLogger } from '../app/logger.js';
import { findPendingLaunchRequests } from '../modules/db/repositories.js';
import { executeLaunch } from '../modules/launches/launch.orchestrator.js';

const log = createChildLogger('job-worker');

/**
 * Process any queued launch requests that haven't been executed yet.
 * This handles the case where a launch was queued but the process restarted.
 */
export async function processQueuedJobs(): Promise<void> {
  const pending = await findPendingLaunchRequests();

  if (pending.length === 0) return;

  log.info({ count: pending.length }, 'Processing queued launch jobs');

  for (const request of pending) {
    try {
      await executeLaunch(
        request.id,
        {
          tweetId: request.sourceTweet.tweetId,
          authorId: request.sourceTweet.authorId,
          authorUsername: request.user.username,
          authorDisplayName: request.user.displayName ?? undefined,
          text: request.sourceTweet.tweetText,
          tweetUrl: request.sourceTweet.tweetUrl ?? '',
          mediaUrls: request.requestMediaUrl?.split(',').filter(Boolean),
        },
        {
          name: request.requestName,
          ticker: request.requestTicker,
          description: request.requestDescription ?? undefined,
          mediaUrls: request.requestMediaUrl?.split(',').filter(Boolean),
        },
      );
    } catch (error) {
      log.error({ error, requestId: request.id }, 'Failed to process queued job');
    }
  }
}
