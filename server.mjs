import { createServer } from "node:http";
import { appendFile, readFile, writeFile, mkdir, stat, rm, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.dirname(__filename);
const GENERATED_DIR = path.join(PROJECT_ROOT, "generated");
const SESSION_FILE = path.join(GENERATED_DIR, "current-session.json");
const SERVER_LOG_FILE = path.join(GENERATED_DIR, "server.log");
const LAST_AGENT_HANDSHAKE_FILE = path.join(GENERATED_DIR, "last-agent-handshake.json");
const LOCAL_AGENT_JOBS_DIR = path.join(GENERATED_DIR, "local-agent-jobs");
const BUILD_ARTIFACTS_DIR = path.join(GENERATED_DIR, "build-artifacts");
const PROFILE_ROOT = path.join(PROJECT_ROOT, "builder", "skills", "shop-builder");
const PORT = Number(process.env.PORT || 9999);
const HOST = process.env.HOST || "localhost";
const WORLD_NAME = process.env.WORLD_NAME || "你的世界";
const TILE_ASSET_BASE = "/Downloads/magic_assets_tiles_4x8_trimmed";
const ASSISTANT_ASSET_BASE = "/Downloads/hermione_emotions_tiles_1x4_trimmed";
const REMOTE_LLM_TIMEOUT_MS = Number(process.env.NETA_LLM_TIMEOUT_MS || 45_000);
const CONTENT_PACK_LLM_TIMEOUT_MS = Number(process.env.NETA_LLM_CONTENT_PACK_TIMEOUT_MS || 120_000);
const CONTENT_PACK_SECTION_TIMEOUT_MS = Number(process.env.NETA_LLM_CONTENT_PACK_SECTION_TIMEOUT_MS || 75_000);
const CONTENT_PACK_LLM_MODEL = process.env.NETA_LLM_CONTENT_PACK_MODEL || "qwen3.5-flash-no-think";
const REMOTE_LLM_RETRY_COUNT = Number(process.env.NETA_LLM_RETRY_COUNT || 3);
const REMOTE_LLM_RETRY_BASE_MS = Number(process.env.NETA_LLM_RETRY_BASE_MS || 1200);
const SHOP_AGENT_PROVIDER = process.env.SHOP_AGENT_PROVIDER || "local-codex";
const SHOP_AGENT_REMOTE_BASE_URL = process.env.SHOP_AGENT_BASE_URL || "";
const SHOP_AGENT_REMOTE_TIMEOUT_MS = Number(process.env.SHOP_AGENT_REMOTE_TIMEOUT_MS || 180_000);
const ALLOW_LLM_FALLBACK = process.env.NETA_LLM_ALLOW_FALLBACK === "1";
let completionCounter = 0;
const OUTBOUND_PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
const OUTBOUND_PROXY = OUTBOUND_PROXY_URL ? new ProxyAgent(OUTBOUND_PROXY_URL) : null;

const jobs = new Map();

await mkdir(GENERATED_DIR, { recursive: true });
await mkdir(LOCAL_AGENT_JOBS_DIR, { recursive: true });
await mkdir(BUILD_ARTIFACTS_DIR, { recursive: true });

function formatLogChunk(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function writeServerLog(level, ...args) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(formatLogChunk).join(" ")}\n`;
  appendFile(SERVER_LOG_FILE, line, "utf8").catch(() => {});
}

function llmLog(...args) {
  console.log(...args);
  writeServerLog("INFO", ...args);
}

function llmWarn(...args) {
  console.warn(...args);
  writeServerLog("WARN", ...args);
}

function llmError(...args) {
  console.error(...args);
  writeServerLog("ERROR", ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientLlmNetworkError(error) {
  const message = String(error?.message || "");
  const causeCode = error?.cause?.code || "";
  return (
    /fetch failed/i.test(message) ||
    /ECONNRESET/i.test(message) ||
    /Client network socket disconnected/i.test(message) ||
    /UND_ERR_/i.test(message) ||
    causeCode === "ECONNRESET"
  );
}

function isRetryableLlmStatus(status) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

function appLog(level, ...args) {
  if (level === "ERROR") {
    console.error(...args);
  } else if (level === "WARN") {
    console.warn(...args);
  } else {
    console.log(...args);
  }
  writeServerLog(level, ...args);
}

const builderProfile = JSON.parse(
  await readFile(path.join(PROFILE_ROOT, "profile.json"), "utf8"),
);
const builderPrompts = {
  concept: await readFile(path.join(PROFILE_ROOT, "prompt_concept.md"), "utf8"),
  shopSheet: await readFile(path.join(PROFILE_ROOT, "prompt_shop_sheet.md"), "utf8"),
  assistant: await readFile(path.join(PROFILE_ROOT, "prompt_assistant.md"), "utf8"),
  worldPatch: await readFile(path.join(PROFILE_ROOT, "prompt_world_patch.md"), "utf8"),
};

function buildStaticContentPack(concept = {}) {
  const shopName = concept.shopName || "这家店";
  const assistantName = concept.assistantName || "店员助手";
  return {
    sources: [
      {
        id: "botanical",
        name: `${shopName}进货台`,
        shortLabel: "进货",
        blurb: "会稳定补进基础货，适合先铺开第一条经营线。",
      },
      {
        id: "alchemy",
        name: `${shopName}加工台`,
        shortLabel: "加工",
        blurb: "会产出处理中段货，适合把成品线继续往上推。",
      },
      {
        id: "curio",
        name: `${shopName}包装台`,
        shortLabel: "包装",
        blurb: "会带来风味更强的小货与包装件，也更容易出惊喜。",
      },
    ],
    clients: [
      { name: "清单客", role: "急单来客", requestFlavor: "要一件马上能交付的小货，最好别太复杂。" },
      { name: "挑剔客", role: "慢看型客人", requestFlavor: "想要更像样一点的货，不愿意拿最基础的版本。" },
      { name: "收藏客", role: "陈列爱好者", requestFlavor: "更看重稀有感和故事感，愿意等一件更特别的货。" },
      { name: "回头客", role: "固定客户", requestFlavor: "对这家店已经有预期，希望拿到稳定可靠的货。" },
      { name: "顺路客", role: "临时采购者", requestFlavor: "只是路过，但如果货够亮眼，也愿意多买一点。" },
    ],
    chains: [
      {
        id: "botanical",
        label: "基础货线",
        items: [
          { name: "基础小件", description: "最先补进来的基础货，适合开局铺盘。" },
          { name: "成形小件", description: "已经开始成型，能继续往上推进。" },
          { name: "进阶小件", description: "比基础货更完整，适合做第一批订单。" },
          { name: "成套货件", description: "已经接近可直接售卖的阶段。" },
          { name: "精选货件", description: "品质稳定，能拉高整条货线价值。" },
          { name: "招牌成货", description: "这一线的高阶成货，摆出来就很像样。" },
        ],
      },
      {
        id: "alchemy",
        label: "加工货线",
        items: [
          { name: "半成品件", description: "适合作为加工线起点。" },
          { name: "初配件", description: "已经带有第一层处理痕迹。" },
          { name: "定型件", description: "结构更稳定，价值也更高。" },
          { name: "高配件", description: "适合拿去做中高阶委托。" },
          { name: "精炼件", description: "再往上一点，就有稀有货的味道了。" },
          { name: "完成成品", description: "这条加工线已经被你推到了高点。" },
        ],
      },
      {
        id: "curio",
        label: "风味货线",
        items: [
          { name: "风味小物", description: "风格感最强的一条线，从小件开始。" },
          { name: "特色件", description: "已经开始有点值得细看了。" },
          { name: "亮眼件", description: "风格更完整，也更容易引起注意。" },
          { name: "精选件", description: "适合抬高店面的风格感。" },
          { name: "收藏件", description: "已经很像值得收藏的货。" },
          { name: "镇店特色", description: "放出来就能代表这家店气质的成货。" },
        ],
      },
      {
        id: "waste",
        label: "废料事故",
        items: [
          { name: "碎渣", description: "试配失败后留下的残渣。" },
          { name: "废团", description: "看得出做坏了，但还能认出一点原料。" },
          { name: "黏块", description: "已经很难分辨最初是什么。" },
          { name: "焦壳", description: "失败得更彻底，最好别久留。" },
          { name: "坏核", description: "只适合尽快清掉，别占格子。" },
          { name: "封存废瓶", description: "已经坏到可以当反面教材了。" },
        ],
      },
      {
        id: "secret",
        label: "隐藏货线",
        items: [
          { name: "隐藏样件", description: "说明这次试配终于走对了方向。" },
          { name: "隐藏小件", description: "已经明显比常规货更值钱。" },
          { name: "隐藏成件", description: "开始带出隐藏货线的价值感。" },
          { name: "隐藏珍件", description: "能明显拉高订单回报。" },
          { name: "隐藏馆藏", description: "已经接近值得陈列的阶段。" },
          { name: "隐藏珍藏", description: "拿来冲收藏和高价委托都很合适。" },
          { name: "隐藏臻品", description: "属于会让玩家记住的稀有货。" },
          { name: "隐藏终品", description: "这条隐藏线的顶级成货。" },
        ],
      },
    ],
    recipes: [
      {
        ingredients: ["botanical-2", "alchemy-2"],
        resultItemId: "secret-1",
        title: "试配命中",
        body: "原料线和加工线第一次对上，稳定做出了一件隐藏货。",
      },
      {
        ingredients: ["botanical-3", "curio-3"],
        resultItemId: "secret-2",
        title: "风格命中",
        body: "中阶原料和摆件线扣在一起，开出了更像样的秘方货。",
      },
      {
        ingredients: ["alchemy-4", "curio-4"],
        resultItemId: "secret-4",
        title: "高阶命中",
        body: "高阶加工货和风味货碰在一起，终于炸出了真正稀有的结果。",
      },
    ],
    blessings: [
      {
        id: "greenhouse",
        title: "进货台供货旺盛",
        description: "今天更容易直接拿到高一级的基础原料。",
        tags: ["原料补货更强", "开局更顺"],
      },
      {
        id: "cauldron",
        title: "加工台状态正热",
        description: "今天加工线更容易出现额外升级。",
        tags: ["加工更顺", "跳级概率提升"],
      },
      {
        id: "owl",
        title: "包装台额外回货",
        description: "今天风味线更容易额外多给一件货，交单后也常返补货次数。",
        tags: ["惊喜更多", "返货更频繁"],
      },
    ],
    introSequence: [
      { speaker: "旁白", text: `世界还在建设，${shopName}会先成为资源和需求汇流的第一站。` },
      { speaker: "旁白", text: "这里会不断接到零散但持续的小需求，适合用经营循环把世界慢慢跑起来。" },
      { speaker: assistantName, text: "我会先帮你盯订单、补给和今天的重点，把店面的节奏先带稳。" },
      { speaker: "旁白", text: "先补第一批货，再做出第一单。只要能顺利开张，这家店就能继续无尽经营下去。" },
    ],
  };
}

function getChainById(contentPack, chainId) {
  return (Array.isArray(contentPack?.chains) ? contentPack.chains : []).find((chain) => chain.id === chainId) || null;
}

function clipText(value = "", maxChars = 72) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function buildContentPackContextLines(input = {}, concept = {}, options = {}) {
  const { includeSummary = false, summaryMaxChars = 72 } = options;
  const lines = [
    `World: ${input.worldName || concept.worldName || WORLD_NAME}`,
    `Shop idea: ${concept.shopIdea || ""}`,
    `Shop name: ${concept.shopName || ""}`,
    `Assistant name: ${concept.assistantName || ""}`,
    `Assistant role: ${concept.assistantRole || ""}`,
  ];
  if (includeSummary) {
    const shortSummary = clipText(concept.summary || "", summaryMaxChars);
    if (shortSummary) {
      lines.push(`Shop summary short: ${shortSummary}`);
    }
  }
  return lines;
}

function buildMetaContentPackPrompt(input = {}, concept = {}) {
  return [
    "You are designing the short text layer for a merge shop game.",
    "Return minified JSON only.",
    "Use simplified Chinese strings.",
    "Keep every string short, practical, and theme-first.",
    "Do not include reasoning, markdown, or explanations.",
    ...buildContentPackContextLines(input, concept),
    "Return this JSON shape exactly:",
    "sources[{id,name,shortLabel,blurb}]",
    "clients[{name,role,requestFlavor}]",
    "blessings[{id,title,description,tags}]",
    "introSequence[{speaker,text}]",
    "Hard constraints:",
    "sources ids fixed and count fixed at 3: botanical, alchemy, curio",
    "These ids are internal only. They do NOT mean plants, potions, or curios.",
    "The three sources should read like three concrete shop-facing stations that fit the chosen business theme.",
    "clients count fixed: 5",
    "blessings ids fixed and count fixed at 3: greenhouse, cauldron, owl",
    "introSequence count fixed: 4",
    "All visible names and descriptions must prioritize the user's shop theme first.",
    "The world setting is only flavor overlay and story framing.",
    "No markdown fences. No explanation.",
  ].join("\n");
}

function buildCoreChainsPrompt(input = {}, concept = {}) {
  return [
    "You are designing the main merchandise chains for a merge shop game.",
    "Return minified JSON only.",
    "Use simplified Chinese strings.",
    "Keep every item name and description short and concrete.",
    "Do not include reasoning, markdown, or explanations.",
    ...buildContentPackContextLines(input, concept, { includeSummary: true, summaryMaxChars: 80 }),
    "Return this JSON shape exactly:",
    "chains[{id,label,items:[{name,description}]}]",
    "Hard constraints:",
    "Return exactly 3 chains: botanical, alchemy, curio",
    "botanical=6 items, alchemy=6 items, curio=6 items",
    "These ids are internal only. They do NOT mean plants, potions, or curios.",
    "All visible names must prioritize the user's shop theme first.",
    "The 18 items should be tangible, shop-relevant assets for this theme.",
    "No markdown fences. No explanation.",
  ].join("\n");
}

function buildSpecialChainsPrompt(input = {}, concept = {}) {
  return [
    "You are designing the special result chains for a merge shop game.",
    "Return minified JSON only.",
    "Use simplified Chinese strings.",
    "Keep every item name and description short and concrete.",
    "Do not include reasoning, markdown, or explanations.",
    ...buildContentPackContextLines(input, concept, { includeSummary: true, summaryMaxChars: 80 }),
    "Return this JSON shape exactly:",
    "chains[{id,label,items:[{name,description}]}]",
    "recipes[{ingredients,resultItemId,title,body}]",
    "Hard constraints:",
    "Return exactly 2 chains: waste, secret",
    "waste=6 items, secret=8 items",
    "recipes fixed exactly 3:",
    "1) botanical-2 + alchemy-2 -> secret-1",
    "2) botanical-3 + curio-3 -> secret-2",
    "3) alchemy-4 + curio-4 -> secret-4",
    "Waste items should feel like failed outputs for this shop theme.",
    "Secret items should feel like rare, surprising upgrades for this shop theme.",
    "No markdown fences. No explanation.",
  ].join("\n");
}

function assertArrayCount(value, count, label) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new Error(`${label} length mismatch`);
  }
}

function mergeGeneratedContentPack(basePack, metaPart, corePart, specialPart) {
  assertArrayCount(metaPart?.sources, 3, "sources");
  assertArrayCount(metaPart?.clients, 5, "clients");
  assertArrayCount(metaPart?.blessings, 3, "blessings");
  assertArrayCount(metaPart?.introSequence, 4, "introSequence");
  assertArrayCount(corePart?.chains, 3, "core chains");
  assertArrayCount(specialPart?.chains, 2, "special chains");
  assertArrayCount(specialPart?.recipes, 3, "recipes");

  const chainMap = new Map();
  [...corePart.chains, ...specialPart.chains].forEach((chain) => {
    chainMap.set(chain.id, chain);
  });

  const expectedChainCounts = {
    botanical: 6,
    alchemy: 6,
    curio: 6,
    waste: 6,
    secret: 8,
  };

  Object.entries(expectedChainCounts).forEach(([chainId, count]) => {
    const chain = chainMap.get(chainId);
    if (!chain) {
      throw new Error(`Missing chain ${chainId}`);
    }
    assertArrayCount(chain.items, count, `${chainId} items`);
  });

  return {
    ...basePack,
    sources: metaPart.sources,
    clients: metaPart.clients,
    blessings: metaPart.blessings,
    introSequence: metaPart.introSequence,
    recipes: specialPart.recipes,
    chains: basePack.chains.map((baseChain) => chainMap.get(baseChain.id) || baseChain),
  };
}

class StaticLLMAdapter {
  describe() {
    return "Static Local LLM";
  }

  async generateConcept({ worldName, shopIdea }) {
    const normalizedIdea = sanitizeShopIdea(shopIdea);
    const shopName = buildShopName(normalizedIdea);
    const theme = pickTheme(normalizedIdea);

    return {
      worldName,
      shopIdea: normalizedIdea,
      shopName,
      assistantName: "店员助手",
      assistantRole: "店长助手",
      summary:
        `${shopName}会被设定成${worldName}建设过程中的资源中转点。它主要承接零散但持续发生的小需求，把玩家每天的进度自然落在进货、合成和交付上。`,
      assistantSummary:
        "这位店员助手会先负责盯订单、整理货源和解释规则，也负责在店铺搭建时陪玩家对话，消化等待。",
      loopSummary:
        "当前本地版先沿用已有的 merge + 订单骨架，把你输入的店铺主题映射到店名、叙事动机、助手身份和主题视觉上。",
      confirmationLine:
        `明白了，我们先把它做成「${shopName}」。我会一边替你盯施工，一边把第一批货线和柜台说明整理好。`,
      readySummary:
        `「${shopName}」已经搭好。现在可以直接进入店里，后续再把真实独立 LLM、生图和切图管线接进来。`,
      loadingPortraitUrl: `${ASSISTANT_ASSET_BASE}/serious.png`,
      runtimeConfig: {
        worldName,
        shopName,
        brandEyebrow: `${worldName} · ${theme.eyebrow}`,
        assistantName: "店员助手",
        assistantRole: "店员助手",
        assistantPortraits: buildAssistantPortraits(),
        tileAssetBase: TILE_ASSET_BASE,
        theme: theme.tokens,
      },
    };
  }

  async replyDuringLoading({ concept, message, job }) {
    const lowered = message.toLowerCase();
    let text;

    if (lowered.includes("卖") || lowered.includes("客")) {
      text = `${concept.shopName}会优先服务${WORLD_NAME}里那些零散但急的小需求，所以第一批客人会更偏教学、巡夜和社团临时委托。`;
    } else if (lowered.includes("助手") || lowered.includes("你")) {
      text = `我会先负责把订单、补给和当天提示串起来。等真实角色 LLM 接进来后，这里的对话就会从固定回复切到独立角色驱动。`;
    } else if (lowered.includes("多久") || lowered.includes("还要")) {
      text = `这版本地 builder 只做一轮快速施工，所以会先完成设定锁定、助手资产挂载和运行配置写入，然后就能直接开张。`;
    } else if (lowered.includes("素材") || lowered.includes("图片")) {
      text = "目前素材链路先挂接本地现成资产目录，后续再切到真实生图与切图链路。";
    } else {
      text = `我先记下这点。现在施工停在「${job.currentStageLabel || "准备设定"}」，等配置写完，你进店后就能立刻验证这家店的节奏。`;
    }

    return {
      text,
      mood: "serious",
    };
  }

  async generateContentPack({ concept }) {
    return buildStaticContentPack(concept);
  }
}

class NetaLLMAdapter {
  constructor() {
    this.baseUrl = process.env.NETA_LLM_BASE_URL || "https://litellm.talesofai.com";
    this.model = process.env.NETA_LLM_MODEL || "qwen3.5-flash-no-think";
    this.fallback = new StaticLLMAdapter();
  }

  describe() {
    return `Neta OAuth LLM (${this.model})`;
  }

  async generateConcept(input, context = {}) {
    if (!context.accessToken) {
      if (ALLOW_LLM_FALLBACK) return this.fallback.generateConcept(input);
      throw new Error("Missing Neta access token for LLM concept generation");
    }

    const prompt = [
      builderPrompts.concept,
      `World: ${input.worldName}`,
      `User shop idea: ${input.shopIdea}`,
      "Return compact JSON with keys: shopName, summary, assistantName, assistantRole, assistantSummary, loopSummary, confirmationLine, readySummary.",
    ].join("\n\n");

    try {
      const content = await this.complete(prompt, context);
      const parsed = parseModelJson(content);
      if (!parsed) {
        if (ALLOW_LLM_FALLBACK) {
          llmWarn("[neta-llm] concept JSON parse failed, falling back to static adapter");
          return this.fallback.generateConcept(input);
        }
        throw new Error("LLM returned non-JSON concept payload");
      }

      const theme = pickTheme(parsed.shopName || input.shopIdea);
      return {
        worldName: input.worldName,
        shopIdea: sanitizeShopIdea(input.shopIdea),
        shopName: parsed.shopName || buildShopName(input.shopIdea),
        assistantName: parsed.assistantName || "店员助手",
        assistantRole: parsed.assistantRole || "店长助手",
        assistantSummary: parsed.assistantSummary || "这位助手会先承担建店阶段的陪伴与解释工作。",
        summary: parsed.summary || `${input.shopIdea}会被映射成当前经营骨架里的第一家主题店。`,
        loopSummary: parsed.loopSummary || "当前本地版会先沿用现有 merge + 订单骨架。",
        confirmationLine: parsed.confirmationLine || `先把「${parsed.shopName || buildShopName(input.shopIdea)}」搭起来。`,
        readySummary: parsed.readySummary || "店铺已经准备好，可以开始经营。",
        loadingPortraitUrl: `${ASSISTANT_ASSET_BASE}/serious.png`,
        runtimeConfig: {
          worldName: input.worldName,
          shopName: parsed.shopName || buildShopName(input.shopIdea),
          brandEyebrow: `${input.worldName} · ${theme.eyebrow}`,
          assistantName: parsed.assistantName || "店员助手",
          assistantRole: "店员助手",
          assistantPortraits: buildAssistantPortraits(),
          tileAssetBase: TILE_ASSET_BASE,
          theme: theme.tokens,
        },
      };
    } catch (error) {
      if (ALLOW_LLM_FALLBACK) {
        llmWarn(`[neta-llm] concept fallback: ${error.message}`);
        return this.fallback.generateConcept(input);
      }
      throw error;
    }
  }

  async replyDuringLoading(input, context = {}) {
    if (!context.accessToken) {
      if (ALLOW_LLM_FALLBACK) return this.fallback.replyDuringLoading(input);
      throw new Error("Missing Neta access token for loading chat");
    }
    const prompt = [
      "You are an in-world shop assistant talking during shop construction.",
      `Shop: ${input.concept.shopName}`,
      `User message: ${input.message}`,
      "Answer in concise simplified Chinese.",
    ].join("\n\n");
    try {
      const text = await this.complete(prompt, context);
      return { text, mood: "serious" };
    } catch (error) {
      if (ALLOW_LLM_FALLBACK) {
        llmWarn(`[neta-llm] loading chat fallback: ${error.message}`);
        return this.fallback.replyDuringLoading(input);
      }
      throw error;
    }
  }

  async generateContentPack(input, context = {}) {
    if (!context.accessToken) {
      if (ALLOW_LLM_FALLBACK) return this.fallback.generateContentPack(input);
      throw new Error("Missing Neta access token for content pack generation");
    }

    const concept = input?.concept || {};
    const basePack = buildStaticContentPack(concept);
    const sectionTimeoutMs = Math.min(CONTENT_PACK_LLM_TIMEOUT_MS, CONTENT_PACK_SECTION_TIMEOUT_MS);

    try {
      const metaText = await this.complete(buildMetaContentPackPrompt(input, concept), {
        ...context,
        model: CONTENT_PACK_LLM_MODEL,
        temperature: 0.15,
        maxTokens: 650,
        timeoutMs: sectionTimeoutMs,
      }).catch((error) => {
        throw new Error(`Content pack section meta failed: ${error.message}`);
      });
      const metaPart = parseModelJson(metaText);
      if (!metaPart) {
        throw new Error("Content pack section meta returned non-JSON payload");
      }

      const coreText = await this.complete(buildCoreChainsPrompt(input, concept), {
        ...context,
        model: CONTENT_PACK_LLM_MODEL,
        temperature: 0.2,
        maxTokens: 900,
        timeoutMs: sectionTimeoutMs,
      }).catch((error) => {
        throw new Error(`Content pack section core-chains failed: ${error.message}`);
      });
      const corePart = parseModelJson(coreText);
      if (!corePart) {
        throw new Error("Content pack section core-chains returned non-JSON payload");
      }

      const specialText = await this.complete(buildSpecialChainsPrompt(input, concept), {
        ...context,
        model: CONTENT_PACK_LLM_MODEL,
        temperature: 0.2,
        maxTokens: 900,
        timeoutMs: sectionTimeoutMs,
      }).catch((error) => {
        throw new Error(`Content pack section special-chains failed: ${error.message}`);
      });
      const specialPart = parseModelJson(specialText);
      if (!specialPart) {
        throw new Error("Content pack section special-chains returned non-JSON payload");
      }

      return mergeGeneratedContentPack(basePack, metaPart, corePart, specialPart);
    } catch (error) {
      if (ALLOW_LLM_FALLBACK) {
        llmWarn(`[neta-llm] content pack fallback: ${error.message}`);
        return this.fallback.generateContentPack(input);
      }
      throw error;
    }
  }

  async complete(prompt, context = {}) {
    const completionId = ++completionCounter;
    const startedAt = Date.now();
    const timeoutMs = Number(context.timeoutMs || REMOTE_LLM_TIMEOUT_MS);
    const model = context.model || this.model;
    const temperature = context.temperature ?? 0.7;
    const maxTokens = context.maxTokens ?? undefined;
    const tokenPayload = decodeJwtPayload(context.accessToken);
    llmLog("[neta-llm] token", {
      completionId,
      model,
      scope: tokenPayload?.scope || tokenPayload?.scp || null,
      aud: tokenPayload?.aud || null,
      iss: tokenPayload?.iss || null,
      sub: tokenPayload?.sub || null,
      exp: tokenPayload?.exp || null,
    });
    llmLog(`[neta-llm][${completionId}] prompt\n${prompt}\n`);
    let lastError = null;

    for (let attempt = 1; attempt <= REMOTE_LLM_RETRY_COUNT; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await undiciFetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${context.accessToken}`,
          },
          body: JSON.stringify({
            model,
            temperature,
            stream: false,
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
          signal: controller.signal,
          dispatcher: OUTBOUND_PROXY || undefined,
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          llmError(`[neta-llm][${completionId}] error ${response.status}\n${errorBody}\n`);
          if (isRetryableLlmStatus(response.status) && attempt < REMOTE_LLM_RETRY_COUNT) {
            llmWarn("[neta-llm] retry", {
              completionId,
              attempt,
              status: response.status,
              nextDelayMs: REMOTE_LLM_RETRY_BASE_MS * attempt,
            });
            await sleep(REMOTE_LLM_RETRY_BASE_MS * attempt);
            continue;
          }
          throw new Error(`Remote LLM failed: ${response.status}${errorBody ? ` ${errorBody}` : ""}`);
        }

        const payload = await response.json();
        llmLog("[neta-llm] response", {
          completionId,
          status: response.status,
          contentType: response.headers.get("content-type"),
          elapsedMs: Date.now() - startedAt,
          usage: payload?.usage || null,
          attempt,
        });
        const fullText = extractMessageText(payload);
        if (!fullText) {
          llmError("[neta-llm] empty completion payload", {
            completionId,
            keys: Object.keys(payload || {}),
            choiceKeys: Object.keys(payload?.choices?.[0] || {}),
            messageKeys: Object.keys(payload?.choices?.[0]?.message || {}),
          });
          throw new Error("Remote LLM returned empty completion");
        }
        llmLog("[neta-llm] done", {
          completionId,
          elapsedMs: Date.now() - startedAt,
          textLength: fullText.length,
          attempt,
        });
        llmLog(`[neta-llm][${completionId}] completion\n${fullText}\n`);
        return fullText;
      } catch (error) {
        lastError = error;
        if (error?.name === "AbortError") {
          if (attempt < REMOTE_LLM_RETRY_COUNT) {
            llmWarn("[neta-llm] timeout-retry", {
              completionId,
              attempt,
              timeoutMs,
              nextDelayMs: REMOTE_LLM_RETRY_BASE_MS * attempt,
            });
            await sleep(REMOTE_LLM_RETRY_BASE_MS * attempt);
            continue;
          }
          throw new Error(`Remote LLM timeout after ${timeoutMs}ms`);
        }
        if (isTransientLlmNetworkError(error) && attempt < REMOTE_LLM_RETRY_COUNT) {
          llmWarn("[neta-llm] transient-network-retry", {
            completionId,
            attempt,
            error: error.message || String(error),
            causeCode: error?.cause?.code || null,
            nextDelayMs: REMOTE_LLM_RETRY_BASE_MS * attempt,
          });
          await sleep(REMOTE_LLM_RETRY_BASE_MS * attempt);
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError || new Error("Remote LLM failed");
  }
}

