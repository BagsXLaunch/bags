import 'dotenv/config';
import { TwitterApi } from 'twitter-api-v2';

const BEARER = process.env.X_BEARER_TOKEN!;
const BOT = process.env.BOT_USERNAME!;

async function test() {
  console.log(`Testing X API for @${BOT}...`);
  console.log(`Bearer token starts with: ${BEARER.substring(0, 20)}...`);

  const client = new TwitterApi(BEARER);

  // Step 1: Look up the bot user
  console.log('\n--- Step 1: User lookup ---');
  try {
    const me = await client.v2.userByUsername(BOT);
    console.log('User found:', JSON.stringify(me.data, null, 2));
    
    if (!me.data) {
      console.error('ERROR: Could not find user. Check BOT_USERNAME in .env');
      return;
    }

    // Step 2: Get mentions
    console.log('\n--- Step 2: Mention timeline (NO since_id) ---');
    try {
      const mentions = await client.v2.userMentionTimeline(me.data.id, {
        'tweet.fields': ['created_at', 'author_id', 'text'],
        'user.fields': ['username', 'name'],
        expansions: ['author_id'],
        max_results: 10,
      });

      console.log('Meta:', JSON.stringify(mentions.meta, null, 2));
      console.log('Result count:', mentions.data?.data?.length ?? 0);
      
      if (mentions.data?.data?.length) {
        for (const tweet of mentions.data.data) {
          const author = mentions.includes?.users?.find((u) => u.id === tweet.author_id);
          console.log(`\n  Tweet ${tweet.id} by @${author?.username ?? tweet.author_id}:`);
          console.log(`  Text: ${tweet.text}`);
          console.log(`  Created: ${tweet.created_at}`);
        }
      } else {
        console.log('No mentions found. Possible reasons:');
        console.log('  1. X API Free tier does not support userMentionTimeline');
        console.log('  2. No recent mentions exist');
        console.log('  3. API rate limited');
      }
    } catch (err: any) {
      console.error('Mention timeline error:', err.code, err.message);
      if (err.data) console.error('API response:', JSON.stringify(err.data, null, 2));
      
      if (err.code === 403) {
        console.error('\n*** ACCESS DENIED ***');
        console.error('The X API Free tier does NOT support userMentionTimeline.');
        console.error('You need Basic tier ($100/mo) or use search as an alternative.');
      }
    }

    // Step 3: Try search as alternative
    console.log('\n--- Step 3: Search tweets (alternative) ---');
    try {
      const search = await client.v2.search(`@${BOT}`, {
        'tweet.fields': ['created_at', 'author_id', 'text'],
        'user.fields': ['username', 'name'],
        expansions: ['author_id'],
        max_results: 10,
      });

      console.log('Search meta:', JSON.stringify(search.meta, null, 2));
      console.log('Search result count:', search.data?.data?.length ?? 0);

      if (search.data?.data?.length) {
        for (const tweet of search.data.data) {
          const author = search.includes?.users?.find((u) => u.id === tweet.author_id);
          console.log(`\n  Tweet ${tweet.id} by @${author?.username ?? tweet.author_id}:`);
          console.log(`  Text: ${tweet.text}`);
        }
      }
    } catch (err: any) {
      console.error('Search error:', err.code, err.message);
      if (err.data) console.error('API response:', JSON.stringify(err.data, null, 2));
      
      if (err.code === 403) {
        console.error('Search also requires Basic tier.');
      }
    }

  } catch (err: any) {
    console.error('User lookup error:', err.code, err.message);
    if (err.data) console.error('API response:', JSON.stringify(err.data, null, 2));
  }
}

test().catch(console.error);
