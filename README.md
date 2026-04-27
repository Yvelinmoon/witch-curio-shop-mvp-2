# Witch Curio Shop MVP 2

This version adds a local `orchestrator` layer in front of the existing merge shop shell, so the game can support:

- world/shop idea input
- concept confirmation
- build-time assistant chat
- persisted runtime config injection into the existing gameplay shell
- switchable build-agent providers

## Files

- `server.mjs`: local orchestrator, static server, build/session APIs, SSE stream
- `creator.js`: onboarding and shop-creation flow on the frontend
- `app.js`: existing gameplay loop, now with runtime config injection support
- `styles.css`: gameplay styling plus creator overlay styling
- `builder/skills/shop-builder/*`: builder profile and prompt files
- `builder/agent-handshake.md`: unified local/remote agent handshake contract
- `builder/local-codex-worker.mjs`: local worker bridge for the `local-codex` provider
- `builder/mock-remote-agent.mjs`: local mock remote agent for testing the remote provider path

## Local Run

```bash
npm start
```

Start the local worker in another terminal:

```bash
npm run start:local-worker
```

Environment variables:

- `PORT`: local server port, default `9999`
- `HOST`: local bind host, default `localhost`
- `WORLD_NAME`: default world label shown in the creator flow
- `NETA_LLM_BASE_URL`: optional override, default `https://litellm.talesofai.com`
- `NETA_LLM_MODEL`: optional override, default `qwen3.5-flash-no-think`
- `SHOP_AGENT_PROVIDER`: `local-codex` or `remote`, default `local-codex`
- `SHOP_AGENT_BASE_URL`: required when `SHOP_AGENT_PROVIDER=remote`
- `SHOP_AGENT_REMOTE_TIMEOUT_MS`: optional remote agent timeout, default `180000`
- `LOCAL_AGENT_SERVER_BASE`: optional override for the local worker, default `http://localhost:9999`
- `LOCAL_AGENT_WORKER_ID`: optional local worker id, default `codex-local-worker`

## Remote Provider Dry Run

Start the mock remote agent:

```bash
npm run start:remote-agent
```

Start the main app in remote mode:

```bash
SHOP_AGENT_PROVIDER=remote SHOP_AGENT_BASE_URL=http://localhost:10001 npm start
```

Then open `http://localhost:9999` and create a shop normally. The frontend flow stays the same; only the active agent provider changes.

## Current Handshake

1. Frontend generates concept directly with the current app's OAuth token
2. Frontend confirms and calls `POST /api/build/start`
3. Local orchestrator builds a single agent handshake payload
4. Active build-agent provider handles the job:
   - `local-codex`: queue + local worker bridge
   - `remote`: HTTP provider using the contract in `builder/agent-handshake.md`
5. Frontend subscribes to `GET /api/build/stream/:jobId`
6. Loading chat uses frontend-direct LLM
7. Completed runtime config is persisted in `generated/current-session.json`
8. Frontend enters the shop and marks it via `POST /api/session/enter`

## Current Responsibility Split

- `creator.js`: only handles UI state, onboarding flow, and API handshakes
- `server.mjs`: current local orchestrator and build-agent router
- `neta-auth.js`: frontend OAuth2 PKCE auth helper based on the Neta developer skill flow
- `NetaLLMAdapter`: backend-side adapter slot; current concept/chat path has moved to frontend-direct OAuth calls
- `MockImageAdapter`: current image adapter slot, ready to be replaced by a real neta/image pipeline
- `LocalCodexAgentProvider`: current default local build provider
- `local-codex-worker.mjs`: polls pending local jobs, claims them, emits progress events, and completes sessions
- `RemoteAgentProvider`: HTTP remote build provider, compatible with `world-shop-agent/v1`

In other words: the frontend now talks to the LLM directly for concept/chat, but talks to the local orchestrator for build jobs. The orchestrator then decides which build-agent provider to use.

## Notes

- The current image path is mock-linked to local asset folders.
- The real image-generation path is intentionally isolated behind the image adapter.
- The current LLM path uses Neta OAuth bearer tokens from the frontend.
- The current active agent can be inspected via `GET /api/agent`.
- Pending local jobs can be inspected via `GET /api/agent/local/jobs`.
- The last generated build-agent handshake payload is persisted to `generated/last-agent-handshake.json`.
- The local redirect URI currently assumes `http://localhost:9999/`.