class LocalAssetImageAdapter {
  describe() {
    return "Local Asset Pack";
  }

  async prepareAssets(concept) {
    return {
      tileAssetBase: concept.runtimeConfig.tileAssetBase,
      assistantPortraits: buildAssistantPortraits(),
      rawSheetStatus: "linked",
      assistantStatus: "linked",
    };
  }
}

const llmAdapter = new NetaLLMAdapter();
const imageAdapter = new LocalAssetImageAdapter();

function getAccessTokenFromRequest(request) {
  const authorization = request.headers.authorization || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return "";
}

function buildAssistantPortraits() {
  return {
    angry: `${ASSISTANT_ASSET_BASE}/angry.png`,
    confused: `${ASSISTANT_ASSET_BASE}/confused.png`,
    serious: `${ASSISTANT_ASSET_BASE}/serious.png`,
    smile: `${ASSISTANT_ASSET_BASE}/smile.png`,
  };
}

function sanitizeShopIdea(shopIdea = "") {
  return shopIdea.trim().replace(/\s+/g, " ");
}

function buildShopName(shopIdea) {
  const cleaned = sanitizeShopIdea(shopIdea);
  if (!cleaned) return "有求必应屋杂货店";
  if (/[店铺屋阁馆局社站]/.test(cleaned.slice(-1))) return cleaned;
  if (cleaned.length <= 8) return `${cleaned}店`;
  return `${cleaned.slice(0, 8)}杂货店`;
}

