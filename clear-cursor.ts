import 'dotenv/config';
import { PrismaClient } from './src/generated/prisma/client.js';

const p = new PrismaClient();
await p.processingState.deleteMany();
console.log('Cursor cleared');
await p.$disconnect();
