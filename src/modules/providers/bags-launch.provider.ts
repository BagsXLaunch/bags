import {
  BagsSDK,
  createTipTransaction,
  sendBundleAndConfirm,
  signAndSendTransaction,
} from '@bagsfm/bags-sdk';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, type VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { env } from '../../app/env.js';
import { createChildLogger } from '../../app/logger.js';
import { LaunchError } from '../../shared/errors.js';
import type {
  LaunchProvider,
  LaunchProviderInput,
  LaunchProviderResult,
} from './launch-provider.interface.js';

const log = createChildLogger('bags-provider');

const DEFAULT_IMAGE_URL = 'https://bags.fm/default-token.png';
const FALLBACK_JITO_TIP_LAMPORTS = Math.floor(0.015 * LAMPORTS_PER_SOL);
const INITIAL_BUY_LAMPORTS = 0;
const FEE_SHARE_MAX_RETRIES = 3;
const FEE_SHARE_RETRY_DELAY_MS = 3000;

export class BagsLaunchProvider implements LaunchProvider {
  name = 'bags';

  private sdk: BagsSDK | null = null;
  private keypair: Keypair | null = null;
  private connection: Connection | null = null;

  private init() {
    if (this.sdk) return;

    if (!env.PRIVATE_KEY) {
      throw new LaunchError('PRIVATE_KEY env var is required for Bags provider', false);
    }
    if (!env.BAGS_API_KEY) {
      throw new LaunchError('BAGS_API_KEY env var is required for Bags provider', false);
    }

    this.keypair = Keypair.fromSecretKey(bs58.decode(env.PRIVATE_KEY));
    this.connection = new Connection(env.SOLANA_RPC_URL);
    // Use "processed" commitment as per official Bags docs
    this.sdk = new BagsSDK(env.BAGS_API_KEY, this.connection, 'processed');

    log.info(
      { wallet: this.keypair.publicKey.toBase58() },
      'Bags SDK initialized',
    );
  }

  /**
   * Send unsigned transactions as a Jito bundle with a tip (matches docs' sendBundleWithTip).
   */
  private async sendBundleWithTip(
    unsignedTransactions: VersionedTransaction[],
    keypair: Keypair,
  ): Promise<string> {
    const sdk = this.sdk!;
    const connection = this.connection!;
    const commitment = sdk.state.getCommitment();

    const bundleBlockhash = unsignedTransactions[0]?.message.recentBlockhash;
    if (!bundleBlockhash) {
      throw new Error('Bundle transactions must have a blockhash');
    }

    let jitoTip = FALLBACK_JITO_TIP_LAMPORTS;
    try {
      const recommended = await sdk.solana.getJitoRecentFees();
      if (recommended?.landed_tips_95th_percentile) {
        jitoTip = Math.floor(recommended.landed_tips_95th_percentile * LAMPORTS_PER_SOL);
      }
    } catch {
      log.warn('Failed to get Jito recent fees, using fallback');
    }

    log.info({ tipSol: jitoTip / LAMPORTS_PER_SOL }, 'Jito tip');

    const tipTransaction = await createTipTransaction(
      connection,
      commitment,
      keypair.publicKey,
      jitoTip,
      { blockhash: bundleBlockhash },
    );

    // Sign all: tip first, then bundle transactions
    const signedTransactions = [tipTransaction, ...unsignedTransactions].map((tx) => {
      tx.sign([keypair]);
      return tx;
    });

    const bundleId = await sendBundleAndConfirm(signedTransactions, sdk);
    log.info({ bundleId }, 'Bundle confirmed');
    return bundleId;
  }