function pickTheme(input) {
  const value = input.toLowerCase();
  if (value.includes("月") || value.includes("夜") || value.includes("星")) {
    return {
      eyebrow: "夜间调度",
      tokens: {
        bgTop: "#efe7d4",
        bgBottom: "#b89467",
        paper: "#fff8eb",
        paperSoft: "#efe2c9",
        gold: "#ad7c2b",
      },
    };
  }

  if (value.includes("药") || value.includes("炼") || value.includes("坩埚")) {
    return {
      eyebrow: "药剂调配",
      tokens: {
        bgTop: "#f4e7d3",
        bgBottom: "#c29963",
        paper: "#fff8ee",
        paperSoft: "#f3e5d0",
        gold: "#bf7d25",
      },
    };
  }

  return {
    eyebrow: "资源中转",
    tokens: {
      bgTop: "#faefc9",
      bgBottom: "#d7b57c",
      paper: "#fff7e7",
      paperSoft: "#f5ead0",
      gold: "#c78e2a",
    },
  };
}

function safeJsonParse(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function normalizeJsonLikeText(input = "") {
  return String(input || "")
    .replace(/[“”„‟＂「」『』]/g, '"')
    .replace(/[‘’‚‛＇]/g, '"')
    .replace(/：/g, ":")
    .replace(/，/g, ",")
    .replace(/；/g, ";")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/【/g, "[")
    .replace(/】/g, "]")
    .replace(/｛/g, "{")
    .replace(/｝/g, "}")
    .replace(/［/g, "[")
    .replace(/］/g, "]")
    .replace(/([,{]\s*)"([A-Za-z0-9_]+):"(?=\S)/g, '$1"$2":"')
    .replace(/("([A-Za-z0-9_]+)"\s*:\s*)([^"{\[\]\d\-tfn][^"]*)"(?!\s*:)(?=\s*[,}\]])/g, '$1"$3"')
    .replace(/("tags"\s*:\s*\[(?:\s*"[^"]*"\s*(?:,\s*"[^"]*"\s*)*)?)\}(?=\s*[,}\]])/g, "$1]}")
    .replace(/("ingredients"\s*:\s*\[(?:\s*"[^"]*"\s*(?:,\s*"[^"]*"\s*)*)?)\}(?=\s*[,}\]])/g, "$1]}")
    .replace(/([}\]])\s*("([A-Za-z0-9_]+)"\s*:)/g, "$1,$2")
    .replace(/,\s*([}\]])/g, "$1");
}

