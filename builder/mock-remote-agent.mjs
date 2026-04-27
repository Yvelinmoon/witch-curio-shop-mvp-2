import { createServer } from "node:http";

const PORT = Number(process.env.REMOTE_AGENT_PORT || 10001);
const HOST = process.env.REMOTE_AGENT_HOST || "localhost";

const jobs = new Map();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildAssistantPortraits(base = "/Downloads/hermione_emotions_tiles_1x4_trimmed") {
  return {
    angry: `${base}/angry.png`,
    confused: `${base}/confused.png`,
    serious: `${base}/serious.png`,
    smile: `${base}/smile.png`,
  };
}

function buildReadySession(handshake) {
  const concept = handshake.concept || {};
  const runtimeConfig = {
    ...(concept.runtimeConfig || {}),
    assistantPortraits:
      concept.runtimeConfig?.assistantPortraits ||
      buildAssistantPortraits(handshake.assets?.defaults?.assistantAssetBase),
    tileAssetBase:
      concept.runtimeConfig?.tileAssetBase || handshake.assets?.defaults?.tileAssetBase || "",
  };

  return {
    sessionId: handshake.job?.sessionId,
    status: "ready",
    enteredShop: false,
    createdAt: new Date().toISOString(),
    worldName: handshake.job?.worldName || concept.worldName || "未知世界",
    shopIdea: handshake.job?.shopIdea || concept.shopIdea || "",
    concept,
    runtimeConfig,
    sources: {
      llm: handshake.runtime?.llm || "unknown",
      builder: `Remote Agent + ${handshake.builderProfile?.id || "world-shop-builder"}`,
      image: "Mock Remote Image Adapter",
      agent: "Remote World Shop Agent (mock)",
    },
    profile: {
      ...(handshake.builderProfile || {}),
      remoteProvider: "mock-remote-agent",
      promptsLoaded: Object.keys(handshake.prompts || {}),
    },
  };
}

function scheduleJobProgress(job) {
  const steps = [
    {
      delay: 180,
      event: {
        type: "stage",
        label: "远程 agent 已接单",
        text: "已接收建店握手 payload，正在解析 concept、prompt 和素材计划。",
        status: "done",
      },
    },
    {
      delay: 520,
      event: {
        type: "assistant",
        name: job.handshake.concept?.assistantName || "助手",
        text: "我已经把这次建店需求转给远程施工端，接下来会按统一协议持续回传进度。",
      },
    },
    {
      delay: 980,
      event: {
        type: "stage",
        label: "远程整理资产任务",
        text: "远程 agent 正在组合店铺图、助手图与运行时配置。",
        status: "running",
      },
    },
    {
      delay: 1540,
      event: {
        type: "stage",
        label: "远程回填运行配置",
        text: "远程 agent 已完成主要产物整理，正在准备回传 session。",
        status: "done",
      },
    },
  ];

  for (const step of steps) {
    setTimeout(() => {
      job.events.push(step.event);
    }, step.delay);
  }

  setTimeout(() => {
    job.status = "ready";
    job.session = buildReadySession(job.handshake);
  }, 2100);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/api/world-shop/jobs") {
      const handshake = await readJsonBody(request);
      const remoteJobId = `remote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job = {
        remoteJobId,
        handshake,
        status: "running",
        events: [],
        session: null,
      };
      jobs.set(remoteJobId, job);
      scheduleJobProgress(job);
      sendJson(response, 200, {
        remoteJobId,
        accepted: true,
        provider: {
          id: "remote",
          label: "Remote World Shop Agent (mock)",
          mode: "remote",
          transport: "http",
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/world-shop/jobs/")) {
      const remoteJobId = url.pathname.split("/").pop();
      const cursor = Number(url.searchParams.get("cursor") || "0");
      const job = jobs.get(remoteJobId);
      if (!job) {
        sendJson(response, 404, { error: "Unknown remote job" });
        return;
      }

      sendJson(response, 200, {
        status: job.status,
        events: job.events.slice(cursor),
        nextCursor: job.events.length,
        session: job.status === "ready" ? job.session : null,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, provider: "mock-remote-agent" });
      return;
    }

    sendJson(response, 404, { error: "Not Found" });
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || "Internal Server Error",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mock remote agent listening on http://${HOST}:${PORT}`);
});
