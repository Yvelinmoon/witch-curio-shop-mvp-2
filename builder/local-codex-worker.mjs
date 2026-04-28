import { access } from "node:fs/promises";
import {
  buildGeneratedRuntimeConfig,
  generateAssistantPortraitAsset,
  generateShopDecorStickerAssets,
  generateShopSheetAssets,
  generateUiButtonStickerAssets,
  splitGeneratedShopDecorStickers,
  splitGeneratedShopSheet,
  splitGeneratedUiButtonStickers,
} from "./local-asset-pipeline.mjs";

const SERVER_BASE_URL = (process.env.LOCAL_AGENT_SERVER_BASE || "http://127.0.0.1:9999").replace(/\/$/, "");
const WORKER_ID = process.env.LOCAL_AGENT_WORKER_ID || "codex-local-worker";
const POLL_MS = Number(process.env.LOCAL_AGENT_POLL_MS || 1200);

const processingJobs = new Set();

const REQUIRED_THEME_KEYS = [
  "bgTop",
  "bgBottom",
  "paper",
  "paperSoft",
  "gold",
  "shopBgTop",
  "shopBgMid",
  "shopBgBottom",
  "shopLight",
  "shopLightSoft",
  "shopPanel",
  "shopPanel2",
  "shopPaper",
  "shopPaperSoft",
  "shopCard",
  "shopCardDark",
  "shopBorder",
  "shopBorderDark",
  "shopGold",
  "shopGoldSoft",
  "shopGreen",
  "shopRed",
  "shopText",
  "shopInk",
  "shopMuted",
];

function isThemeColor(value) {
  const normalized = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return true;
  return /^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(normalized);
}

function getMissingThemeTokens(handshake) {
  const theme = handshake?.concept?.runtimeConfig?.theme || {};
  return REQUIRED_THEME_KEYS.filter((key) => !isThemeColor(theme[key]));
}

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
    const decorManifestPath =
      handshake.assets?.outputSlots?.requiredFiles?.find((item) => item.id === "shop_decor_manifest")?.path || null;
    const uiButtonManifestPath =
      handshake.assets?.outputSlots?.requiredFiles?.find((item) => item.id === "ui_button_manifest")?.path || null;

    if (status.state === "blocked") {
      const artifactCheck = await getMissingArtifacts(handshake);
      if (artifactCheck.missingArtifacts.length) {
        return;
      }
      await sendEvent(jobId, {
        type: "stage",
        label: "缺件已补齐",
        text: "检测到开张所需内容已经补齐，这轮建店继续推进。",
        status: "running",
      });
    }

    await sendEvent(jobId, {
      type: "stage",
      label: "开店信已接下",
      text: "开店信已经接下，先把店铺主题、店员职责和开张清单定稳。",
      status: "running",
    });
    await sleep(500);

    await sendEvent(jobId, {
      type: "stage",
      label: "排开开张清单",
      text: "开张清单已经摊开：店员、货物、装饰和入口贴纸都要备齐。",
      status: "running",
    });
    await sleep(700);

    await sendEvent(jobId, {
      type: "stage",
      label: "定下店铺氛围",
      text: "已确认本轮店铺的主色、材质和灯光氛围。",
      status: "done",
    });

    const missingThemeTokens = getMissingThemeTokens(handshake);
    if (missingThemeTokens.length) {
      await reportBlocked(jobId, {
        reason: `还缺店铺主题配色：${missingThemeTokens.join("、")}`,
        missingArtifacts: missingThemeTokens.map((key) => ({ id: `theme.${key}`, kind: "theme-token" })),
        artifactDir: null,
      });
      console.log(`[local-worker] blocked ${jobId} missing-theme=${missingThemeTokens.join(",")}`);
      return;
    }

    await sendEvent(jobId, {
      type: "stage",
      label: "等待店员到来",
      text: "门铃快响了，店员正带着四种表情赶来。",
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
      label: "店员到位",
      text: "店员已经到柜台前了，接下来会用自己的表情陪你看开张进度。",
      status: "done",
      loadingPortraitUrl: portrait.portraitUrls.serious,
      assistantPortraits: portrait.portraitUrls,
    });

    await sendEvent(jobId, {
      type: "stage",
      label: "书写货源与委托",
      text: "正在写货源牌、委托单和第一批客人的需求。",
      status: "running",
    });
    const contentPackPayload = await generateContentPack(jobId);
    handshake = contentPackPayload.handshake || handshake;

    await sendEvent(jobId, {
      type: "stage",
      label: "货源委托就绪",
      text: "货源牌和委托单已经摆好，客人一来就能看懂。",
      status: "done",
    });

    await sendEvent(jobId, {
      type: "stage",
      label: "准备第一批货物",
      text: "第一批货物正在上托盘。",
      status: "running",
    });
    const shopSheet = await generateShopSheetAssets(handshake);

    await sendEvent(jobId, {
      type: "stage",
      label: "摆放第一批货物",
      text: "正在把货物一件件摆进工作台格子。",
      status: "running",
    });
    const splitResult = await splitGeneratedShopSheet(handshake);

    await sendEvent(jobId, {
      type: "stage",
      label: "挑选店面装饰",
      text: "正在挑选能贴在柜台旁的店面装饰。",
      status: "running",
    });
    const shopDecorStickers = await generateShopDecorStickerAssets(handshake);

    await sendEvent(jobId, {
      type: "stage",
      label: "店面装饰就绪",
      text: "装饰已经裁好，等开张后可以拖着摆放。",
      status: "running",
    });
    const decorSplitResult = await splitGeneratedShopDecorStickers(handshake);

    await sendEvent(jobId, {
      type: "stage",
      label: "准备入口小牌",
      text: "大厅、图鉴、收藏、重开和垃圾桶的小牌子正在备好。",
      status: "running",
    });
    const uiButtonStickers = await generateUiButtonStickerAssets(handshake);

    await sendEvent(jobId, {
      type: "stage",
      label: "入口小牌就绪",
      text: "小牌子已经分好，等会儿会挂到店里。",
      status: "running",
    });
    const uiButtonSplitResult = await splitGeneratedUiButtonStickers(handshake);

    await sendEvent(jobId, {
      type: "stage",
      label: "清点开张用品",
      text: "最后清点一遍：货物、店员、装饰和店牌都要齐。",
      status: "running",
    });

    const artifactCheck = await getMissingArtifacts(handshake);
    if (artifactCheck.missingArtifacts.length) {
      const missingSummary = artifactCheck.missingArtifacts.map((entry) => entry.id).join("、");
      await reportBlocked(jobId, {
        reason: `还缺开张用品：${missingSummary}`,
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
      label: "开张用品已入店",
      text: "开张要用的东西都齐了，正在把它们搬进店里。",
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
            shopDecorStickers: shopDecorStickers.outputPath,
            uiButtonStickers: uiButtonStickers.outputPath,
            assistantPortraitManifest: assistantManifestPath,
            tileManifest: manifestPath,
            decorationManifest: decorManifestPath,
            uiButtonManifest: uiButtonManifestPath,
            tileCount: splitResult.tileCount,
            decorationCount: decorSplitResult.stickerCount,
            uiButtonCount: uiButtonSplitResult.stickerCount,
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