function parseModelJson(input = "") {
  const direct = safeJsonParse(input);
  if (direct) return direct;

  const normalizedDirect = safeJsonParse(normalizeJsonLikeText(input));
  if (normalizedDirect) return normalizedDirect;

  const fencedMatch = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const fenced = safeJsonParse(fencedMatch[1].trim());
    if (fenced) return fenced;
    const normalizedFenced = safeJsonParse(normalizeJsonLikeText(fencedMatch[1].trim()));
    if (normalizedFenced) return normalizedFenced;
  }

  const firstBrace = input.indexOf("{");
  const lastBrace = input.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = input.slice(firstBrace, lastBrace + 1);
    const parsedCandidate = safeJsonParse(candidate);
    if (parsedCandidate) return parsedCandidate;
    return safeJsonParse(normalizeJsonLikeText(candidate));
  }

  return null;
}

function extractMessageText(payload) {
  const message = payload?.choices?.[0]?.message;
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text" && typeof item.text === "string") return item.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function decodeJwtPayload(token = "") {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

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

function sendSse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildJob(concept, shopIdea, accessToken = "") {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    jobId,
    sessionId,
    concept,
    shopIdea,
    accessToken,
    events: [],
    clients: new Set(),
    currentStageLabel: "",
  };
  jobs.set(jobId, job);
  return job;
}

