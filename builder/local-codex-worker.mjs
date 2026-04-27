import { access } from "node:fs/promises";
import {
  buildGeneratedRuntimeConfig,
  generateAssistantPortraitAsset,
  generateShopSheetAssets,
  splitGeneratedShopSheet,
} from "./local-asset-pipeline.mjs";

const SERVER_BASE_URL = (process.env.LOCAL_AGENT_SERVER_BASE || "http://localhost:9999").replace(/\/$/, "");
const WORKER_ID = process.env.LOCAL_AGENT_WORKER_ID || "codex-local-worker";
const POLL_MS = Number(process.env.LOCAL_AGENT_POLL_MS || 1200);

const processingJobs = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${SERVER_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }
  return payload;
}

async function sendEvent(jobId, event) {
  await requestJson(`/api/agent/local/jobs/${jobId}/events`, {
    method: "POST",
    body: JSON.stringify({ event }),
  });
}

async function reportBlocked(jobId, payload) {
  await requestJson(`/api/agent/local/jobs/${jobId}/block`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function patchConcept(jobId, conceptPatch) {
  return requestJson(`/api/agent/local/jobs/${jobId}/concept`, {
    method: "POST",
    body: JSON.stringify({
      conceptPatch,
    }),
  });
}

async function generateContentPack(jobId) {
  return requestJson(`/api/agent/local/jobs/${jobId}/content-pack`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getMissingArtifacts(handshake) {
  const outputSlots = handshake?.assets?.outputSlots || {};
  const requiredFiles = Array.isArray(outputSlots.requiredFiles) ? outputSlots.requiredFiles : [];
  const missingArtifacts = [];
  for (const file of requiredFiles) {
    if (!file?.path || !file?.required) continue;
    if (!(await fileExists(file.path))) {
      missingArtifacts.push({
        id: file.id || file.path,
        path: file.path,
        kind: file.kind || "file",
      });
    }
  }
  return {
    artifactDir: outputSlots.artifactDir || null,
    missingArtifacts,
  };
}

async function processJob(jobId, status = {}) {
  if (processingJobs.has(jobId)) return;
  processingJobs.add(jobId);

  try {
    if (status.state === "pending") {
      await requestJson(`/api/agent/local/jobs/${jobId}/claim`, {
        method: "POST",
        body: JSON.stringify({
          claimedBy: WORKER_ID,
        }),
      });
    }

    const detail = await requestJson(`/api/agent/local/jobs/${jobId}`);
    let handshake = detail.handshake || {};
    const manifestPath =
      handshake.assets?.outputSlots?.requiredFiles?.find((item) => item.id === "tile_manifest")?.path || null;
    const assistantManifestPath =
      handshake.assets?.outputSlots?.requiredFiles?.find((item) => item.id === "assistant_manifest")?.path || null;

    if (status.state === "blocked") {
      const artifactCheck = await getMissingArtifacts(handshake);
      if (artifactCheck.missingArtifacts.length) {
        return;
      }
      await sendEvent(jobId, {
        type: "stage",
        label: "阻塞已解除",
        text: "检测到必需产物已经补齐，本地 worker 恢复这轮建店任务。",
        status: "running",
      });
    }

    await sendEvent(jobId, {
      type: "stage",
      label: "本地 worker 已接管",
      text: `${WORKER_ID} 已接管本地建店任务，开始整理 concept、prompt 和运行时配置。`,
      status: "running",
    });
    await sleep(500);

    await sendEvent(jobId, {
      type: "stage",
      label: "整理本地资产计划",
      text: "本地 worker 正在整理这轮建店所需的真实产物槽位，接下来会先生成店员肖像，再补全店内文本，最后落店铺素材表。",
      status: "running",
    });
    await sleep(700);

    await sendEvent(jobId, {
      type: "stage",
      label: "生成店员表情肖像",
      text: "正在调用 Neta 生图能力生成 4 表情店员肖像 sheet，并准备切成对话可用的表情图。",
      status: "running",
    });
    const portrait = await generateAssistantPortraitAsset(handshake);

    const portraitPatch = {
      loadingPortraitUrl: portrait.portraitUrls.serious,
      runtimeConfig: {
        assistantPortraits: portrait.portraitUrls,
      },
    };
    const portraitConceptPayload = await patchConcept(jobId, portraitPatch);
    handshake = portraitConceptPayload.handshake || handshake;

    await sendEvent(jobId, {
      type: "stage",
      label: "店员肖像已就位",
      text: "店员肖像已经切好，聊天区现在会使用这轮真实生成的助手表情。",
      status: "done",
      loadingPortraitUrl: portrait.portraitUrls.serious,
      assistantPortraits: portrait.portraitUrls,
    });

    await sendEvent(jobId, {
      type: "stage",
      label: "整理店内文本包",
      text: "正在由后台整理货源名、材料名、委托标题和引导文案，这一步不再卡在前台确认页。",
      status: "running",
    });
    const contentPackPayload = await generateContentPack(jobId);
    handshake = contentPackPayload.handshake || handshake;

    await sendEvent(jobId, {
      type: "stage",
      label: "店内文本包已写入",
      text: "货源、材料、委托和引导文案已经补齐，后续进入店里会直接使用这轮生成的新文本。",
      status: "done",
    });

    await sendEvent(jobId, {
      type: "stage",
      label: "生成店铺素材表",
      text: "正在调用 Neta 生图能力生成 shop sheet。",
      status: "running",
    });
    const shopSheet = await generateShopSheetAssets(handshake);

    await sendEvent(jobId, {
      type: "stage",
      label: "切分素材表",
      text: "正在把 shop sheet 切成 32 张 tile，并写入 manifest。",
      status: "running",
    });
    const splitResult = await splitGeneratedShopSheet(handshake);

    await sendEvent(jobId, {
      type: "stage",
      label: "校验必需产物",
      text: "本地 worker 正在检查建店必需产物是否已经真实落盘。",
      status: "running",
    });

    const artifactCheck = await getMissingArtifacts(handshake);
    if (artifactCheck.missingArtifacts.length) {
      const missingSummary = artifactCheck.missingArtifacts.map((entry) => entry.id).join("、");
      await reportBlocked(jobId, {
        reason: `缺少必需产物：${missingSummary}`,
        missingArtifacts: artifactCheck.missingArtifacts,
        artifactDir: artifactCheck.artifactDir,
      });
      console.log(
        `[local-worker] blocked ${jobId} missing=${missingSummary} dir=${artifactCheck.artifactDir || "-"}`,
      );
      return;
    }

    await sendEvent(jobId, {
      type: "stage",
      label: "回写本地运行配置",
      text: "必需产物已通过校验，正在回写新的素材目录与助手立绘配置。",
      status: "done",
    });

    await requestJson(`/api/agent/local/jobs/${jobId}/complete`, {
      method: "POST",
      body: JSON.stringify({
        agentSource: `Local Codex Worker + ${WORKER_ID}`,
        imageAssets: {
          tileAssetBase: splitResult.tileBaseUrl,
          assistantPortraits: portrait.portraitUrls,
        },
        runtimeConfig: {
          ...buildGeneratedRuntimeConfig(handshake),
          tileManifest: splitResult.manifest,
        },
        sources: {
          image: "Neta Skill Image Pipeline",
        },
        profile: {
          localWorker: WORKER_ID,
          generatedAssets: {
            shopSheet: shopSheet.outputPath,
            assistantSheet: portrait.outputPath,
            assistantPortraitManifest: assistantManifestPath,
            tileManifest: manifestPath,
            tileCount: splitResult.tileCount,
          },
        },
        sessionPatch: {
          status: "ready",
        },
      }),
    });

    console.log(`[local-worker] completed ${jobId}`);
  } catch (error) {
    console.error(`[local-worker] failed ${jobId}: ${error.message}`);
    try {
      await requestJson(`/api/agent/local/jobs/${jobId}/fail`, {
        method: "POST",
        body: JSON.stringify({
          error: error.message,
        }),
      });
    } catch (reportError) {
      console.error(`[local-worker] fail-report error ${jobId}: ${reportError.message}`);
    }
  } finally {
    processingJobs.delete(jobId);
  }
}

async function poll() {
  const payload = await requestJson("/api/agent/local/jobs");
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  for (const item of jobs) {
    const status = item.status || {};
    if (status.state === "pending") {
      processJob(item.jobId, status);
      continue;
    }
    if (
      (status.state === "claimed" || status.state === "running" || status.state === "blocked") &&
      status.claimedBy === WORKER_ID &&
      !status.completedAt
    ) {
      processJob(item.jobId, status);
    }
  }
}

console.log(`[local-worker] polling ${SERVER_BASE_URL} as ${WORKER_ID}`);

while (true) {
  try {
    await poll();
  } catch (error) {
    console.error(`[local-worker] poll error: ${error.message}`);
  }
  await sleep(POLL_MS);
}
