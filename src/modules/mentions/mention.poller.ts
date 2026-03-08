import { TwitterApi } from 'twitter-api-v2';
import { env } from '../../app/env.js';
import { createChildLogger } from '../../app/logger.js';
import { XApiError } from '../../shared/errors.js';
import type { TweetData } from '../../shared/types.js';
import { metrics } from '../../shared/metrics.js';
import { getProcessingState, setProcessingState } from '../db/repositories.js';

const log = createChildLogger('mention-poller');

let client: TwitterApi | null = null;

function getClient(): TwitterApi {
  if (!client) {
    if (!env.X_BEARER_TOKEN) {
      throw new XApiError('X_BEARER_TOKEN is not configured', false);
    }
    client = new TwitterApi(env.X_BEARER_TOKEN);
  }
  return client;
}

/** Create an authenticated client for posting (requires OAuth 1.0a) */
function getWriteClient(): TwitterApi {
  if (!env.X_API_KEY || !env.X_API_SECRET || !env.X_ACCESS_TOKEN || !env.X_ACCESS_SECRET) {
    throw new XApiError('X OAuth credentials not fully configured', false);
  }
  return new TwitterApi({
    appKey: env.X_API_KEY,
    appSecret: env.X_API_SECRET,
    accessToken: env.X_ACCESS_TOKEN,
    accessSecret: env.X_ACCESS_SECRET,
  });
}

export { getWriteClient };

const CURSOR_KEY = 'last_mention_id';

export async function pollMentions(): Promise<TweetData[]> {
  if (env.LAUNCH_PROVIDER === 'mock' && !env.X_BEARER_TOKEN) {
    log.debug('Mock mode without X credentials — skipping real polling');
    return [];
  }

  try {
    const twitterClient = getClient();
    const sinceId = await getProcessingState(CURSOR_KEY);

    // Use search API — more reliable than userMentionTimeline for real-time detection
    const query = `@${env.BOT_USERNAME} -is:retweet`;
    
    const searchParams: Record<string, unknown> = {
      'tweet.fields': ['created_at', 'author_id', 'text', 'attachments'],
      'user.fields': ['username', 'name'],
      expansions: ['author_id', 'attachments.media_keys'],
      'media.fields': ['url', 'preview_image_url', 'type'],
      max_results: 10,
    };

    if (sinceId) {
      searchParams.since_id = sinceId;
    }

    log.debug({ sinceId, query }, 'Searching for mentions');
    const results = await twitterClient.v2.search(query, searchParams as any);
    log.debug({ resultCount: results.data?.data?.length ?? 0, meta: results.meta }, 'Search response');

    const tweets: TweetData[] = [];
    let latestId: string | null = null;

    const users = results.includes?.users ?? [];
    const media = results.includes?.media ?? [];

    for (const tweet of results.data?.data ?? []) {
      metrics.increment('mentionsSeen');

      const author = users.find((u) => u.id === tweet.author_id);
      const tweetMedia = tweet.attachments?.media_keys
        ?.map((key) => media.find((m) => m.media_key === key))
        .filter(Boolean)
        .map((m) => m!.url ?? m!.preview_image_url)
        .filter((url): url is string => !!url);

      tweets.push({
        tweetId: tweet.id,
        authorId: tweet.author_id!,
        authorUsername: author?.username ?? 'unknown',
        authorDisplayName: author?.name,
        text: tweet.text,
        tweetUrl: `https://x.com/${author?.username ?? 'i'}/status/${tweet.id}`,
        mediaUrls: tweetMedia,
        rawPayload: tweet,
      });

      if (!latestId || tweet.id > latestId) {
        latestId = tweet.id;
      }
    }

    if (latestId) {
      await setProcessingState(CURSOR_KEY, latestId);
    }

    log.info({ count: tweets.length }, 'Polled mentions');
    return tweets;
  } catch (error) {
    if (error instanceof XApiError) throw error;
    log.error({ error }, 'Failed to poll mentions');
    throw new XApiError('Failed to poll X mentions', true, error);
  }
}