function mergeJobConcept(job, patch = {}) {
  const runtimeConfigPatch = patch.runtimeConfig || {};
  job.concept = {
    ...(job.concept || {}),
    ...patch,
    runtimeConfig: {
      ...(job.concept?.runtimeConfig || {}),
      ...runtimeConfigPatch,
    },
  };
  return job.concept;
}

async function persistJobHandshake(job) {
  const handshakePayload = buildAgentHandshakePayload(job);
  const files = localAgentJobFiles(job.jobId);
  await mkdir(files.base, { recursive: true });
  await writeJsonFile(files.handshake, handshakePayload);
  await writeFile(LAST_AGENT_HANDSHAKE_FILE, JSON.stringify(handshakePayload, null, 2), "utf8");
  return handshakePayload;
}

async function patchJobConcept(jobId, patch = {}) {
  const job = await getJobOrHydrate(jobId);
  if (!job) {
    throw new Error("Unknown job");
  }
  mergeJobConcept(job, patch);
  const handshake = await persistJobHandshake(job);
  return {
    job,
    handshake,
  };
}

function summarizeAgentExecution(job, session = null, extra = {}) {
  const stageTimeline = job.events
    .filter((event) => event?.type === "stage")
    .map((event) => ({
      label: event.label || "",
      status: event.status || null,
    }));
  const assistantMessages = job.events
    .filter((event) => event?.type === "assistant")
    .map((event) => ({
      name: event.name || job.concept?.assistantName || null,
      text: event.text || "",
    }));

  return {
    jobId: job.jobId,
    sessionId: session?.sessionId || job.sessionId,
    provider: agentProvider.metadata(),
    shopIdea: job.shopIdea,
    shopName: session?.concept?.shopName || job.concept?.shopName || null,
    assistantName: session?.concept?.assistantName || job.concept?.assistantName || null,
    status: session?.status || extra.status || null,
    eventCount: job.events.length,
    stageTimeline,
    assistantMessageCount: assistantMessages.length,
    lastAssistantMessage: assistantMessages.at(-1) || null,
    sources: session?.sources || null,
    runtimeConfig: session
      ? {
          shopName: session.runtimeConfig?.shopName || null,
          tileAssetBase: session.runtimeConfig?.tileAssetBase || null,
          assistantRole: session.runtimeConfig?.assistantRole || null,
        }
      : null,
    ...extra,
  };
}

function emitJobEvent(job, payload) {
  job.events.push(payload);
  if (payload?.type === "complete" && payload.session) {
    appLog("INFO", "[agent] complete-summary", summarizeAgentExecution(job, payload.session));
  }
  for (const client of job.clients) {
    sendSse(client, payload);
  }
}

function emitStage(job, label, text, status = "done") {
  job.currentStageLabel = label;
  emitJobEvent(job, {
    type: "stage",
    label,
    text,
    status,
  });
}

function emitFailed(job, error) {
  emitJobEvent(job, {
    type: "failed",
    error,
  });
}

function emitBlocked(job, payload = {}) {
  emitJobEvent(job, {
    type: "blocked",
    reason: payload.reason || "Missing required build artifacts",
    missingArtifacts: Array.isArray(payload.missingArtifacts) ? payload.missingArtifacts : [],
    artifactDir: payload.artifactDir || null,
  });
}

function emitAssistant(job, text) {
  emitJobEvent(job, {
    type: "assistant",
    name: job.concept.assistantName,
    text,
  });
}

async function saveSession(session) {
  await writeFile(SESSION_FILE, JSON.stringify(session, null, 2), "utf8");
}

