import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PNG } from "pngjs";

const execFileAsync = promisify(execFile);
const NETA_IMAGE_TIMEOUT_MS = Number(process.env.NETA_IMAGE_TIMEOUT_MS || 300_000);
const IMAGE_RETRY_DELAY_MS = Number(process.env.NETA_IMAGE_RETRY_DELAY_MS || 900);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
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

function buildShopSheetPrompt(handshake) {
  const concept = handshake?.concept || {};
  const prompt = handshake?.prompts?.shopSheet || "";
  const slotPlan = buildSheetSlotPlan(handshake);
  const slotLines = slotPlan.map(
    (slot) =>
      `R${slot.row}C${slot.col} | ${slot.itemId} | ${slot.name} | ${slot.description || "no extra description"}`,
  );
  return [
    prompt,
    `World: ${concept.worldName || "Unknown World"}`,
    `Shop idea: ${concept.shopIdea || ""}`,
    `Shop name: ${concept.shopName || ""}`,
    `Shop summary: ${concept.summary || ""}`,
    `Loop summary: ${concept.loopSummary || ""}`,
    "Need a single coherent 4x8 sprite sheet for merge gameplay props.",
    "Every tile slot must match the requested item exactly. Do not reorder, omit, merge, or substitute slots.",
    "Tile slot plan, left to right and top to bottom:",
    ...slotLines,
    "Solid pure white background only, isolated props, consistent magical shop style, no text.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSafeShopSheetPrompt(handshake) {
  const slotPlan = buildSheetSlotPlan(handshake);
  const slotLines = slotPlan.map((slot) => {
    const chainDescriptorMap = {
      botanical: "original base shop prop",
      alchemy: "original processed shop prop",
      curio: "original themed accent shop prop",
      waste: "failed crafting residue",
      secret: "rare original hidden shop reward",
    };
    const descriptor = chainDescriptorMap[slot.chainId] || "original fantasy prop";
    return `R${slot.row}C${slot.col} | ${slot.itemId} | ${descriptor} | tier ${slot.tier}`;
  });

  return [
    "Generate a single sprite sheet for an original themed shop merge game.",
    "Do not reference any existing franchise, trademark, copyrighted character, branded location, or protected product design.",
    "Need a single coherent 4x8 sprite sheet for merge gameplay props.",
    "Every tile slot must match the requested itemId exactly. Do not reorder, omit, merge, or substitute slots.",
    "Tile slot plan, left to right and top to bottom:",
    ...slotLines,
    "Visual style: warm, handcrafted, whimsical fantasy shop props.",
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
    "One 16:9 sheet, 4 expressions in one horizontal row.",
    "Left to right order must be: smile, serious, angry, confused.",
    "Half-body portrait framing only, fully visible character in each panel.",
    "Same character design in all four panels, solid pure white background only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSafeAssistantPrompt(handshake) {
  const concept = handshake?.concept || {};
  const roleText = normalizeText(concept.assistantRole) || "shop assistant";
  const summaryText = normalizeText(concept.assistantSummary) || "smart, reliable, warm helper";
  return [
    "Design an original fantasy shop assistant character for a web game.",
    "Do not reference any existing franchise, trademark, copyrighted character, school, or branded world.",
    `Role focus: ${roleText}`,
    `Personality summary: ${summaryText}`,
    "Young original assistant, clever expression, readable silhouette, game-friendly design.",
    "One 16:9 sheet, 4 expressions in one horizontal row.",
    "Left to right order must be: smile, serious, angry, confused.",
    "Half-body portrait framing only, fully visible character in each panel.",
    "Same character design in all four panels, solid pure white background only.",
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
    const result = await execFileAsync("npx", args, {
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
  const variants = [prompt, ...promptVariants].filter((item, index, array) => item && array.indexOf(item) === index);
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
      const shouldRetry = isPromptComplianceError(error?.message || "");
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
    const result = await execFileAsync(
      "npx",
      ["-y", "@talesofai/neta-skills@latest", "remove_background", "--input_image", inputImageUuid],
      {
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

export async function generateShopSheetAssets(handshake) {
  const outputSlots = handshake?.assets?.outputSlots || {};
  const shopSheetFile = outputSlots.requiredFiles?.find((item) => item.id === "shop_sheet_4x8");
  if (!shopSheetFile?.path) {
    throw new Error("Missing shop_sheet_4x8 output path in handshake");
  }
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
  const portraitSheetFile = outputSlots.requiredFiles?.find((item) => item.id === "assistant_sheet_1x4");
  const portraitManifestFile = outputSlots.requiredFiles?.find((item) => item.id === "assistant_manifest");
  if (!portraitSheetFile?.path || !portraitManifestFile?.path) {
    throw new Error("Missing assistant portrait output paths in handshake");
  }
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
  const trimmedOutputPath = portraitSheetFile.path.replace(/\.png$/i, "_trimmed.png");
  await trimImageToAlphaBounds(cutoutOutputPath, trimmedOutputPath);
  await fitImageContainToCanvas(trimmedOutputPath, portraitSheetFile.path, 1600, 900);

  const splitResult = await splitSheetToTiles({
    sheetPath: portraitSheetFile.path,
    outputDir: outputSlots.portraitOutputDir,
    rows: 1,
    cols: 4,
    filenamePrefix: "expression",
    trimTiles: false,
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
    path.join(outputSlots.portraitOutputDir, "expression_1_3.png"),
    path.join(outputSlots.portraitOutputDir, "expression_1_4.png"),
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
    trimmedOutputPath,
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
  };
}
