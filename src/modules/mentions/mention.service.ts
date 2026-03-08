import { createChildLogger } from '../../app/logger.js';
import { env } from '../../app/env.js';
import { findSourceTweetByTweetId } from '../db/repositories.js';
import { pollMentions } from './mention.poller.js';
import { processTweet } from '../launches/launch.orchestrator.js';

const log = createChildLogger('mention-service');

let running = false;

export async function startMentionPolling(): Promise<void> {
  running = true;
  log.info({ intervalMs: env.POLL_INTERVAL_MS }, 'Starting mention polling');

  while (running) {
    try {
      const tweets = await pollMentions();

      for (const tweet of tweets) {
        // Skip already processed
        const existing = await findSourceTweetByTweetId(tweet.tweetId);
        if (existing) {
          log.debug({ tweetId: tweet.tweetId }, 'Tweet already processed, skipping');
          continue;
        }

        try {
          await processTweet(tweet);
        } catch (error) {
          log.error({ error, tweetId: tweet.tweetId }, 'Error processing tweet');
        }
      }
    } catch (error) {
      log.error({ error }, 'Error in mention polling cycle');
    }

    await sleep(env.POLL_INTERVAL_MS);
  }
}

export function stopMentionPolling(): void {
  running = false;
  log.info('Stopping mention polling');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
