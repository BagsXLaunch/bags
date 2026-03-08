import Fastify from 'fastify';
import { env } from '../app/env.js';
import { createChildLogger } from '../app/logger.js';
import { metrics } from '../shared/metrics.js';
import { getLaunchStats, getRecentLaunches, findLaunchRequestById, updateLaunchRequestStatus } from '../modules/db/repositories.js';
import { executeLaunch, processTweet } from '../modules/launches/launch.orchestrator.js';
import type { TweetData } from '../shared/types.js';

const log = createChildLogger('api-server');

export async function createServer() {
  const app = Fastify({ logger: false });

  // ── Health ──
  app.get('/health', async () => {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  });

  // ── Metrics Summary ──
  app.get('/admin/stats', async () => {
    const dbStats = await getLaunchStats();
    const runtimeMetrics = metrics.getAll();
    return { db: dbStats, runtime: runtimeMetrics };
  });

  // ── Recent Launches ──
  app.get('/admin/launches', async (request) => {
    const { limit } = request.query as { limit?: string };
    const launches = await getRecentLaunches(limit ? parseInt(limit, 10) : 20);
    return { launches };
  });

  // ── Retry Launch ──
  app.post<{ Params: { id: string } }>('/admin/launches/:id/retry', async (request, reply) => {
    const { id } = request.params;
    const lr = await findLaunchRequestById(id);

    if (!lr) {
      return reply.status(404).send({ error: 'Launch request not found' });
    }

    if (!['failed', 'retryable_failed'].includes(lr.status)) {
      return reply.status(400).send({ error: `Cannot retry launch in status: ${lr.status}` });
    }

    // Reset to queued
    await updateLaunchRequestStatus(id, 'queued');

    // Execute
    try {
      await executeLaunch(
        lr.id,
        {
          tweetId: lr.sourceTweet.tweetId,
          authorId: lr.sourceTweet.authorId,
          authorUsername: lr.user.username,
          authorDisplayName: lr.user.displayName ?? undefined,
          text: lr.sourceTweet.tweetText,
          tweetUrl: lr.sourceTweet.tweetUrl ?? '',
          mediaUrls: lr.requestMediaUrl?.split(',').filter(Boolean),
        },
        {
          name: lr.requestName,
          ticker: lr.requestTicker,
          description: lr.requestDescription ?? undefined,
          mediaUrls: lr.requestMediaUrl?.split(',').filter(Boolean),
        },
      );
      return { success: true, message: 'Retry initiated' };
    } catch (error) {
      log.error({ error, id }, 'Retry failed');
      return reply.status(500).send({ error: 'Retry failed' });
    }
  });

  // ── Manual Tweet Processing (for demo/testing) ──
  app.post('/admin/process-tweet', async (request, reply) => {
    const body = request.body as {
      tweetId?: string;
      authorId?: string;
      authorUsername?: string;
      text?: string;
      mediaUrls?: string[];
    };

    if (!body.tweetId || !body.text) {
      return reply.status(400).send({ error: 'tweetId and text are required' });
    }

    const tweet: TweetData = {
      tweetId: body.tweetId,
      authorId: body.authorId ?? 'demo_user_id',
      authorUsername: body.authorUsername ?? 'demo_user',
      text: body.text,
      tweetUrl: `https://x.com/demo_user/status/${body.tweetId}`,
      mediaUrls: body.mediaUrls,
      rawPayload: body,
    };

    try {
      await processTweet(tweet);
      return { success: true, message: 'Tweet processed' };
    } catch (error) {
      log.error({ error }, 'Manual tweet processing failed');
      return reply.status(500).send({ error: 'Processing failed' });
    }
  });

  return app;
}

export async function startServer() {
  const app = await createServer();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  log.info({ port: env.PORT }, 'API server started');

  return app;
}
