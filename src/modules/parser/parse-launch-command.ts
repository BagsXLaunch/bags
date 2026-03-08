import { sanitizeText, normalizeTicker } from '../../shared/utils.js';
import { env } from '../../app/env.js';
import type { ParseResult } from './parser.types.js';

const NAME_MIN = 3;
const NAME_MAX = 32;
const TICKER_MIN = 2;
const TICKER_MAX = 10;
const TICKER_PATTERN = /^[A-Z0-9]+$/;

const FEE_CLAIMER_PATTERN = /\(@(\w+)\s+(\d+)%?\)/g;
const BOT_FEE_BPS = 500; // 5% reserved for bot
const MAX_CLAIMER_BPS = 10000 - BOT_FEE_BPS; // 9500 = 95%

/**
 * Parse a launch command from tweet text.
 *
 * Supported formats:
 *   @Bot "My Project" $TICKER
 *   @Bot "My Project" $TICKER description here
 *   @Bot "My Project" $TICKER (@feeclaimer 50%)
 *   @Bot "My Project" $TICKER (@alice 30%) (@bob 20%)
 *   @Bot name:"My Project" ticker:"TICKER"
 *   @Bot name:"My Project" ticker:"TICKER" desc:"some description"
 */
export function parseLaunchCommand(rawText: string): ParseResult {
  const text = sanitizeText(rawText);
  const botMention = `@${env.BOT_USERNAME}`;

  // Check for bot mention (case-insensitive)
  if (!text.toLowerCase().includes(botMention.toLowerCase())) {
    return { success: false, error: 'Bot was not mentioned in the tweet' };
  }

  // Remove the bot mention to get the command body
  const body = text.replace(new RegExp(`@${env.BOT_USERNAME}`, 'gi'), '').trim();

  if (!body) {
    return { success: false, error: 'Empty command after mention' };
  }

  // Extract fee claimers before parsing the rest
  const { feeClaimers, cleanBody, error: feeError } = extractFeeClaimers(body);
  if (feeError) {
    return { success: false, error: feeError };
  }

  // Try key/value syntax first: name:"Value" ticker:"VALUE"
  const kvResult = parseKeyValueSyntax(cleanBody);
  if (kvResult.success || kvResult.error !== 'Key/value syntax requires name:"..." and ticker:"..."') {
    if (kvResult.success && kvResult.command && feeClaimers.length > 0) {
      kvResult.command.feeClaimers = feeClaimers;
    }
    return kvResult;
  }

  // Fall back to plain syntax: "Name" $TICKER [description...]
  const plainResult = parsePlainSyntax(cleanBody);
  if (plainResult.success || plainResult.error !== 'Plain syntax requires "Name" and $TICKER') {
    if (plainResult.success && plainResult.command && feeClaimers.length > 0) {
      plainResult.command.feeClaimers = feeClaimers;
    }
    return plainResult;
  }

  return {
    success: false,
    error: 'Could not parse launch command. Use: @Bot "Project Name" $TICKER',
  };
}

function extractFeeClaimers(body: string): {
  feeClaimers: Array<{ username: string; provider: 'twitter'; bps: number }>;
  cleanBody: string;
  error?: string;
} {
  const feeClaimers: Array<{ username: string; provider: 'twitter'; bps: number }> = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(FEE_CLAIMER_PATTERN.source, 'g');

  while ((match = regex.exec(body)) !== null) {
    const username = match[1]!;
    let pct = parseInt(match[2]!, 10);

    // Cap at 95% (bot always keeps 5%)
    if (pct > 95) pct = 95;
    if (pct <= 0) {
      return { feeClaimers: [], cleanBody: body, error: `Fee percentage for @${username} must be greater than 0` };
    }

    feeClaimers.push({ username, provider: 'twitter', bps: pct * 100 });
  }

  const totalClaimerBps = feeClaimers.reduce((sum, c) => sum + c.bps, 0);
  if (totalClaimerBps > MAX_CLAIMER_BPS) {
    return {
      feeClaimers: [],
      cleanBody: body,
      error: `Total fee claimer percentage (${totalClaimerBps / 100}%) exceeds maximum 95%`,
    };
  }

  // Remove fee claimer entries from the body so they don't pollute description parsing
  const cleanBody = body.replace(new RegExp(FEE_CLAIMER_PATTERN.source, 'g'), '').replace(/\s+/g, ' ').trim();

  return { feeClaimers, cleanBody };
}

function parseKeyValueSyntax(body: string): ParseResult {
  const nameMatch = body.match(/name:\s*"([^"]+)"/i);
  const tickerMatch = body.match(/ticker:\s*"([^"]+)"/i);
  const descMatch = body.match(/desc(?:ription)?:\s*"([^"]+)"/i);

  if (!nameMatch || !tickerMatch) {
    return { success: false, error: 'Key/value syntax requires name:"..." and ticker:"..."' };
  }

  const name = nameMatch[1]!.trim();
  const ticker = normalizeTicker(tickerMatch[1]!.trim());
  const description = descMatch?.[1]?.trim();

  return validateAndReturn(name, ticker, description);
}

function parsePlainSyntax(body: string): ParseResult {
  // Match quoted name and $TICKER
  const quotedNameMatch = body.match(/"([^"]+)"/);
  const tickerMatch = body.match(/\$([A-Za-z0-9]+)/);

  if (!quotedNameMatch || !tickerMatch) {
    return { success: false, error: 'Plain syntax requires "Name" and $TICKER' };
  }

  const name = quotedNameMatch[1]!.trim();
  const ticker = normalizeTicker(tickerMatch[1]!.trim());

  // Anything after the ticker match that isn't another token is the description
  const afterTicker = body.slice((tickerMatch.index ?? 0) + tickerMatch[0]!.length).trim();
  const description =
    afterTicker && !afterTicker.startsWith('$') && !afterTicker.match(/^(name|ticker|desc):/i)
      ? afterTicker
      : undefined;

  return validateAndReturn(name, ticker, description);
}

function validateAndReturn(
  name: string,
  ticker: string,
  description?: string,
): ParseResult {
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return {
      success: false,
      error: `Name must be ${NAME_MIN}-${NAME_MAX} characters (got ${name.length})`,
    };
  }

  if (ticker.length < TICKER_MIN || ticker.length > TICKER_MAX) {
    return {
      success: false,
      error: `Ticker must be ${TICKER_MIN}-${TICKER_MAX} characters (got ${ticker.length})`,
    };
  }

  if (!TICKER_PATTERN.test(ticker)) {
    return {
      success: false,
      error: 'Ticker must contain only uppercase letters and digits (A-Z0-9)',
    };
  }

  return {
    success: true,
    command: { name, ticker, description },
  };
}
