import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PNG } from "pngjs";

const execFileAsync = promisify(execFile);
const NETA_IMAGE_TIMEOUT_MS = Number(process.env.NETA_IMAGE_TIMEOUT_MS || 300_000);
const IMAGE_RETRY_DELAY_MS = Number(process.env.NETA_IMAGE_RETRY_DELAY_MS || 900);
const NETA_SKILL_CONFIG_DIR = process.env.NETA_SKILL_CONFIG_DIR || path.join(process.cwd(), "generated", ".neta-skill-config");
const NETA_SKILL_API_BASE_URL = process.env.NETA_API_BASE_URL || "https://api.talesofai.cn";
let didLogNetaSkillIdentity = false;

function buildNetaSkillEnv() {
  return {
    ...process.env,
    NETA_CONFIG_DIR: NETA_SKILL_CONFIG_DIR,
    NETA_API_BASE_URL: NETA_SKILL_API_BASE_URL,
  };
}

function decodeJwtPayload(token = "") {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function logNetaSkillIdentityOnce() {
  if (didLogNetaSkillIdentity) return;
  didLogNetaSkillIdentity = true;
  const payload = decodeJwtPayload(process.env.NETA_TOKEN || "");
  console.log("[asset-pipeline] neta skill env", {
    apiBaseUrl: NETA_SKILL_API_BASE_URL,
    configDir: NETA_SKILL_CONFIG_DIR,
    tokenPresent: Boolean(process.env.NETA_TOKEN),
    tokenUserId: payload?.id || payload?.talesofai_id || payload?.sub || null,
    tokenUuid: payload?.uuid || payload?.talesofai_uuid || null,
    tokenExpiresAt: payload?.expires_at || payload?.exp || null,
  });
}

function assertNetaEnvTokenPresent() {
  if (!process.env.NETA_TOKEN) {
    throw new Error("Neta image token missing from environment");
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeImagePromptForCompliance(prompt = "") {
  return String(prompt || "")
    .replace(/红色警戒2?|红警|Red\s*Alert/gi, "retro strategy game")
    .replace(/前苏联|苏维埃|苏联/g, "retro faction")
    .replace(/盟军/g, "blue faction")
    .replace(/情报局|最高指挥部|指挥部/g, "command office")
    .replace(/军需官/g, "supply manager")
    .replace(/高级军官|军官|指挥官/g, "strategy shop manager")
    .replace(/战场|前线|作战|战术|战争|军事/g, "strategy game")
    .replace(/部队|兵员|兵种/g, "unit miniatures")
    .replace(/战车|坦克|装甲载具/g, "armored vehicle model")
    .replace(/战舰|舰船/g, "naval vehicle model")
    .replace(/飞机/g, "air vehicle model")
    .replace(/超级武器|武器|军械|火炮|导弹|枪|炮/g, "special equipment model")
    .replace(/压倒性优势|投入战斗|部署|补充/g, "collection progress")
    .replace(/基地/g, "strategy shop")
    .replace(/阵营/g, "team")
    .replace(/造价与性能参数/g, "catalog details")
    .replace(/retro strategy game\s*主题商店/g, "retro strategy game themed shop")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SHEET_CHAIN_ORDER = ["botanical", "alchemy", "curio", "waste", "secret"];
const SHEET_CHAIN_COUNTS = {
  botanical: 6,
  alchemy: 6,
  curio: 6,
  waste: 6,
  secret: 8,
};

function normalizeContentItem(item, fallbackName) {
  if (Array.isArray(item)) {
    return {
      name: normalizeText(item[0]) || fallbackName,
      description: normalizeText(item[1]) || "",
    };
  }
  if (item && typeof item === "object") {
    return {
      name: normalizeText(item.name) || fallbackName,
      description: normalizeText(item.description) || "",
    };
  }
  return {
    name: fallbackName,
    description: "",
  };
}

function buildSheetSlotPlan(handshake) {
  const contentPack = handshake?.concept?.runtimeConfig?.contentPack || {};
  const chainsById = new Map(
    (Array.isArray(contentPack.chains) ? contentPack.chains : []).map((chain) => [chain.id, chain]),
  );
  const slotPlan = [];
  let slotIndex = 0;

  for (const chainId of SHEET_CHAIN_ORDER) {
    const chain = chainsById.get(chainId) || {};
    const chainLabel = normalizeText(chain.label) || chainId;
    const items = Array.isArray(chain.items) ? chain.items : [];
    const count = SHEET_CHAIN_COUNTS[chainId] || items.length;
    for (let index = 0; index < count; index += 1) {
      const tier = index + 1;
      const itemId = `${chainId}-${tier}`;
      const fallbackName = `${chainLabel}${tier}`;
      const normalized = normalizeContentItem(items[index], fallbackName);
      slotPlan.push({
        slotIndex,
        row: Math.floor(slotIndex / 8) + 1,
        col: (slotIndex % 8) + 1,
        itemId,
        chainId,
        chainLabel,
        tier,
        name: normalized.name,
        description: normalized.description,
      });
      slotIndex += 1;
    }
  }

  return slotPlan;
}

function buildSheetSlotSemanticCue(slot) {
  const visualNotes = [slot.name, slot.description]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join("; ");
  return visualNotes || `${slot.chainLabel} tier ${slot.tier}`;
}

function buildShopSheetPrompt(handshake) {
  const concept = handshake?.concept || {};
  const prompt = handshake?.prompts?.shopSheet || "";
  const slotPlan = buildSheetSlotPlan(handshake);
  const slotLines = slotPlan.map(
    (slot) =>
      `R${slot.row}C${slot.col} | semantic cue only: ${buildSheetSlotSemanticCue(slot)}`,
  );
  return [
    prompt,
    `World: ${concept.worldName || "Unknown World"}`,
    `Shop idea: ${concept.shopIdea || ""}`,
    `Shop name: ${concept.shopName || ""}`,
    `Shop summary: ${concept.summary || ""}`,
    `Loop summary: ${concept.loopSummary || ""}`,
    "Need a single coherent 4x8 sprite sheet for merge gameplay props.",
    "Every tile slot matches the requested item exactly, in the listed order, with one prop per slot.",
    "Slot notes are semantic guidance for choosing shapes, colors, and materials.",
    "All surfaces are blank and unbranded, with pictorial decoration only.",
    "If an item would normally include branding or printed packaging, replace it with blank unbranded surfaces and shape-only decoration.",
    "Each tile contains one centered isolated prop only, on a clean background without extra interface elements.",
    "Leave generous pure white padding around every prop inside its own slot.",
    "Keep obvious empty whitespace between neighboring slots so no silhouette touches or crosses into another tile.",
    "Make every prop slightly smaller than the slot bounds to keep grid cutting safe.",
    "Tile slot plan, left to right and top to bottom:",
    ...slotLines,
    "Solid pure white background only, isolated props, consistent shop style, no text.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSafeShopSheetPrompt(handshake) {
  const slotPlan = buildSheetSlotPlan(handshake);
  const slotLines = slotPlan.map((slot) => {
    const chainDescriptorMap = {
      botanical: "first coherent merge upgrade ladder prop",
      alchemy: "second coherent merge upgrade ladder prop",
      curio: "third coherent merge upgrade ladder prop",
      waste: "failed shop residue",
      secret: "rare original hidden shop reward",
    };
    const descriptor = chainDescriptorMap[slot.chainId] || "original shop prop";
    return `R${slot.row}C${slot.col} | ${descriptor} | tier ${slot.tier} | semantic cue only: ${buildSheetSlotSemanticCue(slot)}`;
  });

  return [
    "Generate a single sprite sheet for an original themed shop merge game.",
    "Use original shop props, original silhouettes, blank labels, and unbranded designs.",
    "Need a single coherent 4x8 sprite sheet for merge gameplay props.",
    "Every tile slot matches the requested item exactly, in the listed order, with one prop per slot.",
    "Slot notes are semantic guidance for choosing shapes, colors, and materials.",
    "All surfaces are blank and unbranded, with pictorial decoration only.",
    "If an item would normally include branding or printed packaging, replace it with blank unbranded surfaces and shape-only decoration.",
    "Each tile contains one centered isolated prop only, on a clean background without extra interface elements.",
    "Leave generous pure white padding around every prop inside its own slot.",
    "Keep obvious empty whitespace between neighboring slots so no silhouette touches or crosses into another tile.",
    "Make every prop slightly smaller than the slot bounds to keep grid cutting safe.",
    "Tile slot plan, left to right and top to bottom:",
    ...slotLines,
    "Visual style: warm, handcrafted, whimsical shop props.",
    "Solid pure white background only, isolated props, no text.",
  ].join("\n\n");
}

function buildAssistantPrompt(handshake) {
  const concept = handshake?.concept || {};
  const prompt = handshake?.prompts?.assistant || "";
  return [
    prompt,
    `World: ${concept.worldName || "Unknown World"}`,
    `Shop idea: ${concept.shopIdea || ""}`,
    `Shop name: ${concept.shopName || ""}`,
    `Assistant name: ${concept.assistantName || ""}`,
    `Assistant role: ${concept.assistantRole || ""}`,
    `Assistant summary: ${concept.assistantSummary || ""}`,
    "Do not add species, body features, technology, powers, factions, or genre elements that are not present in the shop idea, world, role, or summary.",
    "For a real-world shop, use a believable shop worker outfit and grounded character design.",
    "The image must be one horizontal 16:9 game asset sheet.",
    "Place exactly four separate half-body portraits in the four corners of the canvas, arranged as a clear 2x2 slicing layout.",
    "Corner order must be: top-left smile, top-right serious, bottom-left angry, bottom-right confused.",
    "Keep the center of the canvas mostly empty pure white space so the four portraits never touch each other.",
    "Half-body portrait framing only, fully visible character in each corner quadrant.",
    "Same character design in all four portraits, solid pure white background only.",
    "Leave generous whitespace around head, hair, hands, and shoulders so 2x2 slicing never cuts into the figure.",
    "Keep each character centered inside its own corner quadrant and slightly smaller than the quadrant bounds.",
    "Every body part stays inside its own quadrant boundaries.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSafeAssistantPrompt(handshake) {
  const concept = handshake?.concept || {};
  const roleText = normalizeText(concept.assistantRole) || "shop assistant";
  const summaryText = normalizeText(concept.assistantSummary) || "smart, reliable, warm helper";
  return [
    "Design an original shop assistant character for a shop game.",
    "Use an original character design with original clothing, silhouette, and accessories.",
    `Role focus: ${roleText}`,
    `Personality summary: ${summaryText}`,
    "Do not add species, body features, technology, powers, factions, or genre elements that are not present in the role or personality summary.",
    "For a real-world shop, use a believable shop worker outfit and grounded character design.",
    "Young original assistant, clever expression, readable silhouette, game-friendly design.",
    "The image must be one horizontal 16:9 game asset sheet.",
    "Place exactly four separate half-body portraits in the four corners of the canvas, arranged as a clear 2x2 slicing layout.",
    "Corner order must be: top-left smile, top-right serious, bottom-left angry, bottom-right confused.",
    "Keep the center of the canvas mostly empty pure white space so the four portraits never touch each other.",
    "Half-body portrait framing only, fully visible character in each corner quadrant.",
    "Same character design in all four portraits, solid pure white background only.",
    "Leave generous whitespace around head, hair, hands, and shoulders so 2x2 slicing never cuts into the figure.",
    "Keep each character centered inside its own corner quadrant and slightly smaller than the quadrant bounds.",
    "Every body part stays inside its own quadrant boundaries.",
  ].join("\n\n");
}

function buildShopDecorStickerPrompt(handshake) {
  const concept = handshake?.concept || {};
  const prompt = handshake?.prompts?.shopDecorStickers || "";
  return [
    prompt,
    `World: ${concept.worldName || "Unknown World"}`,
    `Shop idea: ${concept.shopIdea || ""}`,
    `Shop name: ${concept.shopName || ""}`,
    `Shop summary: ${concept.summary || ""}`,
    "Need a single coherent 2x3 sprite sheet for draggable shop decoration props.",
    "Invisible grid layout: exactly 2 rows and 3 columns, no drawn grid lines, no borders, no dividers.",
    "Every cell contains exactly one centered isolated decoration prop only.",
    "Use consistent scale, consistent camera angle, consistent lighting, and consistent handcrafted casual game asset style across all six props.",
    "Each prop must stay clearly inside its own cell and be slightly smaller than the cell bounds.",
    "Leave generous pure white padding around every prop inside its own cell.",
    "Keep obvious pure white gutters between neighboring cells so no silhouette, shadow, or detail touches another prop.",
    "Do not scatter objects organically; do not create a poster, collage, room scene, storefront scene, or shelf scene.",
    "Make the six decorations theme-specific and useful for decorating the merge workbench area.",
    "Slot plan, left to right and top to bottom: R1C1 shelf/rack prop, R1C2 counter/display prop, R1C3 wall sign or lamp prop, R2C1 crate/cabinet prop, R2C2 floor prop, R2C3 door/window/ornament prop.",
    "Solid pure white background only, isolated sticker props, blank unbranded surfaces, no text.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSafeShopDecorStickerPrompt(handshake) {
  const concept = handshake?.concept || {};
  return [
    "Generate a 2x3 sticker sheet for an original shop game.",
    "Use original shop props, original silhouettes, blank labels, and unbranded designs.",
    `Shop idea: ${concept.shopIdea || "custom shop"}`,
    `Shop name: ${concept.shopName || "custom shop"}`,
    "Need a single coherent 2x3 sprite sheet for draggable shop decoration props.",
    "Invisible grid layout: exactly 2 rows and 3 columns, no drawn grid lines, no borders, no dividers.",
    "Create 6 theme-specific decorative shop props: shelf/rack, counter/display, wall sign or lamp, crate/cabinet, floor prop, door/window/ornament.",
    "Every cell contains exactly one centered isolated object only.",
    "Use consistent scale, consistent camera angle, consistent lighting, and consistent asset quality across all six objects.",
    "Each object must stay clearly inside its own cell and be slightly smaller than the cell bounds.",
    "Leave generous pure white padding around every object and clear white gutters between neighboring cells.",
    "No object should touch, overlap, cast a shadow into, or visually connect with another cell.",
    "Do not scatter objects organically; do not create a poster, collage, room scene, storefront scene, or shelf scene.",
    "Blank unbranded surfaces, isolated objects, generous whitespace, no visible grid lines, no text.",
    "Warm handcrafted casual game sticker style, solid pure white background only.",
  ].join("\n\n");
}

function buildUiButtonStickerPrompt(handshake) {
  const concept = handshake?.concept || {};
  const prompt = handshake?.prompts?.uiButtonStickers || "";
  return [
    prompt,
    `World: ${concept.worldName || "Unknown World"}`,
    `Shop idea: ${concept.shopIdea || ""}`,
    `Shop name: ${concept.shopName || ""}`,
    "Need a single coherent 1x5 horizontal sprite sheet for floating shop control icons.",
    "Invisible grid layout: exactly 1 row and 5 columns, no drawn grid lines, no borders, no dividers.",
    "Every cell contains exactly one centered isolated icon-like object only.",
    "Use consistent scale, consistent camera angle, consistent lighting, and consistent handcrafted casual game asset style across all five icons.",
    "Each icon must stay clearly inside its own cell and be slightly smaller than the cell bounds.",
    "Leave generous pure white padding around every icon inside its own cell.",
    "Keep obvious pure white gutters between neighboring cells so no silhouette, shadow, or detail touches another icon.",
    "Do not scatter objects organically; do not create a poster, collage, toolbar mockup, interface screenshot, or button UI frame.",
    "Slot plan left to right: R1C1 lobby entrance icon, R1C2 collection book icon, R1C3 favorites shelf icon, R1C4 restart loop icon, R1C5 trash bin icon.",
    "The five button stickers must remain readable at small sizes and match the shop theme.",
    "Solid pure white background only, isolated sticker icons, blank unbranded surfaces, no text.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSafeUiButtonStickerPrompt(handshake) {
  const concept = handshake?.concept || {};
  return [
    "Generate a 1x5 horizontal sticker sheet for original shop game controls.",
    "Use original icon props, original silhouettes, blank labels, and unbranded designs.",
    `Shop idea: ${concept.shopIdea || "custom shop"}`,
    "Need a single coherent 1x5 horizontal sprite sheet for floating shop control icons.",
    "Invisible grid layout: exactly 1 row and 5 columns, no drawn grid lines, no borders, no dividers.",
    "Five slots left to right: lobby entrance icon, collection book icon, favorites shelf icon, restart loop icon, trash bin icon.",
    "Every cell contains exactly one centered isolated icon-like object only.",
    "Use consistent scale, consistent camera angle, consistent lighting, and consistent asset quality across all five icons.",
    "Each icon must stay clearly inside its own cell and be slightly smaller than the cell bounds.",
    "Leave generous pure white padding around every icon and clear white gutters between neighboring cells.",
    "No icon should touch, overlap, cast a shadow into, or visually connect with another cell.",
    "Do not scatter objects organically; do not create a poster, collage, toolbar mockup, interface screenshot, or button UI frame.",
    "Blank unbranded surfaces, isolated icons, generous whitespace, no visible grid lines, no text.",
    "Warm handcrafted casual game sticker style, solid pure white background only.",
  ].join("\n\n");
}

function extractJsonBlock(text) {
  const trimmed = normalizeText(text);
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // ignore
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return null;
}

function findStringDeep(value, predicate) {
  if (!value) return null;
  if (typeof value === "string") {
    return predicate(value) ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringDeep(item, predicate);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findStringDeep(item, predicate);
      if (found) return found;
    }
  }
  return null;
}

function findValueByKeyDeep(value, targetKeys) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueByKeyDeep(item, targetKeys);
      if (found) return found;
    }
    return null;
  }
  for (const [key, item] of Object.entries(value)) {
    if (targetKeys.includes(key) && typeof item === "string" && item.trim()) {
      return item.trim();
    }
    const found = findValueByKeyDeep(item, targetKeys);
    if (found) return found;
  }
  return null;
}

function extractImageUrlFromOutput(stdout, stderr = "") {
  const combined = `${stdout || ""}\n${stderr || ""}`.trim();
  const parsed = extractJsonBlock(combined);
  const fromJson = findStringDeep(parsed, (value) => /^https?:\/\/\S+/i.test(value));
  if (fromJson) return fromJson;
  const matched = combined.match(/https?:\/\/\S+/i);
  return matched ? matched[0] : null;
}

function extractArtifactUuidFromOutput(stdout, stderr = "") {
  const combined = `${stdout || ""}\n${stderr || ""}`.trim();
  const parsed = extractJsonBlock(combined);
  const fromJson = findValueByKeyDeep(parsed, ["uuid", "artifact_uuid", "artifactUuid"]);
  if (fromJson) return fromJson;
  const matched = combined.match(/\b[a-f0-9]{8}-[a-f0-9-]{27,}\b/i);
  return matched ? matched[0] : null;
}

function isSilentTaskFailure(stdout = "", stderr = "") {
  const combined = `${stdout || ""}\n${stderr || ""}`.trim();
  if (!combined) return false;
  const parsed = extractJsonBlock(combined);
  if (!parsed || typeof parsed !== "object") return false;
  const taskStatus = normalizeText(parsed.task_status || parsed.taskStatus).toUpperCase();
  const artifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : null;
  return taskStatus === "FAILURE" && artifacts?.length === 0;
}

function isPromptComplianceError(...parts) {
  const combined = parts
    .filter(Boolean)
    .map((item) => String(item))
    .join("\n");
  return /(?:\b451\b|不合规文字|内容包含不合规|ApiResponseError)/i.test(combined);
}

function buildMakeImageArgs({ prompt, width, height, aspect }) {
  const args = ["-y", "@talesofai/neta-skills@latest", "make_image", "--prompt", prompt];
  if (aspect) {
    args.push("--aspect", aspect);
  }
  if (width) {
    args.push("--width", String(width));
  }
  if (height) {
    args.push("--height", String(height));
  }
  return args;
}

async function runNetaMakeImageOnce({ prompt, width, height, aspect }) {
  const args = buildMakeImageArgs({ prompt, width, height, aspect });
  let stdout;
  let stderr;
  try {
    assertNetaEnvTokenPresent();
    await mkdir(NETA_SKILL_CONFIG_DIR, { recursive: true });
    logNetaSkillIdentityOnce();
    const result = await execFileAsync("npx", args, {
      env: buildNetaSkillEnv(),
      maxBuffer: 16 * 1024 * 1024,
      timeout: NETA_IMAGE_TIMEOUT_MS,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    if (error?.killed && error?.signal === "SIGTERM") {
      throw new Error(`Neta make_image timed out after ${NETA_IMAGE_TIMEOUT_MS}ms`);
    }
    throw new Error(error?.stderr || error?.message || "Neta make_image failed");
  }
  const imageUrl = extractImageUrlFromOutput(stdout, stderr);
  const artifactUuid = extractArtifactUuidFromOutput(stdout, stderr);
  if (!imageUrl) {
    if (isSilentTaskFailure(stdout, stderr)) {
      throw new Error(`Neta make_image task failed without artifacts.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    throw new Error(`make_image did not return an image URL.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  return {
    imageUrl,
    artifactUuid,
    stdout,
    stderr,
  };
}

async function runNetaMakeImage({ prompt, promptVariants = [], width, height, aspect }) {
  const variants = [prompt, ...promptVariants]
    .flatMap((item) => {
      const normalized = normalizeText(item);
      if (!normalized) return [];
      const sanitized = sanitizeImagePromptForCompliance(normalized);
      return sanitized && sanitized !== normalized ? [normalized, sanitized] : [normalized];
    })
    .filter((item, index, array) => item && array.indexOf(item) === index);
  let lastError = null;

  for (let index = 0; index < variants.length; index += 1) {
    const variantPrompt = variants[index];
    try {
      if (index > 0) {
        console.warn(`[asset-pipeline] retry make_image with sanitized prompt variant #${index + 1}`);
      }
      return await runNetaMakeImageOnce({
        prompt: variantPrompt,
        width,
        height,
        aspect,
      });
    } catch (error) {
      lastError = error;
      const shouldRetry =
        isPromptComplianceError(error?.message || "") ||
        /task failed without artifacts/i.test(String(error?.message || ""));
      if (!shouldRetry || index === variants.length - 1) {
        throw error;
      }
      await sleep(IMAGE_RETRY_DELAY_MS);
    }
  }

  throw lastError || new Error("Neta make_image failed");
}

async function runNetaRemoveBackground(inputImageUuid) {
  if (!inputImageUuid) {
    throw new Error("Missing input artifact uuid for remove_background");
  }
  let stdout;
  let stderr;
  try {
    assertNetaEnvTokenPresent();
    await mkdir(NETA_SKILL_CONFIG_DIR, { recursive: true });
    logNetaSkillIdentityOnce();
    const result = await execFileAsync(
      "npx",
      ["-y", "@talesofai/neta-skills@latest", "remove_background", "--input_image", inputImageUuid],
      {
        env: buildNetaSkillEnv(),
        maxBuffer: 16 * 1024 * 1024,
        timeout: NETA_IMAGE_TIMEOUT_MS,
      },
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    if (error?.killed && error?.signal === "SIGTERM") {
      throw new Error(`Neta remove_background timed out after ${NETA_IMAGE_TIMEOUT_MS}ms`);
    }
    throw new Error(error?.stderr || error?.message || "Neta remove_background failed");
  }
  const imageUrl = extractImageUrlFromOutput(stdout, stderr);
  if (!imageUrl) {
    throw new Error(`remove_background did not return an image URL.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  return {
    imageUrl,
    stdout,
    stderr,
  };
}

async function downloadToFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const tempSourcePath = `${destinationPath}.source`;
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(tempSourcePath, buffer);
  try {
    await execFileAsync("/usr/bin/sips", ["-s", "format", "png", tempSourcePath, "--out", destinationPath], {
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`Failed to convert downloaded image to PNG: ${error.message}`);
  } finally {
    await rm(tempSourcePath, { force: true }).catch(() => {});
  }
}

async function normalizeImageToSize(sourcePath, destinationPath, width, height) {
  try {
    await execFileAsync(
      "/usr/bin/sips",
      ["-z", String(height), String(width), sourcePath, "--out", destinationPath],
      {
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  } catch (error) {
    throw new Error(`Failed to normalize image size to ${width}x${height}: ${error.message}`);
  }
}

async function fitImageContainToCanvas(sourcePath, destinationPath, width, height) {
  const source = await readPng(sourcePath);
  const widthRatio = width / source.width;
  const heightRatio = height / source.height;
  const limitingSize = widthRatio <= heightRatio ? width : height;
  const resizedTempPath = destinationPath.replace(/\.png$/i, "_contain-temp.png");

  try {
    await execFileAsync(
      "/usr/bin/sips",
      ["-Z", String(limitingSize), sourcePath, "--out", resizedTempPath],
      {
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  } catch (error) {
    throw new Error(`Failed to resize image with contain fit: ${error.message}`);
  }

  try {
    const resized = await readPng(resizedTempPath);
    const target = new PNG({ width, height });
    const offsetX = Math.max(0, Math.floor((width - resized.width) / 2));
    const offsetY = Math.max(0, Math.floor((height - resized.height) / 2));
    PNG.bitblt(
      resized,
      target,
      0,
      0,
      Math.min(resized.width, width),
      Math.min(resized.height, height),
      offsetX,
      offsetY,
    );
    await writePng(destinationPath, target);
  } finally {
    await rm(resizedTempPath, { force: true }).catch(() => {});
  }
}

async function readPng(filePath) {
  const buffer = await readFile(filePath);
  return PNG.sync.read(buffer);
}

async function writePng(filePath, png) {
  const buffer = PNG.sync.write(png);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
}

function getAlphaBounds(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(png.width * y + x) * 4 + 3];
      if (alpha === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function cropPngToBounds(source, bounds) {
  const target = new PNG({ width: bounds.width, height: bounds.height });
  PNG.bitblt(
    source,
    target,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
  );
  return target;
}

function trimPngToAlphaBounds(source) {
  const bounds = getAlphaBounds(source);
  if (!bounds) {
    return new PNG({ width: 1, height: 1 });
  }
  if (bounds.width === source.width && bounds.height === source.height && bounds.x === 0 && bounds.y === 0) {
    return source;
  }
  return cropPngToBounds(source, bounds);
}

async function trimImageToAlphaBounds(sourcePath, destinationPath) {
  const source = await readPng(sourcePath);
  const trimmed = trimPngToAlphaBounds(source);
  await writePng(destinationPath, trimmed);
  return {
    width: trimmed.width,
    height: trimmed.height,
  };
}

async function splitSheetToTiles({ sheetPath, outputDir, rows, cols, filenamePrefix = "item", trimTiles = true }) {
  const source = await readPng(sheetPath);
  if (source.width % cols !== 0 || source.height % rows !== 0) {
    throw new Error(
      `Sheet size ${source.width}x${source.height} is not divisible by grid ${rows}x${cols}`,
    );
  }

  const tileWidth = source.width / cols;
  const tileHeight = source.height / rows;
  const tiles = [];
  await mkdir(outputDir, { recursive: true });

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tile = new PNG({ width: tileWidth, height: tileHeight });
      PNG.bitblt(
        source,
        tile,
        col * tileWidth,
        row * tileHeight,
        tileWidth,
        tileHeight,
        0,
        0,
      );
      const outputTile = trimTiles ? trimPngToAlphaBounds(tile) : tile;
      const fileName = `${filenamePrefix}_${row + 1}_${col + 1}.png`;
      const filePath = path.join(outputDir, fileName);
      await writePng(filePath, outputTile);
      tiles.push({
        id: `${filenamePrefix}_${row + 1}_${col + 1}`,
        fileName,
        row: row + 1,
        col: col + 1,
        width: outputTile.width,
        height: outputTile.height,
      });
    }
  }

  return {
    width: source.width,
    height: source.height,
    tileWidth,
    tileHeight,
    tiles,
  };
}

async function writeTileManifest({ manifestPath, jobId, sheetPath, tileBaseUrl, splitResult, slotPlan = [] }) {
  const tiles = splitResult.tiles.map((tile, index) => {
    const slot = slotPlan[index] || {};
    return {
      ...tile,
      url: `${tileBaseUrl}/${tile.fileName}`,
      itemId: slot.itemId || null,
      chainId: slot.chainId || null,
      chainLabel: slot.chainLabel || null,
      tier: slot.tier || null,
      name: slot.name || null,
      description: slot.description || null,
    };
  });

  const manifest = {
    version: 1,
    jobId,
    generatedAt: new Date().toISOString(),
    sheet: {
      path: sheetPath,
      width: splitResult.width,
      height: splitResult.height,
    },
    grid: {
      rows: splitResult.height / splitResult.tileHeight,
      cols: splitResult.width / splitResult.tileWidth,
      tileWidth: splitResult.tileWidth,
      tileHeight: splitResult.tileHeight,
    },
    tileBaseUrl,
    tiles,
    bindings: tiles.reduce((accumulator, tile) => {
      if (!tile.itemId) return accumulator;
      accumulator[tile.itemId] = {
        fileName: tile.fileName,
        url: tile.url,
        row: tile.row,
        col: tile.col,
        chainId: tile.chainId,
        chainLabel: tile.chainLabel,
        tier: tile.tier,
        name: tile.name,
        description: tile.description,
      };
      return accumulator;
    }, {}),
  };
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

async function writeStickerManifest({ manifestPath, jobId, sheetPath, baseUrl, splitResult, stickerDefinitions }) {
  const stickers = splitResult.tiles.map((tile, index) => {
    const definition = stickerDefinitions[index] || {};
    return {
      ...tile,
      id: definition.id || tile.id,
      role: definition.role || definition.id || tile.id,
      label: definition.label || definition.id || tile.id,
      defaultLeft: definition.defaultLeft ?? null,
      defaultTop: definition.defaultTop ?? null,
      defaultWidth: definition.defaultWidth ?? null,
      url: `${baseUrl}/${tile.fileName}`,
    };
  });

  const manifest = {
    version: 1,
    jobId,
    generatedAt: new Date().toISOString(),
    sheet: {
      path: sheetPath,
      width: splitResult.width,
      height: splitResult.height,
    },
    grid: {
      rows: splitResult.height / splitResult.tileHeight,
      cols: splitResult.width / splitResult.tileWidth,
      tileWidth: splitResult.tileWidth,
      tileHeight: splitResult.tileHeight,
    },
    baseUrl,
    stickers,
    bindings: stickers.reduce((accumulator, sticker) => {
      accumulator[sticker.id] = sticker;
      if (sticker.role) accumulator[sticker.role] = sticker;
      return accumulator;
    }, {}),
  };
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

async function generateStickerSheet({ handshake, fileId, prompt, promptVariants, width, height, aspect }) {
  const outputSlots = handshake?.assets?.outputSlots || {};
  const sheetFile = outputSlots.requiredFiles?.find((item) => item.id === fileId);
  if (!sheetFile?.path) {
    throw new Error(`Missing ${fileId} output path in handshake`);
  }
  console.log("[asset-pipeline] make_image:start", {
    asset: fileId,
    width,
    height,
    aspect: aspect || null,
  });
  const generation = await runNetaMakeImage({ prompt, promptVariants, width, height, aspect });
  const rawOutputPath = sheetFile.path.replace(/\.png$/i, "_raw.png");
  await downloadToFile(generation.imageUrl, rawOutputPath);
  const cutout = await runNetaRemoveBackground(generation.artifactUuid);
  const cutoutOutputPath = sheetFile.path.replace(/\.png$/i, "_cutout.png");
  await downloadToFile(cutout.imageUrl, cutoutOutputPath);
  await fitImageContainToCanvas(cutoutOutputPath, sheetFile.path, width, height);
  return {
    imageUrl: cutout.imageUrl,
    rawOutputPath,
    cutoutOutputPath,
    outputPath: sheetFile.path,
    stdout: generation.stdout,
  };
}

export async function generateShopSheetAssets(handshake) {
  const outputSlots = handshake?.assets?.outputSlots || {};
  const shopSheetFile = outputSlots.requiredFiles?.find((item) => item.id === "shop_sheet_4x8");
  if (!shopSheetFile?.path) {
    throw new Error("Missing shop_sheet_4x8 output path in handshake");
  }
  console.log("[asset-pipeline] make_image:start", {
    asset: "shop_sheet_4x8",
    width: 1536,
    height: 768,
    aspect: null,
  });
  const generation = await runNetaMakeImage({
    prompt: buildShopSheetPrompt(handshake),
    promptVariants: [buildSafeShopSheetPrompt(handshake)],
    width: 1536,
    height: 768,
  });
  const rawOutputPath = shopSheetFile.path.replace(/\.png$/i, "_raw.png");
  await downloadToFile(generation.imageUrl, rawOutputPath);
  const cutout = await runNetaRemoveBackground(generation.artifactUuid);
  const cutoutOutputPath = shopSheetFile.path.replace(/\.png$/i, "_cutout.png");
  await downloadToFile(cutout.imageUrl, cutoutOutputPath);
  const trimmedCutoutPath = shopSheetFile.path.replace(/\.png$/i, "_trimmed.png");
  await trimImageToAlphaBounds(cutoutOutputPath, trimmedCutoutPath);
  await normalizeImageToSize(trimmedCutoutPath, shopSheetFile.path, 1536, 768);
  return {
    imageUrl: cutout.imageUrl,
    rawOutputPath,
    cutoutOutputPath,
    trimmedCutoutPath,
    outputPath: shopSheetFile.path,
    stdout: generation.stdout,
  };
}

export async function generateAssistantPortraitAsset(handshake) {
  const outputSlots = handshake?.assets?.outputSlots || {};
  const portraitSheetFile = outputSlots.requiredFiles?.find(
    (item) => item.id === "assistant_sheet_2x2" || item.id === "assistant_sheet_1x4",
  );
  const portraitManifestFile = outputSlots.requiredFiles?.find((item) => item.id === "assistant_manifest");
  if (!portraitSheetFile?.path || !portraitManifestFile?.path) {
    throw new Error("Missing assistant portrait output paths in handshake");
  }
  console.log("[asset-pipeline] make_image:start", {
    asset: "assistant_sheet_2x2",
    width: 1600,
    height: 900,
    aspect: "16:9",
  });
  const generation = await runNetaMakeImage({
    prompt: buildAssistantPrompt(handshake),
    promptVariants: [buildSafeAssistantPrompt(handshake)],
    width: 1600,
    height: 900,
    aspect: "16:9",
  });
  const rawOutputPath = portraitSheetFile.path.replace(/\.png$/i, "_raw.png");
  await downloadToFile(generation.imageUrl, rawOutputPath);
  const cutout = await runNetaRemoveBackground(generation.artifactUuid);
  const cutoutOutputPath = portraitSheetFile.path.replace(/\.png$/i, "_cutout.png");
  await downloadToFile(cutout.imageUrl, cutoutOutputPath);
  await fitImageContainToCanvas(cutoutOutputPath, portraitSheetFile.path, 1600, 900);

  const splitResult = await splitSheetToTiles({
    sheetPath: portraitSheetFile.path,
    outputDir: outputSlots.portraitOutputDir,
    rows: 2,
    cols: 2,
    filenamePrefix: "expression",
    trimTiles: true,
  });

  const portraitFiles = {
    smile: path.join(outputSlots.portraitOutputDir, "smile.png"),
    serious: path.join(outputSlots.portraitOutputDir, "serious.png"),
    angry: path.join(outputSlots.portraitOutputDir, "angry.png"),
    confused: path.join(outputSlots.portraitOutputDir, "confused.png"),
  };
  const generatedFiles = [
    path.join(outputSlots.portraitOutputDir, "expression_1_1.png"),
    path.join(outputSlots.portraitOutputDir, "expression_1_2.png"),
    path.join(outputSlots.portraitOutputDir, "expression_2_1.png"),
    path.join(outputSlots.portraitOutputDir, "expression_2_2.png"),
  ];
  const orderedKeys = ["smile", "serious", "angry", "confused"];
  await Promise.all(
    orderedKeys.map(async (key, index) => {
      const sourcePath = generatedFiles[index];
      const destinationPath = portraitFiles[key];
      const png = await readPng(sourcePath);
      await writePng(destinationPath, png);
      if (sourcePath !== destinationPath) {
        await rm(sourcePath, { force: true });
      }
    }),
  );

  const portraitBaseUrl = `/generated/build-artifacts/${handshake.job.jobId}/assistant_portraits`;
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sheet: {
      path: portraitSheetFile.path,
      width: splitResult.width,
      height: splitResult.height,
    },
    order: orderedKeys,
    portraits: orderedKeys.reduce((accumulator, key) => {
      accumulator[key] = {
        fileName: `${key}.png`,
        url: `${portraitBaseUrl}/${key}.png`,
      };
      return accumulator;
    }, {}),
  };
  await writeFile(portraitManifestFile.path, JSON.stringify(manifest, null, 2), "utf8");
  return {
    imageUrl: cutout.imageUrl,
    rawOutputPath,
    cutoutOutputPath,
    trimmedOutputPath: null,
    outputPath: portraitSheetFile.path,
    manifestPath: portraitManifestFile.path,
    portraitBaseUrl,
    portraitUrls: orderedKeys.reduce((accumulator, key) => {
      accumulator[key] = `${portraitBaseUrl}/${key}.png`;
      return accumulator;
    }, {}),
    stdout: generation.stdout,
  };
}

export async function generateShopDecorStickerAssets(handshake) {
  return generateStickerSheet({
    handshake,
    fileId: "shop_decor_stickers_2x3",
    prompt: buildShopDecorStickerPrompt(handshake),
    promptVariants: [buildSafeShopDecorStickerPrompt(handshake)],
    width: 1536,
    height: 1024,
  });
}

export async function generateUiButtonStickerAssets(handshake) {
  return generateStickerSheet({
    handshake,
    fileId: "ui_button_stickers_1x5",
    prompt: buildUiButtonStickerPrompt(handshake),
    promptVariants: [buildSafeUiButtonStickerPrompt(handshake)],
    width: 1600,
    height: 320,
  });
}

export async function splitGeneratedShopDecorStickers(handshake) {
  const outputSlots = handshake?.assets?.outputSlots || {};
  const generationPlan = handshake?.assets?.generationPlan || {};
  const sheetFile = outputSlots.requiredFiles?.find((item) => item.id === "shop_decor_stickers_2x3");
  const manifestFile = outputSlots.requiredFiles?.find((item) => item.id === "shop_decor_manifest");
  if (!sheetFile?.path || !manifestFile?.path || !outputSlots.decorOutputDir) {
    throw new Error("Missing shop decoration output configuration in handshake");
  }
  const rows = Number(generationPlan?.decorSplit?.rows || 2);
  const cols = Number(generationPlan?.decorSplit?.cols || 3);
  const splitResult = await splitSheetToTiles({
    sheetPath: sheetFile.path,
    outputDir: outputSlots.decorOutputDir,
    rows,
    cols,
    filenamePrefix: "decor",
  });
  const baseUrl = `/generated/build-artifacts/${handshake.job.jobId}/shop_decorations`;
  const definitions = [
    { id: "decor-1", label: "店面装饰 1", defaultLeft: 5.8, defaultTop: 70.5, defaultWidth: 104 },
    { id: "decor-2", label: "店面装饰 2", defaultLeft: 15.8, defaultTop: 70.5, defaultWidth: 104 },
    { id: "decor-3", label: "店面装饰 3", defaultLeft: 25.8, defaultTop: 70.5, defaultWidth: 104 },
    { id: "decor-4", label: "店面装饰 4", defaultLeft: 5.8, defaultTop: 84.2, defaultWidth: 104 },
    { id: "decor-5", label: "店面装饰 5", defaultLeft: 15.8, defaultTop: 84.2, defaultWidth: 104 },
    { id: "decor-6", label: "店面装饰 6", defaultLeft: 25.8, defaultTop: 84.2, defaultWidth: 104 },
  ];
  const manifest = await writeStickerManifest({
    manifestPath: manifestFile.path,
    jobId: handshake.job.jobId,
    sheetPath: sheetFile.path,
    baseUrl,
    splitResult,
    stickerDefinitions: definitions,
  });
  return {
    manifest,
    baseUrl,
    stickerCount: splitResult.tiles.length,
  };
}

export async function splitGeneratedUiButtonStickers(handshake) {
  const outputSlots = handshake?.assets?.outputSlots || {};
  const generationPlan = handshake?.assets?.generationPlan || {};
  const sheetFile = outputSlots.requiredFiles?.find((item) => item.id === "ui_button_stickers_1x5");
  const manifestFile = outputSlots.requiredFiles?.find((item) => item.id === "ui_button_manifest");
  if (!sheetFile?.path || !manifestFile?.path || !outputSlots.uiButtonOutputDir) {
    throw new Error("Missing UI button output configuration in handshake");
  }
  const rows = Number(generationPlan?.uiButtonSplit?.rows || 1);
  const cols = Number(generationPlan?.uiButtonSplit?.cols || 5);
  const splitResult = await splitSheetToTiles({
    sheetPath: sheetFile.path,
    outputDir: outputSlots.uiButtonOutputDir,
    rows,
    cols,
    filenamePrefix: "button",
  });
  const baseUrl = `/generated/build-artifacts/${handshake.job.jobId}/ui_buttons`;
  const definitions = [
    { id: "hall", role: "hall", label: "大厅" },
    { id: "codex", role: "codex", label: "图鉴" },
    { id: "shelf", role: "shelf", label: "收藏" },
    { id: "reset", role: "reset", label: "重开" },
    { id: "trash", role: "trash", label: "垃圾桶" },
  ];
  const manifest = await writeStickerManifest({
    manifestPath: manifestFile.path,
    jobId: handshake.job.jobId,
    sheetPath: sheetFile.path,
    baseUrl,
    splitResult,
    stickerDefinitions: definitions,
  });
  return {
    manifest,
    baseUrl,
    stickerCount: splitResult.tiles.length,
  };
}

export async function splitGeneratedShopSheet(handshake) {
  const outputSlots = handshake?.assets?.outputSlots || {};
  const generationPlan = handshake?.assets?.generationPlan || {};
  const shopSheetFile = outputSlots.requiredFiles?.find((item) => item.id === "shop_sheet_4x8");
  const manifestFile = outputSlots.requiredFiles?.find((item) => item.id === "tile_manifest");
  if (!shopSheetFile?.path || !manifestFile?.path || !outputSlots.tileOutputDir) {
    throw new Error("Missing tile output configuration in handshake");
  }

  const rows = Number(generationPlan?.tileSplit?.rows || 4);
  const cols = Number(generationPlan?.tileSplit?.cols || 8);
  const slotPlan = buildSheetSlotPlan(handshake);
  const splitResult = await splitSheetToTiles({
    sheetPath: shopSheetFile.path,
    outputDir: outputSlots.tileOutputDir,
    rows,
    cols,
    filenamePrefix: "item",
  });

  const tileBaseUrl = `/generated/build-artifacts/${handshake.job.jobId}/tiles`;
  const manifest = await writeTileManifest({
    manifestPath: manifestFile.path,
    jobId: handshake.job.jobId,
    sheetPath: shopSheetFile.path,
    tileBaseUrl,
    splitResult,
    slotPlan,
  });

  return {
    manifest,
    tileBaseUrl,
    tileCount: splitResult.tiles.length,
  };
}

export function buildGeneratedRuntimeConfig(handshake) {
  const jobId = handshake?.job?.jobId;
  const tileBaseUrl = `/generated/build-artifacts/${jobId}/tiles`;
  const portraitBaseUrl = `/generated/build-artifacts/${jobId}/assistant_portraits`;
  return {
    tileAssetBase: tileBaseUrl,
    assistantPortraits: {
      smile: `${portraitBaseUrl}/smile.png`,
      serious: `${portraitBaseUrl}/serious.png`,
      angry: `${portraitBaseUrl}/angry.png`,
      confused: `${portraitBaseUrl}/confused.png`,
    },
    decorationManifestUrl: `/generated/build-artifacts/${jobId}/shop_decorations/manifest.json`,
    uiButtonManifestUrl: `/generated/build-artifacts/${jobId}/ui_buttons/manifest.json`,
  };
}
