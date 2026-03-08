import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

async function main() {
  const c = new Connection('https://api.mainnet-beta.solana.com');
  const bal = await c.getBalance(new PublicKey('7uyFEyVTnKh1aot6EzxsjLvmRDTP8V8cviKYyW7DjwWh'));
  console.log('Balance:', bal / LAMPORTS_PER_SOL, 'SOL');
  console.log('Balance (lamports):', bal);
}
main();