  /**
   * Create fee share config with robust handling for:
   * - Saving configKey immediately before sending txs
   * - "Config already exists" (retrieve key via raw API)
   * - Individual transaction failures (continue with configKey)
   */
  private async getOrCreateFeeShareConfig(
    sdk: BagsSDK,
    keypair: Keypair,
    connection: Connection,
    commitment: string,
    tokenMint: PublicKey,
    feeClaimers: Array<{ user: PublicKey; userBps: number }>,
  ): Promise<PublicKey> {
    const feeShareParams = {
      feeClaimers,
      payer: keypair.publicKey,
      baseMint: tokenMint,
    };

    // Normalized params for raw API fallback
    const normalizedParams = {
      basisPointsArray: feeClaimers.map((c) => c.userBps),
      payer: keypair.publicKey.toBase58(),
      baseMint: tokenMint.toBase58(),
      claimersArray: feeClaimers.map((c) => c.user.toBase58()),
    };

    for (let attempt = 1; attempt <= FEE_SHARE_MAX_RETRIES; attempt++) {
      try {
        log.info({ attempt }, 'Fee share config attempt');
        const configResult = await sdk.config.createBagsFeeShareConfig(feeShareParams);

        // Save configKey IMMEDIATELY - before sending any transactions
        const configKey = configResult.meteoraConfigKey;
        log.info({ configKey: configKey.toBase58() }, 'Fee share config key obtained');

        // Send bundles via Jito if any
        if (configResult.bundles && configResult.bundles.length > 0) {
          log.info({ count: configResult.bundles.length }, 'Sending fee share bundles');
          for (const bundle of configResult.bundles) {
            try {
              await this.sendBundleWithTip(bundle, keypair);
            } catch (bundleErr) {
              log.warn({ error: String(bundleErr) }, 'Fee share bundle send failed, continuing');
            }
          }
        }

        // Send individual transactions
        if (configResult.transactions && configResult.transactions.length > 0) {
          log.info({ count: configResult.transactions.length }, 'Sending fee share transactions');
          for (const tx of configResult.transactions) {
            try {
              await signAndSendTransaction(connection, commitment as any, tx, keypair);
            } catch (txErr) {
              log.warn({ error: String(txErr) }, 'Fee share transaction failed, continuing');
            }
          }
        }

        log.info({ configKey: configKey.toBase58() }, 'Fee share config created');
        return configKey;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // "Config already exists" means it was created on a previous attempt.
        // Retrieve the configKey via raw API call.
        if (errMsg === 'Config already exists') {
          log.info('Config already exists, retrieving config key via API');
          try {
            const rawResponse = await (sdk as any).bagsApiClient.post(
              '/fee-share/config',
              normalizedParams,
            );
            const configKey = new PublicKey(rawResponse.meteoraConfigKey);
            log.info({ configKey: configKey.toBase58() }, 'Retrieved existing config key');
            return configKey;
          } catch (rawErr) {
            log.error({ error: String(rawErr) }, 'Failed to retrieve existing config key');
            throw err;
          }
        }

        const errPayload = (err as any)?.payload;
        const errStatus = (err as any)?.status;
        log.warn(
          { attempt, maxRetries: FEE_SHARE_MAX_RETRIES, error: errMsg, status: errStatus, payload: errPayload },
          'Fee share config attempt failed',
        );
        if (attempt === FEE_SHARE_MAX_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, FEE_SHARE_RETRY_DELAY_MS));
      }
    }