async function loadSession() {
  try {
    return JSON.parse(await readFile(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function localAgentJobDir(jobId) {
  return path.join(LOCAL_AGENT_JOBS_DIR, jobId);
}

function buildArtifactDir(jobId) {
  return path.join(BUILD_ARTIFACTS_DIR, jobId);
}

function localAgentJobFiles(jobId) {
  const base = localAgentJobDir(jobId);
  return {
    base,
    handshake: path.join(base, "handshake.json"),
    status: path.join(base, "status.json"),
    result: path.join(base, "result.json"),
  };
}

async function writeJsonFile(filePath, payload) {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await rename(tempPath, filePath);
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function ensureLocalAgentJob(job, handshakePayload) {
  const files = localAgentJobFiles(job.jobId);
  await mkdir(files.base, { recursive: true });
  await mkdir(buildArtifactDir(job.jobId), { recursive: true });
  await writeJsonFile(files.handshake, handshakePayload);
  await writeJsonFile(files.status, {
    protocolVersion: handshakePayload.protocolVersion,
    jobId: job.jobId,
    sessionId: job.sessionId,
    provider: "local-codex",
    state: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    claimedAt: null,
    claimedBy: null,
    completedAt: null,
    failedAt: null,
    blockedAt: null,
  });
  return files;
}

async function updateLocalAgentStatus(jobId, patch) {
  const files = localAgentJobFiles(jobId);
  const current = await readJsonFile(files.status);
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(files.status, next);
  return next;
}

async function listLocalAgentJobs() {
  const entries = await readdir(LOCAL_AGENT_JOBS_DIR, { withFileTypes: true }).catch(() => []);
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const files = localAgentJobFiles(entry.name);
    try {
      const status = await readJsonFile(files.status);
      const handshake = await readJsonFile(files.handshake);
      results.push({
        jobId: entry.name,
        status,
        job: handshake.job,
        concept: {
          shopName: handshake.concept?.shopName || null,
          assistantName: handshake.concept?.assistantName || null,
        },
      });
    } catch {
      // ignore unreadable dirs
    }
  }
  results.sort((a, b) => `${b.status?.updatedAt || ""}`.localeCompare(`${a.status?.updatedAt || ""}`));
  return results;
}

async function hydrateJobFromLocalFiles(jobId) {
  const files = localAgentJobFiles(jobId);
  try {
    const handshake = await readJsonFile(files.handshake);
    const job = {
      jobId,
      sessionId: handshake.job?.sessionId || `session_${jobId}`,
      concept: handshake.concept,
      shopIdea: handshake.job?.shopIdea || handshake.concept?.shopIdea || "",
      events: [],
      clients: new Set(),
      currentStageLabel: "",
    };
    jobs.set(jobId, job);
    return job;
  } catch {
    return null;
  }
}

async function getJobOrHydrate(jobId) {
  return jobs.get(jobId) || (await hydrateJobFromLocalFiles(jobId));
}

function buildAgentHandshakePayload(job) {
  const artifactDir = buildArtifactDir(job.jobId);
  const tileRows = Number(builderProfile.generationPlan?.tileSplit?.rows || 4);
  const tileCols = Number(builderProfile.generationPlan?.tileSplit?.cols || 8);
  return {
    protocolVersion: "world-shop-agent/v1",
    requestedAt: new Date().toISOString(),
    providerHint: SHOP_AGENT_PROVIDER,
    job: {
      jobId: job.jobId,
      sessionId: job.sessionId,
      worldName: WORLD_NAME,
      shopIdea: job.shopIdea,
    },
    concept: job.concept,
    builderProfile: {
      ...builderProfile,
      promptsLoaded: Object.keys(builderPrompts),
    },
    prompts: builderPrompts,
    assets: {
      defaults: {
        tileAssetBase: TILE_ASSET_BASE,
        assistantAssetBase: ASSISTANT_ASSET_BASE,
      },
      generationPlan: builderProfile.generationPlan,
      outputSlots: {
        artifactDir,
        requiredFiles: [
          {
            id: "shop_sheet_4x8",
            path: path.join(artifactDir, "shop_sheet_4x8.png"),
            kind: "image",
            required: true,
          },
          {
            id: "assistant_sheet_1x4",
            path: path.join(artifactDir, "assistant_sheet_1x4.png"),
            kind: "image",
            required: true,
          },
          {
            id: "assistant_manifest",
            path: path.join(artifactDir, "assistant_portraits", "manifest.json"),
            kind: "json",
            required: true,
          },
          {
            id: "tile_manifest",
            path: path.join(artifactDir, "tiles", "manifest.json"),
            kind: "json",
            required: true,
          },
        ],
        tileOutputDir: path.join(artifactDir, "tiles"),
        portraitOutputDir: path.join(artifactDir, "assistant_portraits"),
        requiredTileCount: tileRows * tileCols,
      },
    },
    runtime: {
      llm: llmAdapter.describe(),
      image: imageAdapter.describe(),
      localProjectRoot: PROJECT_ROOT,
      writableGeneratedDir: GENERATED_DIR,
    },
    expectedResult: {
      sessionStatus: "ready",
      requiredFields: [
        "runtimeConfig",
        "sources.agent",
        "sources.image",
      ],
      blockingRequirements: [
        "shop_sheet_4x8.png",
        "assistant_sheet_1x4.png",
        "assistant_portraits/manifest.json",
        "tiles/manifest.json",
      ],
    },
  };
}

function buildReadySession(job, imageAssets, agentSource, extra = {}) {
  return {
    sessionId: job.sessionId,
    status: "ready",
    enteredShop: false,
    createdAt: new Date().toISOString(),
    worldName: WORLD_NAME,
    shopIdea: job.shopIdea,
    concept: job.concept,
    runtimeConfig: {
      ...job.concept.runtimeConfig,
      assistantPortraits: imageAssets.assistantPortraits,
      tileAssetBase: imageAssets.tileAssetBase,
      ...(extra.runtimeConfig || {}),
    },
    sources: {
      llm: llmAdapter.describe(),
      builder: `Local Orchestrator + ${builderProfile.id}`,
      image: imageAdapter.describe(),
      agent: agentSource,
      ...(extra.sources || {}),
    },
    profile: {
      ...builderProfile,
      promptsLoaded: Object.keys(builderPrompts),
      ...(extra.profile || {}),
    },
    ...(extra.session || {}),
  };
}

class LocalCodexAgentProvider {
  metadata() {
    return {
      id: "local-codex",
      label: "Local Codex Agent",
      transport: "in-process",
      mode: "local",
      configured: true,
    };
  }

  describe() {
    return this.metadata().label;
  }

  async run(job) {
    const handshakePayload = buildAgentHandshakePayload(job);
    await ensureLocalAgentJob(job, handshakePayload);
    emitStage(
      job,
      "载入 Builder 档案",
      `已载入 ${builderProfile.name}，当前使用 ${builderProfile.id} 处理建店任务。`,
    );
    emitStage(
      job,
      "等待本地 Agent 接管",
      "本地建店任务已写入队列。当前 provider 不再自动完工，等待本地 Codex worker 认领任务、回传施工事件并提交最终结果。",
      "running",
    );
  }
}

class RemoteAgentProvider {
  constructor() {
    this.baseUrl = SHOP_AGENT_REMOTE_BASE_URL.replace(/\/$/, "");
  }

  metadata() {
    return {
      id: "remote",
      label: "Remote World Shop Agent",
      transport: "http",
      mode: "remote",
      configured: Boolean(this.baseUrl),
      baseUrl: this.baseUrl || null,
    };
  }

  describe() {
    return this.baseUrl ? `${this.metadata().label} (${this.baseUrl})` : this.metadata().label;
  }

  async run(job) {
    if (!this.baseUrl) {
      throw new Error("Remote agent provider selected but SHOP_AGENT_BASE_URL is not configured");
    }

    emitStage(
      job,
      "握手远程 Agent",
      `正在连接远程建店代理 ${this.baseUrl}，后续线上环境只需要切换 provider，不需要改前端建店流。`,
      "running",
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SHOP_AGENT_REMOTE_TIMEOUT_MS);
    try {
      const kickoff = await undiciFetch(`${this.baseUrl}/api/world-shop/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(buildAgentHandshakePayload(job)),
        signal: controller.signal,
        dispatcher: OUTBOUND_PROXY || undefined,
      });

      const kickoffPayload = await kickoff.json().catch(() => null);
      appLog("INFO", "[agent-remote] kickoff", {
        status: kickoff.status,
        ok: kickoff.ok,
        payload: kickoffPayload,
      });

      if (!kickoff.ok) {
        throw new Error(kickoffPayload?.error || `Remote agent kickoff failed: ${kickoff.status}`);
      }

      if (kickoffPayload?.session) {
        const session = kickoffPayload.session;
        await saveSession(session);
        emitJobEvent(job, {
          type: "complete",
          session,
        });
        return;
      }

      const remoteJobId = kickoffPayload?.remoteJobId || kickoffPayload?.jobId;
      if (!remoteJobId) {
        throw new Error("Remote agent kickoff succeeded but no remoteJobId/session was returned");
      }

      let cursor = 0;
      while (true) {
        await wait(1200);
        const statusResponse = await undiciFetch(
          `${this.baseUrl}/api/world-shop/jobs/${remoteJobId}?cursor=${cursor}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
            dispatcher: OUTBOUND_PROXY || undefined,
          },
        );

        const statusPayload = await statusResponse.json().catch(() => null);
        appLog("INFO", "[agent-remote] poll", {
          remoteJobId,
          status: statusResponse.status,
          ok: statusResponse.ok,
          payload: statusPayload,
        });

        if (!statusResponse.ok) {
          throw new Error(statusPayload?.error || `Remote agent poll failed: ${statusResponse.status}`);
        }

        const events = Array.isArray(statusPayload?.events) ? statusPayload.events : [];
        for (const event of events) {
          emitJobEvent(job, event);
        }
        cursor = Number.isFinite(statusPayload?.nextCursor) ? statusPayload.nextCursor : cursor + events.length;

        if (statusPayload?.session) {
          await saveSession(statusPayload.session);
          emitJobEvent(job, {
            type: "complete",
            session: statusPayload.session,
          });
          return;
        }

        if (statusPayload?.status === "failed") {
          throw new Error(statusPayload?.error || "Remote agent reported failure");
        }
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Remote agent timeout after ${SHOP_AGENT_REMOTE_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function createAgentProvider() {
  if (SHOP_AGENT_PROVIDER === "remote") {
    return new RemoteAgentProvider();
  }
  return new LocalCodexAgentProvider();
}

const agentProvider = createAgentProvider();

async function runBuildJob(job) {
  const handshakePayload = buildAgentHandshakePayload(job);
  await writeFile(LAST_AGENT_HANDSHAKE_FILE, JSON.stringify(handshakePayload, null, 2), "utf8");
  appLog("INFO", "[agent] run", {
    provider: agentProvider.metadata(),
    jobId: job.jobId,
    sessionId: job.sessionId,
  });
  await agentProvider.run(job);
}

function buildCompletedSessionFromWorker(job, payload = {}) {
  if (payload.session) {
    return payload.session;
  }
  const imageAssets = payload.imageAssets || {
    tileAssetBase: job.concept.runtimeConfig?.tileAssetBase || TILE_ASSET_BASE,
    assistantPortraits: job.concept.runtimeConfig?.assistantPortraits || buildAssistantPortraits(),
  };
  return buildReadySession(
    job,
    imageAssets,
    payload.agentSource || `Local Codex Worker + ${builderProfile.id}`,
    {
      runtimeConfig: payload.runtimeConfig || {},
      sources: payload.sources || {},
      profile: payload.profile || {},
      session: payload.sessionPatch || {},
    },
  );
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function resolveUnder(baseDir, requestPath) {
  const resolved = path.resolve(baseDir, `.${requestPath}`);
  if (!resolved.startsWith(baseDir)) return null;
  return resolved;
}

async function serveFile(response, filePath) {
  const file = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": "no-store",
  });
  response.end(file);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      sendJson(response, 200, {
        defaults: {
          worldName: WORLD_NAME,
        },
        session: await loadSession(),
        adapters: {
          llm: llmAdapter.describe(),
          image: imageAdapter.describe(),
          builder: builderProfile.id,
          agent: agentProvider.metadata(),
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/agent") {
      sendJson(response, 200, {
        active: agentProvider.metadata(),
        protocolVersion: "world-shop-agent/v1",
        handshakeFile: "/generated/last-agent-handshake.json",
        builderProfile: {
          id: builderProfile.id,
          name: builderProfile.name,
          adapters: builderProfile.adapters,
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/agent/local/jobs") {
      sendJson(response, 200, {
        jobs: await listLocalAgentJobs(),
      });
      return;
    }

    if (request.method === "GET" && /^\/api\/agent\/local\/jobs\/[^/]+$/.test(url.pathname)) {
      const jobId = url.pathname.split("/").pop();
      const files = localAgentJobFiles(jobId);
      const [status, handshake] = await Promise.all([
        readJsonFile(files.status),
        readJsonFile(files.handshake),
      ]);
      sendJson(response, 200, {
        jobId,
        status,
        handshake,
      });
      return;
    }

    if (request.method === "POST" && /^\/api\/agent\/local\/jobs\/[^/]+\/claim$/.test(url.pathname)) {
      const jobId = url.pathname.split("/")[5];
      const body = await readJsonBody(request);
      const status = await updateLocalAgentStatus(jobId, {
        state: "claimed",
        claimedAt: new Date().toISOString(),
        claimedBy: body.claimedBy || "local-codex-worker",
      });
      const job = await getJobOrHydrate(jobId);
      if (job) {
        emitStage(
          job,
          "本地 Agent 已认领",
          `${status.claimedBy} 已认领这轮建店任务，后续施工事件将由本地 worker 持续回传。`,
          "running",
        );
      }
      sendJson(response, 200, { ok: true, status });
      return;
    }

    if (request.method === "POST" && /^\/api\/agent\/local\/jobs\/[^/]+\/events$/.test(url.pathname)) {
      const jobId = url.pathname.split("/")[5];
      const body = await readJsonBody(request);
      const job = await getJobOrHydrate(jobId);
      if (!job) {
        sendJson(response, 404, { error: "Unknown job" });
        return;
      }
      const events = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [];
      for (const event of events) {
        emitJobEvent(job, event);
      }
      await updateLocalAgentStatus(jobId, {
        state: "running",
      });
      sendJson(response, 200, { ok: true, count: events.length });
      return;
    }

    if (request.method === "POST" && /^\/api\/agent\/local\/jobs\/[^/]+\/concept$/.test(url.pathname)) {
      const jobId = url.pathname.split("/")[5];
      const body = await readJsonBody(request);
      const { job, handshake } = await patchJobConcept(jobId, body.conceptPatch || {});
      await updateLocalAgentStatus(jobId, {
        state: "running",
      });
      sendJson(response, 200, {
        ok: true,
        concept: job.concept,
        handshake,
      });
      return;
    }

    if (request.method === "POST" && /^\/api\/agent\/local\/jobs\/[^/]+\/content-pack$/.test(url.pathname)) {
      const jobId = url.pathname.split("/")[5];
      const job = await getJobOrHydrate(jobId);
      if (!job) {
        sendJson(response, 404, { error: "Unknown job" });
        return;
      }
      if (!job.accessToken) {
        sendJson(response, 400, { error: "Missing access token for content pack generation" });
        return;
      }

      const contentPack = await llmAdapter.generateContentPack(
        {
          worldName: job.concept?.worldName || WORLD_NAME,
          concept: job.concept,
        },
        {
          accessToken: job.accessToken,
        },
      );
      const { concept, handshake } = await (async () => {
        const result = await patchJobConcept(jobId, {
          runtimeConfig: {
            contentPack,
          },
        });
        return {
          concept: result.job.concept,
          handshake: result.handshake,
        };
      })();
      await updateLocalAgentStatus(jobId, {
        state: "running",
      });
      sendJson(response, 200, {
        ok: true,
        contentPack,
        concept,
        handshake,
      });
      return;
    }

    if (request.method === "POST" && /^\/api\/agent\/local\/jobs\/[^/]+\/block$/.test(url.pathname)) {
      const jobId = url.pathname.split("/")[5];
      const body = await readJsonBody(request);
      const job = await getJobOrHydrate(jobId);
      const status = await updateLocalAgentStatus(jobId, {
        state: "blocked",
        blockedAt: new Date().toISOString(),
        missingArtifacts: Array.isArray(body.missingArtifacts) ? body.missingArtifacts : [],
        blockReason: body.reason || "Missing required build artifacts",
        artifactDir: body.artifactDir || null,
      });
      if (job) {
        emitBlocked(job, {
          reason: status.blockReason,
          missingArtifacts: status.missingArtifacts,
          artifactDir: status.artifactDir,
        });
        appLog("WARN", "[agent] blocked-summary", summarizeAgentExecution(job, null, {
          status: "blocked",
          claimedBy: status.claimedBy || null,
          artifactDir: status.artifactDir || null,
          missingArtifacts: status.missingArtifacts || [],
          reason: status.blockReason || "Missing required build artifacts",
        }));
      }
      sendJson(response, 200, { ok: true, status });
      return;
    }

    if (request.method === "POST" && /^\/api\/agent\/local\/jobs\/[^/]+\/complete$/.test(url.pathname)) {
      const jobId = url.pathname.split("/")[5];
      const body = await readJsonBody(request);
      const job = await getJobOrHydrate(jobId);
      if (!job) {
        sendJson(response, 404, { error: "Unknown job" });
        return;
      }
      const session = buildCompletedSessionFromWorker(job, body);
      const files = localAgentJobFiles(jobId);
      await writeJsonFile(files.result, {
        completedAt: new Date().toISOString(),
        payload: body,
        session,
      });
      await saveSession(session);
      await updateLocalAgentStatus(jobId, {
        state: "completed",
        completedAt: new Date().toISOString(),
      });
      emitJobEvent(job, {
        type: "complete",
        session,
      });
      sendJson(response, 200, { ok: true, session });
      return;
    }

    if (request.method === "POST" && /^\/api\/agent\/local\/jobs\/[^/]+\/fail$/.test(url.pathname)) {
      const jobId = url.pathname.split("/")[5];
      const body = await readJsonBody(request);
      const job = await getJobOrHydrate(jobId);
      const status = await updateLocalAgentStatus(jobId, {
        state: "failed",
        failedAt: new Date().toISOString(),
        error: body.error || "Unknown local worker failure",
      });
      if (job) {
        emitFailed(job, status.error);
        appLog("ERROR", "[agent] fail-summary", summarizeAgentExecution(job, null, {
          status: "failed",
          claimedBy: status.claimedBy || null,
          error: status.error || "Unknown local worker failure",
        }));
      }
      sendJson(response, 200, { ok: true, status });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/build/concept") {
      const body = await readJsonBody(request);
      const accessToken = getAccessTokenFromRequest(request);
      if (!body.shopIdea?.trim()) {
        sendJson(response, 400, { error: "Missing shopIdea" });
        return;
      }

      const concept = await llmAdapter.generateConcept(
        {
          worldName: body.worldName || WORLD_NAME,
          shopIdea: body.shopIdea,
        },
        { accessToken },
      );
      sendJson(response, 200, { concept });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/build/start") {
      const body = await readJsonBody(request);
      const accessToken = getAccessTokenFromRequest(request);
      const concept =
        body.concept ||
        (await llmAdapter.generateConcept(
          {
            worldName: body.worldName || WORLD_NAME,
            shopIdea: body.shopIdea,
          },
          { accessToken },
        ));

      const job = buildJob(concept, body.shopIdea || concept.shopIdea, accessToken);
      runBuildJob(job).catch((error) => {
        emitFailed(job, error.message || "Unknown build failure");
      });

      sendJson(response, 200, {
        jobId: job.jobId,
        sessionId: job.sessionId,
        agent: agentProvider.metadata(),
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/build/stream/")) {
      const jobId = url.pathname.split("/").pop();
      const job = await getJobOrHydrate(jobId);
      if (!job) {
        sendJson(response, 404, { error: "Unknown job" });
        return;
      }

      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });

      response.write("\n");
      for (const event of job.events) {
        sendSse(response, event);
      }
      job.clients.add(response);
      request.on("close", () => {
        job.clients.delete(response);
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat/loading") {
      const body = await readJsonBody(request);
      const accessToken = getAccessTokenFromRequest(request);
      const job = body.jobId ? jobs.get(body.jobId) : null;
      const session = !job && body.sessionId ? await loadSession() : null;
      const concept = job?.concept || body.concept || session?.concept;

      if (session && session.sessionId !== body.sessionId) {
        sendJson(response, 404, { error: "Unknown session" });
        return;
      }

      if (!concept) {
        sendJson(response, 404, { error: "Unknown chat context" });
        return;
      }

      const reply = await llmAdapter.replyDuringLoading({
        concept,
        message: body.message || "",
        job: job || {
          currentStageLabel:
            session?.status === "ready" ? "可开张" : session?.status || "等待施工",
        },
      }, {
        accessToken,
      });
      sendJson(response, 200, { reply });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/session/enter") {
      const body = await readJsonBody(request);
      const session = await loadSession();
      if (!session || session.sessionId !== body.sessionId) {
        sendJson(response, 404, { error: "Unknown session" });
        return;
      }

      session.enteredShop = true;
      await saveSession(session);
      sendJson(response, 200, { ok: true, session });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/session/reset") {
      try {
        await rm(SESSION_FILE);
      } catch {
        // ignore
      }
      try {
        await rm(LOCAL_AGENT_JOBS_DIR, { recursive: true, force: true });
      } catch {
        // ignore
      }
      try {
        await rm(BUILD_ARTIFACTS_DIR, { recursive: true, force: true });
      } catch {
        // ignore
      }
      await mkdir(LOCAL_AGENT_JOBS_DIR, { recursive: true });
      await mkdir(BUILD_ARTIFACTS_DIR, { recursive: true });
      jobs.clear();
      sendJson(response, 200, { ok: true });
      return;
    }

    const staticPath =
      url.pathname === "/"
        ? path.join(PROJECT_ROOT, "index.html")
        : url.pathname.startsWith("/Downloads/")
          ? resolveUnder("/Users/yves", url.pathname)
          : url.pathname.startsWith("/generated/")
            ? resolveUnder(PROJECT_ROOT, url.pathname)
            : resolveUnder(PROJECT_ROOT, url.pathname);

    if (!staticPath) {
      sendJson(response, 403, { error: "Forbidden" });
      return;
    }

    await stat(staticPath);
    await serveFile(response, staticPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end("Not Found");
      return;
    }
    console.error(error);
    sendJson(response, 500, {
      error: error.message || "Internal Server Error",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Witch Curio Shop MVP 2 listening on http://${HOST}:${PORT}`);
});
