import { env } from '../../app/env.js';
import { createChildLogger } from '../../app/logger.js';
import { XApiError } from '../../shared/errors.js';
import { metrics } from '../../shared/metrics.js';
import { createReply, findReplyByTypeAndTweet } from '../db/repositories.js';
import { getWriteClient } from '../mentions/mention.poller.js';

const log = createChildLogger('reply-service');

export async function postReply(params: {
  sourceTweetId: string;
  tweetId: string;
  replyType: string;
  replyText: string;
  launchId?: string;
}) {
  // Idempotency: check if reply already sent for this type + tweet
  const existing = await findReplyByTypeAndTweet(params.replyType, params.sourceTweetId);
  if (existing) {
    log.warn({ tweetId: params.tweetId, replyType: params.replyType }, 'Reply already sent, skipping');
    return existing;
  }

  let replyTweetId: string | undefined;

  if (env.ENABLE_REPLY_POSTING) {
    try {
      const writeClient = getWriteClient();
      const result = await writeClient.v2.reply(params.replyText, params.tweetId);
      replyTweetId = result.data.id;
      metrics.increment('replySuccess');
      log.info({ replyTweetId, tweetId: params.tweetId }, 'Reply posted on X');
    } catch (error) {
      metrics.increment('replyFailure');
      log.error({ error, tweetId: params.tweetId }, 'Failed to post reply on X');
      throw new XApiError('Failed to post reply', true, error);
    }
  } else {
    log.info(
      { tweetId: params.tweetId, replyText: params.replyText },
      'Reply posting disabled — logging reply instead',
    );
  }

  const reply = await createReply({
    launchId: params.launchId,
    sourceTweetId: params.sourceTweetId,
    replyTweetId,
    replyType: params.replyType,
    replyText: params.replyText,
    sentAt: replyTweetId ? new Date() : undefined,
  });

  return reply;
}