    throw new Error('Fee share config creation exhausted all retries');
  }

  async launch(input: LaunchProviderInput): Promise<LaunchProviderResult> {
    try {
      this.init();
      const sdk = this.sdk!;
      const keypair = this.keypair!;
      const connection = this.connection!;
      const commitment = sdk.state.getCommitment();

      const description =
        input.description ?? `Launched by @${input.authorUsername} via BagsBot`;
      const imageUrl =
        (input.mediaUrls && input.mediaUrls.length > 0
          ? input.mediaUrls[0]
          : undefined) ?? DEFAULT_IMAGE_URL;

      // ── Step 1: Create token info & metadata ──
      log.info({ name: input.name, ticker: input.ticker }, 'Step 1: Creating token metadata');

      const tokenInfo = await sdk.tokenLaunch.createTokenInfoAndMetadata({
        name: input.name,
        symbol: input.ticker,
        description,
        imageUrl,
      });

      const tokenMint = new PublicKey(tokenInfo.tokenMint);
      log.info({ tokenMint: tokenMint.toBase58() }, 'Token metadata created');

      // ── Step 2: Get or create fee share config ──
      log.info('Step 2: Creating fee share config');

      const BOT_BPS = 500; // 5% for bot
      let feeClaimers: Array<{ user: PublicKey; userBps: number }> = [];

      // Resolve explicit fee claimers from tweet syntax: (@username XX%)
      if (input.feeClaimers && input.feeClaimers.length > 0) {
        for (const fc of input.feeClaimers) {
          try {
            const result = await sdk.state.getLaunchWalletV2(fc.username, fc.provider);
            feeClaimers.push({ user: result.wallet, userBps: fc.bps });
            log.info({ username: fc.username, wallet: result.wallet.toBase58(), bps: fc.bps }, 'Resolved fee claimer wallet');
          } catch (err) {
            log.warn({ username: fc.username, error: String(err) }, 'Could not resolve fee claimer wallet — skipping');
          }
        }
      }

      // Calculate remaining BPS after explicit claimers + bot
      const explicitClaimerBps = feeClaimers.reduce((sum, c) => sum + c.userBps, 0);
      const authorBps = 10000 - BOT_BPS - explicitClaimerBps;

      // Resolve author wallet for remaining share
      if (authorBps > 0) {
        try {
          const authorResult = await sdk.state.getLaunchWalletV2(input.authorUsername, 'twitter');
          if (authorResult.wallet.equals(keypair.publicKey)) {
            // Author IS the bot — merge author share into bot
            feeClaimers.push({ user: keypair.publicKey, userBps: authorBps + BOT_BPS });
          } else {
            feeClaimers.push({ user: authorResult.wallet, userBps: authorBps });
            feeClaimers.push({ user: keypair.publicKey, userBps: BOT_BPS });
            log.info({ authorUsername: input.authorUsername, wallet: authorResult.wallet.toBase58(), bps: authorBps }, 'Author gets remaining fees');
          }
        } catch (walletErr) {
          log.warn({ authorUsername: input.authorUsername, error: String(walletErr) },
            'Could not resolve author wallet — bot gets remaining fees');
          feeClaimers.push({ user: keypair.publicKey, userBps: authorBps + BOT_BPS });
        }
      } else {
        // All BPS allocated to explicit claimers — bot gets its 5%
        feeClaimers.push({ user: keypair.publicKey, userBps: BOT_BPS });
      }

      // If no claimers were resolved (all lookups failed), bot gets 100%
      if (feeClaimers.length === 0) {
        feeClaimers = [{ user: keypair.publicKey, userBps: 10000 }];
      }

      log.info({ feeClaimers: feeClaimers.map(c => ({ wallet: c.user.toBase58(), bps: c.userBps })) }, 'Fee split configured');

      const configKey = await this.getOrCreateFeeShareConfig(sdk, keypair, connection, commitment, tokenMint, feeClaimers);

      // ── Step 3: Create launch transaction ──
      log.info('Step 3: Creating launch transaction');

      const launchTx = await sdk.tokenLaunch.createLaunchTransaction({
        metadataUrl: tokenInfo.tokenMetadata,
        tokenMint,
        launchWallet: keypair.publicKey,
        initialBuyLamports: INITIAL_BUY_LAMPORTS,
        configKey: configKey,
      });

      // ── Step 4 & 5: Sign and broadcast ──
      log.info('Step 4 & 5: Signing and broadcasting launch transaction');

      const signature = await signAndSendTransaction(connection, commitment, launchTx, keypair);

      const tokenAddress = tokenMint.toBase58();
      log.info({ tokenAddress, signature }, 'Token launched successfully');

      return {
        success: true,
        tokenAddress,
        coinUrl: `https://bags.fm/${tokenAddress}`,
        providerLaunchId: signature,
        raw: { tokenMint: tokenAddress, signature, tokenMetadata: tokenInfo.tokenMetadata },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const payload = (error as any)?.payload;
      const status = (error as any)?.status;
      log.error({ error: message, status, payload }, 'Bags SDK launch failed');

      if (error instanceof LaunchError) throw error;

      return {
        success: false,
        errorCode: 'BAGS_SDK_ERROR',
        errorMessage: message,
        raw: { payload, status, stack: error instanceof Error ? error.stack : undefined },
      };
    }
  }
}
