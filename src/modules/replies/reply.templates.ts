import { env } from '../../app/env.js';

export const replyTemplates = {
  success: (coinUrl: string) => `Your coin is live! 🚀\n\nTrade it here: ${coinUrl}`,

  validationFailure: () =>
    `Could not launch. Please use the format:\n@${env.BOT_USERNAME} "Project Name" $TICKER`,

  validationFailureWithReason: (reason: string) => `Could not launch: ${reason}`,

  internalFailure: () => `Could not complete launch right now. Please try again later.`,

  duplicate: () => `This tweet has already been processed.`,

  rateLimited: () => `You've reached your daily launch limit. Try again tomorrow!`,
};
