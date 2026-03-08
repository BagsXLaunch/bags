import { prisma } from '../../app/db.js';
import type { TweetData } from '../../shared/types.js';

// ──── User Repository ────

export async function upsertUser(tweet: TweetData) {
  return prisma.user.upsert({
    where: { xUserId: tweet.authorId },
    update: {
      username: tweet.authorUsername,
      displayName: tweet.authorDisplayName,
    },
    create: {
      xUserId: tweet.authorId,
      username: tweet.authorUsername,
      displayName: tweet.authorDisplayName,
    },
  });
}

// ──── Source Tweet Repository ────

export async function findSourceTweetByTweetId(tweetId: string) {
  return prisma.sourceTweet.findUnique({ where: { tweetId } });
}

export async function createSourceTweet(tweet: TweetData) {
  return prisma.sourceTweet.create({
    data: {
      tweetId: tweet.tweetId,
      authorId: tweet.authorId,
      tweetText: tweet.text,
      tweetUrl: tweet.tweetUrl,
      rawPayloadJson: tweet.rawPayload ? JSON.stringify(tweet.rawPayload) : null,
    },
  });
}

// ──── Launch Request Repository ────

export async function createLaunchRequest(data: {
  sourceTweetId: string;
  userId: string;
  requestName: string;
  requestTicker: string;
  requestDescription?: string;
  requestMediaUrl?: string;
  parseStatus: string;
  validationStatus: string;
  validationReason?: string;
  status: string;
}) {
  return prisma.launchRequest.create({ data });
}

export async function updateLaunchRequestStatus(id: string, status: string) {
  return prisma.launchRequest.update({
    where: { id },
    data: { status },
  });
}

export async function findPendingLaunchRequests() {
  return prisma.launchRequest.findMany({
    where: { status: 'queued' },
    include: { sourceTweet: true, user: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function findLaunchRequestById(id: string) {
  return prisma.launchRequest.findUnique({
    where: { id },
    include: { sourceTweet: true, user: true, launches: true },
  });
}

// ──── Launch Repository ────

export async function createLaunch(data: {
  launchRequestId: string;
  providerName: string;
  providerRequestJson?: string;
  status: string;
}) {
  return prisma.launch.create({ data });
}

export async function updateLaunch(
  id: string,
  data: {
    providerResponseJson?: string;
    tokenAddress?: string;
    coinUrl?: string;
    status: string;
    errorCode?: string;
    errorMessage?: string;
    launchedAt?: Date;
  },
) {
  return prisma.launch.update({ where: { id }, data });
}

export async function findSuccessfulLaunchByRequestId(launchRequestId: string) {
  return prisma.launch.findFirst({
    where: { launchRequestId, status: 'success' },
  });
}

// ──── Reply Repository ────

export async function createReply(data: {
  launchId?: string;
  sourceTweetId: string;
  replyTweetId?: string;
  replyType: string;
  replyText: string;
  sentAt?: Date;
}) {
  return prisma.reply.create({ data });
}

export async function findReplyByTypeAndTweet(replyType: string, sourceTweetId: string) {
  return prisma.reply.findUnique({
    where: { replyType_sourceTweetId: { replyType, sourceTweetId } },
  });
}

// ──── Processing State Repository ────

export async function getProcessingState(key: string): Promise<string | null> {
  const entry = await prisma.processingState.findUnique({ where: { key } });
  return entry?.value ?? null;
}

export async function setProcessingState(key: string, value: string) {
  return prisma.processingState.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// ──── Stats / Admin ────

export async function getLaunchStats() {
  const [total, launched, failed, pending] = await Promise.all([
    prisma.launchRequest.count(),
    prisma.launchRequest.count({ where: { status: 'launched' } }),
    prisma.launchRequest.count({ where: { status: { in: ['failed', 'retryable_failed'] } } }),
    prisma.launchRequest.count({ where: { status: { in: ['queued', 'launching'] } } }),
  ]);
  return { total, launched, failed, pending };
}

export async function getRecentLaunches(limit: number = 20) {
  return prisma.launchRequest.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      sourceTweet: true,
      user: true,
      launches: true,
    },
  });
}
