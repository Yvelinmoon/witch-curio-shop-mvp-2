# World Shop Agent Handshake

Protocol version: `world-shop-agent/v1`

## Goal

The frontend should talk to a stable build-job interface, not to a specific agent runtime.

- Local mode: `local-codex`
- Remote mode: `remote`

Switching providers should not require changing the creator flow.

## Local server environment

- `SHOP_AGENT_PROVIDER=local-codex`
  Uses the in-process local provider.
- `SHOP_AGENT_PROVIDER=remote`
  Uses the remote HTTP provider.
- `SHOP_AGENT_BASE_URL=https://your-agent-host`
  Required when `SHOP_AGENT_PROVIDER=remote`.

## Local API surface

### `GET /api/agent`

Returns the active provider metadata.

### `POST /api/build/start`

Starts a build job and returns:

```json
{
  "jobId": "job_xxx",
  "sessionId": "session_xxx",
  "agent": {
    "id": "local-codex",
    "label": "Local Codex Agent",
    "transport": "in-process",
    "mode": "local",
    "configured": true
  }
}
```

### `GET /generated/last-agent-handshake.json`

Debug artifact containing the last handshake payload sent into the active provider.

## Handshake payload

The local server builds a single payload and passes it to whichever provider is active.

Top-level fields:

- `protocolVersion`
- `requestedAt`
- `providerHint`
- `job`
- `concept`
- `builderProfile`
- `prompts`
- `assets`
- `runtime`
- `expectedResult`

## Remote provider contract

### Kickoff

`POST {SHOP_AGENT_BASE_URL}/api/world-shop/jobs`

Request body:

```json
{
  "protocolVersion": "world-shop-agent/v1",
  "job": {
    "jobId": "job_xxx",
    "sessionId": "session_xxx",
    "worldName": "霍格沃茨",
    "shopIdea": "火锅店"
  },
  "concept": {},
  "builderProfile": {},
  "prompts": {},
  "assets": {},
  "runtime": {},
  "expectedResult": {}
}
```

The remote service may respond in either mode:

### Mode A: direct completion

```json
{
  "session": {}
}
```

### Mode B: async job

```json
{
  "remoteJobId": "remote_xxx"
}
```

## Remote poll contract

`GET {SHOP_AGENT_BASE_URL}/api/world-shop/jobs/{remoteJobId}?cursor=0`

Response:

```json
{
  "status": "running",
  "events": [
    {
      "type": "stage",
      "label": "生成店铺主图",
      "text": "正在生成 4x8 店铺素材表",
      "status": "running"
    }
  ],
  "nextCursor": 1
}
```

When finished:

```json
{
  "status": "ready",
  "events": [],
  "nextCursor": 3,
  "session": {}
}
```

When failed:

```json
{
  "status": "failed",
  "error": "reason"
}
```

## Session expectation

Returned `session` should remain compatible with the current MVP:

- `sessionId`
- `status`
- `enteredShop`
- `createdAt`
- `worldName`
- `shopIdea`
- `concept`
- `runtimeConfig`
- `sources`
- `profile`

`sources.agent` should identify the real executor.
