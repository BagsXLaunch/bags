import { BagsSDK, signAndSendTransaction, createTipTransaction, sendBundleAndConfirm } from '@bagsfm/bags-sdk';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, type VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!));
  const connection = new Connection(process.env.SOLANA_RPC_URL!);
  const sdk = new BagsSDK(process.env.BAGS_API_KEY!, connection, 'processed');
  const commitment = sdk.state.getCommitment();

  console.log('Wallet:', keypair.publicKey.toBase58());
  
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
  if (balance === 0) {
    console.error('ERROR: Wallet has 0 SOL - cannot create transactions');
    return;
  }

  // Step 1: Create token info
  console.log('\n--- Step 1: Creating token info ---');
  try {
    const tokenInfo = await sdk.tokenLaunch.createTokenInfoAndMetadata({
      name: 'DebugTest',
      symbol: 'DBGT',
      description: 'Debug test token',
      imageUrl: 'https://bags.fm/default-token.png',
    });
    console.log('Token info created:', JSON.stringify(tokenInfo, null, 2));

    const tokenMint = new PublicKey(tokenInfo.tokenMint);

    // Step 2: Create fee share config
    console.log('\n--- Step 2: Creating fee share config ---');
    const configResult = await sdk.config.createBagsFeeShareConfig({
      feeClaimers: [
        { user: keypair.publicKey, userBps: 10000 },
      ],
      payer: keypair.publicKey,
      baseMint: tokenMint,
    });
    console.log('Fee share config created!');
    console.log('meteoraConfigKey:', configResult.meteoraConfigKey.toBase58());
    console.log('transactions count:', configResult.transactions.length);
    console.log('bundles count:', configResult.bundles?.length ?? 0);

    // Send bundles via Jito if any
    if (configResult.bundles && configResult.bundles.length > 0) {
      console.log('Sending bundles...');
      for (const bundle of configResult.bundles) {
        const bundleBlockhash = bundle[0]?.message.recentBlockhash;
        const tipTx = await createTipTransaction(
          connection, commitment, keypair.publicKey,
          Math.floor(0.015 * LAMPORTS_PER_SOL),
          { blockhash: bundleBlockhash },
        );
        const signed = [tipTx, ...bundle].map(tx => { tx.sign([keypair]); return tx; });
        await sendBundleAndConfirm(signed, sdk);
      }
    }

    // Send individual transactions
    if (configResult.transactions && configResult.transactions.length > 0) {
      console.log('Sending', configResult.transactions.length, 'transactions...');
      for (const tx of configResult.transactions) {
        await signAndSendTransaction(connection, commitment, tx, keypair);
      }
    }
    console.log('Fee share config fully submitted!');

    // Step 3: Create launch transaction
    console.log('\n--- Step 3: Creating launch transaction ---');
    const launchTx = await sdk.tokenLaunch.createLaunchTransaction({
      metadataUrl: tokenInfo.tokenMetadata,
      tokenMint,
      launchWallet: keypair.publicKey,
      initialBuyLamports: 0,
      configKey: configResult.meteoraConfigKey,
    });
    console.log('Launch transaction created!');

    // Step 4 & 5: Sign and broadcast
    console.log('\n--- Step 4 & 5: Signing and broadcasting ---');
    const signature = await signAndSendTransaction(connection, commitment, launchTx, keypair);
    console.log('Token launched! Signature:', signature);
    console.log('Token Mint:', tokenInfo.tokenMint);
    console.log('View at: https://bags.fm/' + tokenInfo.tokenMint);
  } catch (error: any) {
    console.error('\n--- ERROR ---');
    console.error('Message:', error.message);
    console.error('Status:', error.status);
    console.error('Payload:', JSON.stringify(error.payload, null, 2));
    console.error('Config URL:', error.config?.url);
    console.error('Config method:', error.config?.method);
    console.error('Full error keys:', Object.keys(error));
    console.error('Full error:', JSON.stringify(error, null, 2));
  }
}

main();
