import 'dotenv/config';
import { prisma } from './src/app/db.js';

async function main() {
  const states = await prisma.processingState.findMany();
  console.log('Processing states:', JSON.stringify(states, null, 2));
  
  // Clear the cursor so the poller fetches fresh mentions
  await prisma.processingState.deleteMany({ where: { key: 'last_mention_id' } });
  console.log('Cleared last_mention_id cursor');
  
  await prisma.$disconnect();
}

main();
