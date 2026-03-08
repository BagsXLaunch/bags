# BagsBot — Social Launch Bot

A TypeScript bot that turns X (Twitter) mentions into Bags-native token launches.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Initialize database
npx prisma db push

# Run in development mode
npm run dev

# Run tests
npm test
```

## Architecture

```
src/
  app/           — config, logger, env, db client
  api/           — Fastify health + admin endpoints
  modules/
    mentions/    — X API polling & mention service
    parser/      — Tweet text → launch command parser
    validation/  — Blacklist, rate limit, duplicate checks
    launches/    — Orchestrator: parse → validate → launch → reply
    providers/   — Launch provider adapters (mock, bags)
    replies/     — Reply templates & posting service
    db/          — Prisma repositories
  shared/        — Types, errors, utils, metrics
  workers/       — Background job processor
```

## Command Syntax

**Plain syntax:**

```
@BagsLaunch "My Project" $PROJ
```

**Key/value syntax:**

```
@BagsLaunch name:"My Project" ticker:"PROJ" desc:"A cool token"
```

## API Endpoints

| Method | Path                        | Description                    |
| ------ | --------------------------- | ------------------------------ |
| GET    | `/health`                   | Health check                   |
| GET    | `/admin/stats`              | Metrics & DB stats             |
| GET    | `/admin/launches`           | Recent launch records          |
| POST   | `/admin/launches/:id/retry` | Retry a failed launch          |
| POST   | `/admin/process-tweet`      | Manual tweet processing (demo) |

## Demo Mode

With `LAUNCH_PROVIDER=mock` and `ENABLE_REPLY_POSTING=false`, the bot uses a mock provider and logs replies instead of posting to X. Test with:

```bash
curl -X POST http://localhost:3000/admin/process-tweet \
  -H "Content-Type: application/json" \
  -d '{"tweetId":"demo_1","authorId":"user_1","authorUsername":"testuser","text":"@BagsLaunch \"My Token\" $MTK"}'
```

## Environment Variables

See [.env.example](.env.example) for all configuration options.

## Launch Provider

The bot uses an adapter pattern for token creation:

- **mock** — Returns fake token data (development/demo)
- **bags** — Calls the real Bags API (`https://docs.bags.fm/how-to-guides/launch-token`)

Set `LAUNCH_PROVIDER=bags` and configure `BAGS_API_BASE_URL` + `BAGS_API_KEY` for production.

## Launch Lifecycle

`received` → `parsed` → `queued` → `launching` → `launched` → `reply_sent`

Failed states: `invalid`, `failed`, `retryable_failed`
