const STORAGE_KEY = "witch-curio_shop_mvp_v5_builder";
const SAVE_VERSION = 5;
const BOARD_SIZE = 25;
const XP_PER_LEVEL = 3;
const CHARGE_REGEN_MS = 6000;
const MAX_SHELF_ITEMS = 4;
const DRAG_START_DISTANCE_PX = 8;
const DETAIL_HOLD_DISTANCE_PX = 4;
const TOUCH_DETAIL_HOLD_MS = 280;
const DEBUG_NATIVE_DRAG = true;
const DEFAULT_STORE_NAME = "世界商店";
const DEFAULT_WORLD_NAME = "你的世界";
const DEFAULT_ASSISTANT_NAME = "店员助手";
const TILE_ASSET_BASE = "/Downloads/magic_assets_tiles_4x8_trimmed";
const HERMIONE_ASSET_BASE = "/Downloads/hermione_emotions_tiles_1x4_trimmed";
const DEFAULT_SHOP_THEME = {
  bgTop: "#faefc9",
  bgBottom: "#d7b57c",
  paper: "#fff7e7",
  paperSoft: "#f5ead0",
  gold: "#c78e2a",
  shopBgTop: "#faefc9",
  shopBgMid: "#f5dfa1",
  shopBgBottom: "#d0ab71",
  shopLight: "#f6d88f",
  shopLightSoft: "#f6d88f",
  shopPanel: "#fff7e7",
  shopPanel2: "#f5ead0",
  shopPaper: "#fff7e7",
  shopPaperSoft: "#f5ead0",
  shopCard: "#fffaf0",
  shopCardDark: "#ead2a8",
  shopBorder: "#8a6947",
  shopBorderDark: "#4b3829",
  shopGold: "#c78e2a",
  shopGoldSoft: "#e0bd72",
  shopGreen: "#6c8f4d",
  shopRed: "#b35b45",
  shopText: "#4a3728",
  shopInk: "#3a2414",
  shopMuted: "#7f6a4d",
};
const DECOR_STORAGE_KEY = `${STORAGE_KEY}:shop_decor_positions_v4`;
const SHOP_DECORATION_STICKERS = [
  {
    id: "wand-rack",
    url: "/generated/shop-stickers/ollivanders-decor/decor_01_wand-rack.png",
    left: 5,
    top: 68,
    width: 192,
  },
  {
    id: "wand-box-shelf",
    url: "/generated/shop-stickers/ollivanders-decor/decor_02_wand-box-shelf.png",
    left: 8,
    top: 71,
    width: 176,
  },
  {
    id: "shop-counter",
    url: "/generated/shop-stickers/ollivanders-decor/decor_03_shop-counter.png",
    left: 11,
    top: 74,
    width: 192,
  },
  {
    id: "wand-display-case",
    url: "/generated/shop-stickers/ollivanders-decor/decor_04_wand-display-case.png",
    left: 14,
    top: 77,
    width: 176,
  },
  {
    id: "wood-floor",
    url: "/generated/shop-stickers/ollivanders-decor/decor_05_wood-floor.png",
    left: 17,
    top: 80,
    width: 176,
  },
  {
    id: "closed-door",
    url: "/generated/shop-stickers/ollivanders-decor/decor_06_closed-door.png",
    left: 20,
    top: 83,
    width: 176,
  },
];

const DEFAULT_UI_BUTTON_STICKERS = {
  hall: "/generated/shop-stickers/hp-wood/sticker_15_platform-nine.png",
  codex: "/generated/shop-stickers/hp-wood/sticker_08_spell-book.png",
  shelf: "/generated/shop-stickers/hp-wood/sticker_10_hogwarts-crest.png",
  reset: "/generated/shop-stickers/hp-wood/sticker_13_time-turner.png",
  trash: "/generated/shop-stickers/hp-wood/sticker_06_cauldron.png",
};

const DECOR_DEFAULT_KEY = JSON.stringify(SHOP_DECORATION_STICKERS);

window.__SHOP_SAVE_KEY__ = STORAGE_KEY;

function buildTileAssetUrls(baseUrl) {
  return Array.from({ length: 4 }, (_, rowIndex) =>
    Array.from(
      { length: 8 },
      (_, columnIndex) => `${baseUrl}/item_${rowIndex + 1}_${columnIndex + 1}.png`,
    ),
  ).flat();
}

function buildDefaultAssistantPortraits(baseUrl = HERMIONE_ASSET_BASE) {
  return {
    angry: `${baseUrl}/angry.png`,
    confused: `${baseUrl}/confused.png`,
    serious: `${baseUrl}/serious.png`,
    smile: `${baseUrl}/smile.png`,
  };
}

function buildDefaultRuntimeConfig() {
  return {
    worldName: DEFAULT_WORLD_NAME,
    shopName: DEFAULT_STORE_NAME,
    brandEyebrow: "World Shop",
    assistantName: DEFAULT_ASSISTANT_NAME,
    assistantRole: "店员助手",
    assistantPortraits: buildDefaultAssistantPortraits(),
    tileAssetBase: TILE_ASSET_BASE,
    theme: DEFAULT_SHOP_THEME,
  };
}

function mergeRuntimeConfig(nextConfig = {}) {
  const defaults = buildDefaultRuntimeConfig();
  return {
    ...defaults,
    ...nextConfig,
    theme: {
      ...defaults.theme,
      ...(nextConfig.theme || {}),
    },
    assistantPortraits: {
      ...defaults.assistantPortraits,
      ...(nextConfig.assistantPortraits || {}),
    },
  };
}

let runtimeConfig = mergeRuntimeConfig(window.__SHOP_RUNTIME__ || {});
let tileAssetUrls = buildTileAssetUrls(runtimeConfig.tileAssetBase);
let tileBindingIndex = runtimeConfig.tileManifest?.bindings || {};
let decorationStickers = SHOP_DECORATION_STICKERS;
let uiButtonStickers = { ...DEFAULT_UI_BUTTON_STICKERS };
let shopDecorationKey = "";
let decorDragState = null;
let decorResizeState = null;
let activeTickerText = "";
let tickerHideTimer = null;

const DEFAULT_SOURCE_CONFIGS = [
  {
    id: "botanical",
    name: "进货台",
    shortLabel: "进货",
    blurb: "稳定补进基础货，适合开局铺第一条经营线。",
    unlockLevel: 1,
    baseItemId: "botanical-1",
    maxCharges: 3,
    cost: 2,
  },
  {
    id: "alchemy",
    name: "加工台",
    shortLabel: "加工",
    blurb: "产出处理中段货，适合把成品线继续往上推。",
    unlockLevel: 2,
    baseItemId: "alchemy-1",
    maxCharges: 3,
    cost: 4,
  },
  {
    id: "curio",
    name: "包装台",
    shortLabel: "包装",
    blurb: "带来风味更强的小货与包装件，也更容易出惊喜。",
    unlockLevel: 3,
    baseItemId: "curio-1",
    maxCharges: 2,
    cost: 6,
  },
];

const DEFAULT_CLIENT_PROFILES = [
  {
    name: "急单客",
    role: "赶时间的客人",
    requestFlavor: "要一件马上能交付的小货，最好别太复杂。",
  },
  {
    name: "回头客",
    role: "固定顾客",
    requestFlavor: "已经熟悉这家店，希望拿到稳定可靠的货。",
  },
  {
    name: "收藏客",
    role: "陈列爱好者",
    requestFlavor: "更看重稀有感和故事感，愿意等一件特别的货。",
  },
  {
    name: "挑剔客",
    role: "慢看型客人",
    requestFlavor: "想要更像样一点的货，不愿意拿最基础的版本。",
  },
  {
    name: "顺路客",
    role: "临时采购者",
    requestFlavor: "只是路过，但如果货够亮眼，也愿意多买一点。",
  },
];

const DEFAULT_ITEM_CHAINS = [
  {
    id: "botanical",
    label: "基础货线",
    colors: [],
    rareFromTier: 4,
    blendable: true,
    items: [
      ["基础小件", "最先补进来的基础货，适合开局铺盘。"],
      ["成形小件", "已经开始成型，能继续往上推进。"],
      ["进阶小件", "比基础货更完整，适合做第一批订单。"],
      ["成套货件", "已经接近可直接售卖的阶段。"],
      ["精选货件", "品质稳定，能拉高整条货线价值。"],
      ["招牌成货", "这一线的高阶成货，摆出来就很像样。"],
    ],
  },
  {
    id: "alchemy",
    label: "加工货线",
    colors: [],
    rareFromTier: 4,
    blendable: true,
    items: [
      ["半成品件", "适合作为加工线起点。"],
      ["初配件", "已经带有第一层处理痕迹。"],
      ["定型件", "结构更稳定，价值也更高。"],
      ["高配件", "适合拿去做中高阶委托。"],
      ["精炼件", "再往上一点，就有稀有货的味道了。"],
      ["完成成品", "这条加工线已经被你推到了高点。"],
    ],
  },
  {
    id: "curio",
    label: "风味货线",
    colors: [],
    rareFromTier: 4,
    blendable: true,
    items: [
      ["风味小物", "风格感最强的一条线，从小件开始。"],
      ["特色件", "已经开始有点值得细看了。"],
      ["亮眼件", "风格更完整，也更容易引起注意。"],
      ["精选件", "适合抬高店面的风格感。"],
      ["收藏件", "已经很像值得收藏的货。"],
      ["镇店特色", "放出来就能代表这家店气质的成货。"],
    ],
  },
  {
    id: "waste",
    label: "事故",
    colors: [],
    rareFromTier: 99,
    blendable: false,
    items: [
      ["焦黑残渣", "混料失败后留下的一撮焦痕。"],
      ["黏稠废胶", "看不出原料，只知道不要碰嘴。"],
      ["失控凝块", "会轻微颤动，像是还有魔力残留。"],
      ["反噬硬块", "硬到像石头，里面封着失败配方。"],
      ["误制变质核", "看起来危险，适合锁起来。"],
      ["灾祸封存瓶", "真正失败到值得当反面教材收藏。"],
    ],
  },
  {
    id: "secret",
    label: "隐藏货线",
    colors: [],
    rareFromTier: 1,
    blendable: false,
    items: [
      ["隐藏样件", "说明这次试配终于走对了方向。"],
      ["隐藏小件", "已经明显比常规货更值钱。"],
      ["隐藏成件", "开始带出隐藏货线的价值感。"],
      ["隐藏珍件", "能明显拉高订单回报。"],
      ["隐藏馆藏", "已经接近值得陈列的阶段。"],
      ["隐藏珍藏", "拿来冲收藏和高价委托都很合适。"],
      ["隐藏臻品", "属于会让玩家记住的稀有货。"],
      ["隐藏终品", "这条隐藏线的顶级成货。"],
    ],
  },
];

const DEFAULT_MIXED_RECIPE_CONFIGS = [
  {
    ingredients: ["botanical-2", "alchemy-2"],
    resultItemId: "secret-1",
    title: "试配命中",
    body: "基础货和加工货第一次对上，稳定做出了一件隐藏货。",
  },
  {
    ingredients: ["botanical-3", "curio-3"],
    resultItemId: "secret-2",
    title: "风味命中",
    body: "中阶基础货和风味货扣在一起，开出了更像样的隐藏货。",
  },
  {
    ingredients: ["alchemy-4", "curio-4"],
    resultItemId: "secret-4",
    title: "高阶命中",
    body: "高阶加工货和风味货碰在一起，终于炸出了真正稀有的结果。",
  },
];

const DEFAULT_DAILY_BLESSINGS = [
  {
    id: "greenhouse",
    title: "进货台供货旺盛",
    description: "今天更容易直接拿到高一级的基础货。",
    tags: ["进货更旺", "开局更顺"],
  },
  {
    id: "cauldron",
    title: "加工台状态正热",
    description: "今天加工线更容易发生额外升级。",
    tags: ["加工更活跃", "合成更容易跳级"],
  },
  {
    id: "owl",
    title: "包装台额外回货",
    description: "今天包装线更容易多带一件货，委托后也可能返还补货机会。",
    tags: ["返货更频繁", "惊喜更多"],
  },
];

const buildDefaultIntroSequence = () => [
  {
    speaker: "旁白",
    text:
      "作为这个世界的主人，你决定先把第一家店开起来。世界还在建设中，而一家稳定运转的小店，正是让资源和故事流动起来的开始。",
  },
  {
    speaker: "旁白",
    text:
      `你先把店址定了下来。这里会不断接到零散但持续的小需求，只要店铺开起来，资源和故事就会开始流动。`,
  },
  {
    speaker: runtimeConfig.assistantName,
    text:
      "我会先当你的店员助手，替你盯订单、整理补给，也会帮你判断今天该先进什么货。你只要把货物做对，这家店就能开始赚钱升级。",
  },
  {
    speaker: "旁白",
    text:
      "先别贪多。进第一批货，把两个相同物件往上合，再完成第一张订单。只要今天顺利开张，这家店往后就能无尽经营下去。",
  },
];

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeContentPack(nextPack = {}) {
  const sourcesById = new Map((nextPack.sources || []).map((item) => [item.id, item]));
  const chainsById = new Map((nextPack.chains || []).map((item) => [item.id, item]));
  const recipesByResultId = new Map((nextPack.recipes || []).map((item) => [item.resultItemId, item]));
  const blessingsById = new Map((nextPack.blessings || []).map((item) => [item.id, item]));
  const defaultIntro = buildDefaultIntroSequence();

  return {
    sources: DEFAULT_SOURCE_CONFIGS.map((item) => ({
      ...item,
      ...(sourcesById.get(item.id) || {}),
    })),
    clients: DEFAULT_CLIENT_PROFILES.map((item, index) => ({
      ...item,
      ...((nextPack.clients || [])[index] || {}),
    })),
    chains: DEFAULT_ITEM_CHAINS.map((chain) => {
      const patch = chainsById.get(chain.id) || {};
      const patchItems = Array.isArray(patch.items) ? patch.items : [];
      return {
        ...deepClone(chain),
        ...patch,
        items: chain.items.map((item, index) => {
          const nextItem = patchItems[index];
          if (Array.isArray(nextItem)) {
            return [
              nextItem[0] || item[0],
              nextItem[1] || item[1],
            ];
          }
          if (nextItem && typeof nextItem === "object") {
            return [
              nextItem.name || item[0],
              nextItem.description || item[1],
            ];
          }
          return [...item];
        }),
      };
    }),
    recipes: DEFAULT_MIXED_RECIPE_CONFIGS.map((recipe) => ({
      ...recipe,
      ...(recipesByResultId.get(recipe.resultItemId) || {}),
    })),
    blessings: DEFAULT_DAILY_BLESSINGS.map((item) => ({
      ...item,
      ...(blessingsById.get(item.id) || {}),
    })),
    introSequence: defaultIntro.map((item, index) => ({
      ...item,
      ...((nextPack.introSequence || [])[index] || {}),
    })),
  };
}

let contentPack = mergeContentPack(runtimeConfig.contentPack || {});
let sourceConfigs = contentPack.sources;
let clientProfiles = contentPack.clients;
let itemChains = contentPack.chains;
let mixedRecipeConfigs = contentPack.recipes;
let dailyBlessings = contentPack.blessings;
let introSequence = contentPack.introSequence;

function createEmptyDailyStats(dayKey) {
  return {
    dayKey,
    goldEarned: 0,
    goldSpent: 0,
    ordersCompleted: 0,
    mergesCompleted: 0,
    discoveriesMade: 0,
    upgradesGained: 0,
  };
}

function createReport(type, dayKey, overrides = {}) {
  return {
    type,
    dayKey,
    title: "",
    subtitle: "",
    assistantLine: "",
    metricLabelA: "收入",
    metricValueA: "0",
    metricLabelB: "订单",
    metricValueB: "0",
    metricLabelC: "发现",
    metricValueC: "0",
    buttonLabel: "开始今天营业",
    ...overrides,
  };
}

const itemIndex = {};
const itemOrder = [];
const chainIndex = {};
const mixedRecipeMap = {};

function rebuildCatalogFromContentPack() {
  itemOrder.length = 0;
  Object.keys(itemIndex).forEach((key) => delete itemIndex[key]);
  Object.keys(chainIndex).forEach((key) => delete chainIndex[key]);
  Object.keys(mixedRecipeMap).forEach((key) => delete mixedRecipeMap[key]);

  itemChains.forEach((chain) => {
    chainIndex[chain.id] = chain;
    chain.items.forEach(([name, description], index) => {
      const tier = index + 1;
      const id = `${chain.id}-${tier}`;
      const imageUrl = tileBindingIndex[id]?.url || tileAssetUrls[itemOrder.length];
      itemIndex[id] = {
        id,
        chainId: chain.id,
        chainLabel: chain.label,
        tier,
        name,
        description,
        imageUrl,
        rare: tier >= (chain.rareFromTier ?? 4),
        maxTier: chain.items.length,
        blendable: Boolean(chain.blendable),
        colors: chain.colors,
      };
      itemOrder.push(id);
    });
  });

  mixedRecipeConfigs.forEach((recipe) => {
    mixedRecipeMap[normalizePairKey(recipe.ingredients[0], recipe.ingredients[1])] = recipe;
  });
}

rebuildCatalogFromContentPack();

function applyThemeTokens() {
  const theme = runtimeConfig.theme || {};
  const root = document.documentElement;
  const normalizedTheme = normalizeThemeContrast(theme);
  if (normalizedTheme.bgTop) root.style.setProperty("--bg-top", normalizedTheme.bgTop);
  if (normalizedTheme.bgBottom) root.style.setProperty("--bg-bottom", normalizedTheme.bgBottom);
  if (normalizedTheme.paper) root.style.setProperty("--paper", normalizedTheme.paper);
  if (normalizedTheme.paperSoft) root.style.setProperty("--paper-soft", normalizedTheme.paperSoft);
  if (normalizedTheme.gold) root.style.setProperty("--gold", normalizedTheme.gold);
  const shopTokenMap = {
    shopBgTop: "--shop-bg-top",
    shopBgMid: "--shop-bg-mid",
    shopBgBottom: "--shop-bg-bottom",
    shopLight: "--shop-light",
    shopLightSoft: "--shop-light-soft",
    shopPanel: "--shop-panel",
    shopPanel2: "--shop-panel-2",
    shopPaper: "--shop-paper",
    shopPaperSoft: "--shop-paper-soft",
    shopCard: "--shop-card",
    shopCardDark: "--shop-card-dark",
    shopBorder: "--shop-border",
    shopBorderDark: "--shop-border-dark",
    shopGold: "--shop-gold",
    shopGoldSoft: "--shop-gold-soft",
    shopGreen: "--shop-green",
    shopRed: "--shop-red",
    shopText: "--shop-text",
    shopInk: "--shop-ink",
    shopMuted: "--shop-muted",
  };
  Object.entries(shopTokenMap).forEach(([themeKey, cssVar]) => {
    if (normalizedTheme[themeKey]) root.style.setProperty(cssVar, normalizedTheme[themeKey]);
  });
}

function hexToRgb(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return null;
  const hex = match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function getRelativeLuminance(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  const channel = (value) => {
    const next = value / 255;
    return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function getContrastRatio(foreground, background) {
  const front = getRelativeLuminance(foreground);
  const back = getRelativeLuminance(background);
  if (front === null || back === null) return null;
  const light = Math.max(front, back);
  const dark = Math.min(front, back);
  return (light + 0.05) / (dark + 0.05);
}

function pickReadableColor(background, dark = "#2b1a10", light = "#fff7e8") {
  const darkContrast = getContrastRatio(dark, background) || 0;
  const lightContrast = getContrastRatio(light, background) || 0;
  return darkContrast >= lightContrast ? dark : light;
}

function ensureReadableColor(foreground, background, minRatio = 4.5) {
  const ratio = getContrastRatio(foreground, background);
  if (ratio === null || ratio >= minRatio) return foreground;
  return pickReadableColor(background);
}

function normalizeThemeContrast(theme) {
  const next = { ...theme };
  const panelBg = next.shopPanel || next.paper || "#fff7e7";
  const cardBg = next.shopCard || next.shopPaper || "#fffaf0";
  const darkCardBg = next.shopCardDark || next.shopPanel2 || "#ead2a8";
  if (next.shopText) next.shopText = ensureReadableColor(next.shopText, panelBg, 4.5);
  if (next.shopInk) next.shopInk = ensureReadableColor(next.shopInk, cardBg, 4.5);
  if (next.shopMuted) next.shopMuted = ensureReadableColor(next.shopMuted, panelBg, 3.2);
  if (next.shopGoldSoft) next.shopGoldSoft = ensureReadableColor(next.shopGoldSoft, darkCardBg, 3.2);
  return next;
}

function refreshItemAssetUrls() {
  tileAssetUrls = buildTileAssetUrls(runtimeConfig.tileAssetBase);
  itemOrder.forEach((itemId, index) => {
    if (!itemIndex[itemId]) return;
    itemIndex[itemId].imageUrl = tileBindingIndex[itemId]?.url || tileAssetUrls[index];
  });
}

async function fetchJsonManifest(url) {
  if (!url) return null;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load manifest ${url}: ${response.status}`);
  }
  return response.json();
}

function mapDecorationManifest(manifest) {
  const stickers = Array.isArray(manifest?.stickers) ? manifest.stickers : [];
  if (!stickers.length) return SHOP_DECORATION_STICKERS;
  return stickers.slice(0, 6).map((sticker, index) => {
    const fallback = SHOP_DECORATION_STICKERS[index] || SHOP_DECORATION_STICKERS[0];
    return {
      id: sticker.id || fallback.id,
      url: sticker.url || fallback.url,
      left: Number.isFinite(sticker.defaultLeft) ? sticker.defaultLeft : fallback.left,
      top: Number.isFinite(sticker.defaultTop) ? sticker.defaultTop : fallback.top,
      width: Number.isFinite(sticker.defaultWidth) ? sticker.defaultWidth : fallback.width,
    };
  });
}

function mapUiButtonManifest(manifest) {
  const bindings = manifest?.bindings || {};
  return {
    ...DEFAULT_UI_BUTTON_STICKERS,
    hall: bindings.hall?.url || DEFAULT_UI_BUTTON_STICKERS.hall,
    codex: bindings.codex?.url || DEFAULT_UI_BUTTON_STICKERS.codex,
    shelf: bindings.shelf?.url || DEFAULT_UI_BUTTON_STICKERS.shelf,
    reset: bindings.reset?.url || DEFAULT_UI_BUTTON_STICKERS.reset,
    trash: bindings.trash?.url || DEFAULT_UI_BUTTON_STICKERS.trash,
  };
}

function applyUiButtonStickerUrls() {
  document.querySelectorAll("[data-ui-sticker]").forEach((image) => {
    const role = image.dataset.uiSticker;
    const url = uiButtonStickers[role];
    if (url && image.getAttribute("src") !== url) {
      image.setAttribute("src", url);
    }
  });
}

function resetGeneratedStickerAssets() {
  decorationStickers = SHOP_DECORATION_STICKERS;
  uiButtonStickers = { ...DEFAULT_UI_BUTTON_STICKERS };
  shopDecorationKey = "";
  applyUiButtonStickerUrls();
}

async function loadRuntimeStickerAssets(config = runtimeConfig) {
  resetGeneratedStickerAssets();
  try {
    const [decorationManifest, buttonManifest] = await Promise.all([
      fetchJsonManifest(config.decorationManifestUrl),
      fetchJsonManifest(config.uiButtonManifestUrl),
    ]);
    if (decorationManifest) {
      decorationStickers = mapDecorationManifest(decorationManifest);
      shopDecorationKey = "";
    }
    if (buttonManifest) {
      uiButtonStickers = mapUiButtonManifest(buttonManifest);
      applyUiButtonStickerUrls();
    }
    renderShopDecorations();
  } catch (error) {
    console.warn("Failed to load generated sticker assets", error);
  }
}

function applyRuntimeConfig(nextConfig = {}) {
  runtimeConfig = mergeRuntimeConfig(nextConfig);
  tileAssetUrls = buildTileAssetUrls(runtimeConfig.tileAssetBase);
  tileBindingIndex = runtimeConfig.tileManifest?.bindings || {};
  contentPack = mergeContentPack(runtimeConfig.contentPack || {});
  sourceConfigs = contentPack.sources;
  clientProfiles = contentPack.clients;
  itemChains = contentPack.chains;
  mixedRecipeConfigs = contentPack.recipes;
  dailyBlessings = contentPack.blessings;
  introSequence = contentPack.introSequence;
  rebuildCatalogFromContentPack();
  applyThemeTokens();
  loadRuntimeStickerAssets(runtimeConfig);
  render();
}

window.applyRuntimeConfig = applyRuntimeConfig;
window.getRuntimeConfig = () => runtimeConfig;

function getDebugTargetSummary(target) {
  if (!(target instanceof Element)) {
    return { tag: String(target), className: "", tileIndex: null };
  }

  const tile = target.closest(".tile");
  return {
    tag: target.tagName,
    className: target.className || "",
    tileIndex: tile?.dataset.index ?? null,
  };
}

function isBoardRelatedTarget(target) {
  return target instanceof Element && Boolean(target.closest("#board"));
}

function logDragDebug(label, event, extra = {}) {
  if (!DEBUG_NATIVE_DRAG) return;
  console.debug("[drag-debug]", label, {
    ...getDebugTargetSummary(event?.target),
    pointerType: event?.pointerType,
    button: event?.button,
    buttons: event?.buttons,
    x: event?.clientX,
    y: event?.clientY,
    defaultPrevented: event?.defaultPrevented,
    ...extra,
  });
}

const elements = {
  appShell: document.getElementById("appShell"),
  shopDecorations: document.getElementById("shopDecorations"),
  brandEyebrow: document.getElementById("brandEyebrow"),
  brandTitle: document.getElementById("brandTitle"),
  goldValue: document.getElementById("goldValue"),
  levelValue: document.getElementById("levelValue"),
  discoveriesValue: document.getElementById("discoveriesValue"),
  shelfCountValue: document.getElementById("shelfCountValue"),
  brandRankLabel: document.getElementById("brandRankLabel"),
  worldTicker: document.getElementById("worldTicker"),
  worldTickerEcho: document.getElementById("worldTickerEcho"),
  schoolStatusText: document.getElementById("schoolStatusText"),
  schoolStatusDetail: document.getElementById("schoolStatusDetail"),
  orderCard: document.getElementById("orderCard"),
  dailyEventCard: document.getElementById("dailyEventCard"),
  sourceList: document.getElementById("sourceList"),
  trashBin: document.getElementById("trashBin"),
  assistantPortrait: document.getElementById("assistantPortrait"),
  assistantMood: document.getElementById("assistantMood"),
  assistantName: document.getElementById("assistantName"),
  assistantLine: document.getElementById("assistantLine"),
  assistantFocus: document.getElementById("assistantFocus"),
  assistantStatus: document.getElementById("assistantStatus"),
  board: document.getElementById("board"),
  shelfList: document.getElementById("shelfList"),
  codexList: document.getElementById("codexList"),
  resetButton: document.getElementById("resetButton"),
  openHallButton: document.getElementById("openHallButton"),
  openShelfButton: document.getElementById("openShelfButton"),
  openCodexButton: document.getElementById("openCodexButton"),
  libraryOverlay: document.getElementById("libraryOverlay"),
  closeLibraryButton: document.getElementById("closeLibraryButton"),
  introOverlay: document.getElementById("introOverlay"),
  introSpeaker: document.getElementById("introSpeaker"),
  introText: document.getElementById("introText"),
  introStep: document.getElementById("introStep"),
  introSkip: document.getElementById("introSkip"),
  introNext: document.getElementById("introNext"),
  reportOverlay: document.getElementById("reportOverlay"),
  reportDayLabel: document.getElementById("reportDayLabel"),
  reportTitle: document.getElementById("reportTitle"),
  reportSubtitle: document.getElementById("reportSubtitle"),
  reportMetricLabelA: document.getElementById("reportMetricLabelA"),
  reportMetricValueA: document.getElementById("reportMetricValueA"),
  reportMetricLabelB: document.getElementById("reportMetricLabelB"),
  reportMetricValueB: document.getElementById("reportMetricValueB"),
  reportMetricLabelC: document.getElementById("reportMetricLabelC"),
  reportMetricValueC: document.getElementById("reportMetricValueC"),
  reportAssistantLine: document.getElementById("reportAssistantLine"),
  closeReportButton: document.getElementById("closeReportButton"),
  itemDetailOverlay: document.getElementById("itemDetailOverlay"),
  itemDetailImage: document.getElementById("itemDetailImage"),
  itemDetailChain: document.getElementById("itemDetailChain"),
  itemDetailTitle: document.getElementById("itemDetailTitle"),
  itemDetailSubtitle: document.getElementById("itemDetailSubtitle"),
  itemDetailTier: document.getElementById("itemDetailTier"),
  itemDetailRarity: document.getElementById("itemDetailRarity"),
  itemDetailSource: document.getElementById("itemDetailSource"),
  itemDetailUse: document.getElementById("itemDetailUse"),
  itemDetailNote: document.getElementById("itemDetailNote"),
  closeItemDetailButton: document.getElementById("closeItemDetailButton"),
  dragLayer: document.getElementById("dragLayer"),
  toastStack: document.getElementById("toastStack"),
};

let state = loadState() || createInitialState();
prepareCurrentDayState();
let selectedCell = null;
let toastId = 0;
let activeLeftTab = "orders";
let dragState = null;
let introStepIndex = 0;
let activeLibraryView = "shelf";
let libraryOpen = false;
let activeSourceId = sourceConfigs[0].id;
let activeDetailItemId = null;
let assistantReaction = null;
let assistantTypingTimer = null;
let assistantTypingTargetText = "";

applyThemeTokens();

elements.resetButton.addEventListener("click", () => {
  const confirmed = window.confirm("要清空这局进度并重新开始吗？");
  if (!confirmed) return;
  resetShopState(runtimeConfig);
  setAssistantReaction({
    mood: "serious",
    badge: "重新布置",
    line: `好，我们把工作台重新收拾干净了。先从${getPrimarySource().name}补第一批货，再把第一张订单重新跑通。`,
    focus: "今日重点：重新开张",
    status: "店铺状态：刚整理完",
  });
  showToast("重新开张", `${runtimeConfig.shopName}已经清空，可以重新营业。`);
});

document.querySelectorAll("#leftTabs [data-panel-tab]").forEach((button) => {
  button.addEventListener("click", () => setPanelTab("left", button.dataset.panelTab));
});

document.querySelectorAll("#libraryTabs [data-library-view]").forEach((button) => {
  button.addEventListener("click", () => {
    activeLibraryView = button.dataset.libraryView;
    renderLibraryView();
  });
});

elements.openShelfButton.addEventListener("click", () => openLibrary("shelf"));
elements.openCodexButton.addEventListener("click", () => openLibrary("codex"));
elements.openHallButton.addEventListener("click", () => {
  showToast("大厅即将上线", "即将上线，敬请期待。");
});
elements.trashBin.addEventListener("click", () => {
  showToast("垃圾桶", "把废料或多余材料拖到这里，就能腾出工作台空位。");
});
elements.closeLibraryButton.addEventListener("click", closeLibrary);

elements.introSkip.addEventListener("click", finishIntro);
elements.introNext.addEventListener("click", advanceIntro);
elements.closeReportButton.addEventListener("click", closeReportOverlay);
elements.closeItemDetailButton.addEventListener("click", closeItemDetailOverlay);
elements.itemDetailOverlay.addEventListener("click", (event) => {
  if (event.target === elements.itemDetailOverlay || event.target.classList.contains("item-detail-backdrop")) {
    closeItemDetailOverlay();
  }
});
document.addEventListener(
  "dragstart",
  (event) => {
    if (!isBoardRelatedTarget(event.target)) return;
    logDragDebug("document-dragstart-capture", event);
    event.preventDefault();
  },
  true,
);
document.addEventListener(
  "mousedown",
  (event) => {
    if (!isBoardRelatedTarget(event.target)) return;
    logDragDebug("document-mousedown-capture", event);
    if (event.target instanceof HTMLImageElement) {
      event.preventDefault();
    }
  },
  true,
);
elements.board.addEventListener(
  "dragstart",
  (event) => {
    logDragDebug("board-dragstart-capture", event);
    event.preventDefault();
  },
  true,
);
elements.board.addEventListener(
  "mousedown",
  (event) => {
    logDragDebug("board-mousedown-capture", event);
    if (event.target instanceof HTMLImageElement) {
      event.preventDefault();
    }
  },
  true,
);

window.setInterval(tickSources, 1000);
render();
window.__mvpBooted = true;

function createInitialState() {
  const sources = {};
  sourceConfigs.forEach((source) => {
    sources[source.id] = {
      charges: source.unlockLevel === 1 ? source.maxCharges : 0,
      maxCharges: source.maxCharges,
      lastChargeAt: Date.now(),
    };
  });

  const board = new Array(BOARD_SIZE).fill(null);
  board[0] = "botanical-1";
  board[1] = "botanical-1";
  board[2] = "botanical-1";

  return {
    version: SAVE_VERSION,
    gold: 24,
    xp: 0,
    completedOrders: 0,
    board,
    discoveries: ["botanical-1"],
    shelf: [],
    sources,
    order: createOrder({
      completedOrders: 0,
      discoveries: ["botanical-1"],
      level: 1,
    }),
    introSeen: true,
    openedDayKey: getTodayKey(),
    dailyStats: createEmptyDailyStats(getTodayKey()),
    pendingReport: null,
    lastNewItemId: "botanical-1",
    lastRareEvent: null,
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== SAVE_VERSION) return null;
    parsed.sources = parsed.sources || {};
    parsed.introSeen = parsed.introSeen !== false;
    parsed.openedDayKey = parsed.openedDayKey || getTodayKey();
    parsed.dailyStats = {
      ...createEmptyDailyStats(parsed.openedDayKey),
      ...(parsed.dailyStats || {}),
      dayKey: parsed.dailyStats?.dayKey || parsed.openedDayKey,
    };
    parsed.pendingReport = parsed.pendingReport || null;
    parsed.lastRareEvent = parsed.lastRareEvent || null;
    sourceConfigs.forEach((source) => {
      const existingSource = parsed.sources?.[source.id];
      if (!existingSource) {
        parsed.sources[source.id] = {
          charges: getLevelFromXp(parsed.xp || 0) >= source.unlockLevel ? source.maxCharges : 0,
          maxCharges: source.maxCharges,
          lastChargeAt: Date.now(),
        };
        return;
      }
      existingSource.maxCharges = source.maxCharges;
      existingSource.lastChargeAt = existingSource.lastChargeAt || Date.now();
    });
    return parsed;
  } catch (error) {
    console.error("Failed to load save", error);
    return null;
  }
}

function persistState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetShopState(nextRuntimeConfig = runtimeConfig, options = {}) {
  runtimeConfig = mergeRuntimeConfig(nextRuntimeConfig || {});
  contentPack = mergeContentPack(runtimeConfig.contentPack || {});
  sourceConfigs = contentPack.sources;
  clientProfiles = contentPack.clients;
  itemChains = contentPack.chains;
  mixedRecipeConfigs = contentPack.recipes;
  dailyBlessings = contentPack.blessings;
  introSequence = contentPack.introSequence;
  rebuildCatalogFromContentPack();
  refreshItemAssetUrls();
  applyThemeTokens();
  loadRuntimeStickerAssets(runtimeConfig);
  state = createInitialState();
  if (options.introSeen === false) {
    state.introSeen = false;
  }
  selectedCell = null;
  introStepIndex = 0;
  activeLeftTab = "orders";
  activeSourceId = sourceConfigs[0].id;
  activeDetailItemId = null;
  libraryOpen = false;
  activeLibraryView = "shelf";
  assistantReaction = null;
  assistantTypingTargetText = "";
  if (assistantTypingTimer) {
    window.clearTimeout(assistantTypingTimer);
    assistantTypingTimer = null;
  }
  prepareCurrentDayState();
  persistState();
  render();
}

window.resetShopState = resetShopState;

window.exportShopArchive = () => {
  const decorEntries = {};
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`${STORAGE_KEY}:shop_decor_positions`)) {
        decorEntries[key] = window.localStorage.getItem(key);
      }
    }
  } catch (error) {
    console.error("Failed to collect decor archive", error);
  }
  return {
    version: 1,
    archivedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
    runtimeConfig,
    savedState: window.localStorage.getItem(STORAGE_KEY),
    decorEntries,
  };
};

window.importShopArchive = (archive = {}) => {
  if (!archive.savedState) {
    throw new Error("Archive does not contain saved shop state");
  }
  runtimeConfig = mergeRuntimeConfig(archive.runtimeConfig || runtimeConfig);
  contentPack = mergeContentPack(runtimeConfig.contentPack || {});
  sourceConfigs = contentPack.sources;
  clientProfiles = contentPack.clients;
  itemChains = contentPack.chains;
  mixedRecipeConfigs = contentPack.recipes;
  dailyBlessings = contentPack.blessings;
  introSequence = contentPack.introSequence;
  tileAssetUrls = buildTileAssetUrls(runtimeConfig.tileAssetBase);
  tileBindingIndex = runtimeConfig.tileManifest?.bindings || {};
  rebuildCatalogFromContentPack();
  refreshItemAssetUrls();
  applyThemeTokens();
  window.localStorage.setItem(STORAGE_KEY, archive.savedState);
  Object.entries(archive.decorEntries || {}).forEach(([key, value]) => {
    if (typeof value === "string") window.localStorage.setItem(key, value);
  });
  state = loadState() || createInitialState();
  selectedCell = null;
  activeDetailItemId = null;
  libraryOpen = false;
  assistantReaction = null;
  loadRuntimeStickerAssets(runtimeConfig);
  render();
};

function getLevel() {
  return Math.floor(state.xp / XP_PER_LEVEL) + 1;
}

function getDiscoveryCount() {
  return state.discoveries.length;
}

function render() {
  elements.goldValue.textContent = String(state.gold);
  elements.levelValue.textContent = String(getLevel());
  elements.discoveriesValue.textContent = `${getDiscoveryCount()} / ${itemOrder.length}`;
  elements.shelfCountValue.textContent = `${state.shelf.length} / ${MAX_SHELF_ITEMS}`;
  renderShopDecorations();
  renderHeaderSummary();
  renderAssistant();
  renderPanelTabs();
  renderOrder();
  renderDailyEvent();
  renderSources();
  renderBoard();
  renderShelf();
  renderCodex();
  renderIntro();
  renderLibraryView();
  renderReportOverlay();
  renderItemDetailOverlay();
}

function renderShopDecorations() {
  if (!elements.shopDecorations) return;

  const savedPositions = loadDecorPositions();
  const nextKey = JSON.stringify({ stickers: decorationStickers, savedPositions });
  if (nextKey === shopDecorationKey) return;
  shopDecorationKey = nextKey;

  elements.shopDecorations.innerHTML = decorationStickers
    .map(
      (sticker, index) => {
        const position = savedPositions[sticker.id] || sticker;
        return `
        <button
          class="shop-decor-sticker shop-decor-sticker-${index + 1}"
          type="button"
          data-decor-id="${sticker.id}"
          style="--decor-left: ${position.left}%; --decor-top: ${position.top}%; --decor-width: ${position.width}px;"
          aria-label="移动店铺装饰"
        >
          <img src="${sticker.url}" alt="" draggable="false" />
          <span class="shop-decor-resize" data-decor-resize="true" aria-hidden="true"></span>
        </button>
      `;
      },
    )
    .join("");

  elements.shopDecorations.querySelectorAll("[data-decor-id]").forEach((button) => {
    button.addEventListener("pointerdown", handleDecorPointerDown);
  });
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getDecorMaxWidth() {
  const boardRect = elements.board?.getBoundingClientRect();
  const containerRect = elements.shopDecorations?.getBoundingClientRect();
  const referenceWidth = boardRect?.width || containerRect?.width || 560;
  return Math.max(140, Math.min(referenceWidth * 0.86, 520));
}

function loadDecorPositions() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DECOR_STORAGE_KEY) || "{}");
    if (saved.defaultKey !== getDecorDefaultKey()) return {};
    return saved.positions || {};
  } catch {
    return {};
  }
}

function saveDecorPosition(decorId, nextPosition) {
  const savedPositions = loadDecorPositions();
  savedPositions[decorId] = nextPosition;
  try {
    window.localStorage.setItem(
      DECOR_STORAGE_KEY,
      JSON.stringify({ defaultKey: getDecorDefaultKey(), positions: savedPositions }),
    );
  } catch (error) {
    console.error("Failed to save decor position", error);
  }
  shopDecorationKey = "";
}

function getDecorDefaultKey() {
  return JSON.stringify(decorationStickers);
}

function handleDecorPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (event.target.closest?.("[data-decor-resize]")) {
    handleDecorResizePointerDown(event);
    return;
  }
  const target = event.currentTarget;
  const container = elements.shopDecorations;
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  decorDragState = {
    id: target.dataset.decorId,
    target,
    containerRect,
    offsetX: event.clientX - targetRect.left,
    offsetY: event.clientY - targetRect.top,
    widthPx: clampNumber(
      targetRect.width || Number.parseFloat(target.style.getPropertyValue("--decor-width")) || 176,
      72,
      getDecorMaxWidth(),
    ),
  };
  target.classList.add("dragging");
  target.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", handleDecorPointerMove);
  window.addEventListener("pointerup", handleDecorPointerUp);
  window.addEventListener("pointercancel", handleDecorPointerUp);
}

function handleDecorResizePointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  const target = event.currentTarget;
  const targetRect = target.getBoundingClientRect();
  decorResizeState = {
    id: target.dataset.decorId,
    target,
    startX: event.clientX,
    startWidth: targetRect.width || Number.parseFloat(target.style.getPropertyValue("--decor-width")) || 176,
    minWidth: 72,
    maxWidth: getDecorMaxWidth(),
  };
  target.classList.add("resizing");
  target.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", handleDecorResizePointerMove);
  window.addEventListener("pointerup", handleDecorResizePointerUp);
  window.addEventListener("pointercancel", handleDecorResizePointerUp);
}

function handleDecorResizePointerMove(event) {
  if (!decorResizeState) return;
  const { target, startX, startWidth, minWidth, maxWidth } = decorResizeState;
  const nextWidth = clampNumber(startWidth + (event.clientX - startX), minWidth, maxWidth);
  target.style.setProperty("--decor-width", `${nextWidth}px`);
}

function handleDecorResizePointerUp() {
  if (!decorResizeState) return;
  const { id, target } = decorResizeState;
  target.classList.remove("resizing");
  saveDecorPosition(id, {
    left: Number.parseFloat(target.style.getPropertyValue("--decor-left")) || 0,
    top: Number.parseFloat(target.style.getPropertyValue("--decor-top")) || 0,
    width: clampNumber(
      Number.parseFloat(target.style.getPropertyValue("--decor-width")) || 176,
      72,
      getDecorMaxWidth(),
    ),
  });
  decorResizeState = null;
  window.removeEventListener("pointermove", handleDecorResizePointerMove);
  window.removeEventListener("pointerup", handleDecorResizePointerUp);
  window.removeEventListener("pointercancel", handleDecorResizePointerUp);
}

function handleDecorPointerMove(event) {
  if (!decorDragState) return;
  const { target, containerRect, offsetX, offsetY } = decorDragState;
  const left = ((event.clientX - containerRect.left - offsetX) / containerRect.width) * 100;
  const top = ((event.clientY - containerRect.top - offsetY) / containerRect.height) * 100;
  const nextLeft = Math.max(-10, Math.min(92, left));
  const nextTop = Math.max(-10, Math.min(92, top));
  target.style.setProperty("--decor-left", `${nextLeft}%`);
  target.style.setProperty("--decor-top", `${nextTop}%`);
}

function handleDecorPointerUp() {
  if (!decorDragState) return;
  const { id, target, widthPx } = decorDragState;
  target.classList.remove("dragging");
  saveDecorPosition(id, {
    left: Number.parseFloat(target.style.getPropertyValue("--decor-left")) || 0,
    top: Number.parseFloat(target.style.getPropertyValue("--decor-top")) || 0,
    width: widthPx,
  });
  decorDragState = null;
  window.removeEventListener("pointermove", handleDecorPointerMove);
  window.removeEventListener("pointerup", handleDecorPointerUp);
  window.removeEventListener("pointercancel", handleDecorPointerUp);
}

function setPanelTab(side, tab) {
  if (side === "left") {
    if (tab === "events") return;
    activeLeftTab = tab;
  }
  renderPanelTabs();
}

function renderPanelTabs() {
  document.querySelectorAll("#leftTabs [data-panel-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.panelTab === activeLeftTab);
  });
  document.querySelectorAll(".panel-left [data-panel-view]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panelView === activeLeftTab);
  });
}

function renderIntro() {
  const shouldShow = !state.introSeen;
  elements.introOverlay.hidden = !shouldShow;
  if (!shouldShow) return;

  const step = introSequence[introStepIndex] || introSequence[0] || {
    speaker: runtimeConfig.assistantName || "店员",
    text: "店已经开门了。先看第一张委托，再从补给里拿材料开始合成。",
  };
  const scene = document.getElementById("introScene");
  if (scene) {
    scene.textContent = runtimeConfig.shopName
      ? `${runtimeConfig.shopName} · 开张引导`
      : "世界商店 · 开张引导";
  }
  elements.introSpeaker.textContent = step.speaker;
  elements.introText.textContent = step.text;
  elements.introStep.textContent = `${introStepIndex + 1} / ${introSequence.length}`;
  elements.introNext.textContent =
    introStepIndex === introSequence.length - 1 ? "开始整理" : "下一句";
}

function openLibrary(view) {
  activeLibraryView = view;
  libraryOpen = true;
  renderLibraryView();
}

function closeLibrary() {
  libraryOpen = false;
  renderLibraryView();
}

function renderLibraryView() {
  if (!elements.libraryOverlay) return;

  elements.libraryOverlay.hidden = !libraryOpen;
  document.querySelectorAll("#libraryTabs [data-library-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.libraryView === activeLibraryView);
  });
  document.querySelectorAll("[data-library-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.libraryPanel === activeLibraryView);
  });
}

function renderReportOverlay() {
  if (!elements.reportOverlay) return;
  const report = state.pendingReport;
  elements.reportOverlay.hidden = !report;
  if (!report) return;

  elements.reportDayLabel.textContent =
    report.type === "opening" ? "开张回顾" : `${report.dayKey} 经营回顾`;
  elements.reportTitle.textContent = report.title;
  elements.reportSubtitle.textContent = report.subtitle;
  elements.reportMetricLabelA.textContent = report.metricLabelA;
  elements.reportMetricValueA.textContent = report.metricValueA;
  elements.reportMetricLabelB.textContent = report.metricLabelB;
  elements.reportMetricValueB.textContent = report.metricValueB;
  elements.reportMetricLabelC.textContent = report.metricLabelC;
  elements.reportMetricValueC.textContent = report.metricValueC;
  elements.reportAssistantLine.textContent = report.assistantLine;
  elements.closeReportButton.textContent = report.buttonLabel;
}

function closeReportOverlay() {
  if (!state.pendingReport) return;
  state.pendingReport = null;
  persistState();
  render();
}

function renderItemDetailOverlay() {
  const item = activeDetailItemId ? itemIndex[activeDetailItemId] : null;
  elements.itemDetailOverlay.hidden = !item;
  if (!item) return;

  elements.itemDetailImage.src = item.imageUrl;
  elements.itemDetailImage.alt = item.name;
  elements.itemDetailChain.textContent = item.chainLabel;
  elements.itemDetailTitle.textContent = item.name;
  elements.itemDetailSubtitle.textContent = item.description;
  elements.itemDetailTier.textContent = `${item.tier} 级货品`;
  elements.itemDetailRarity.textContent = getItemRarityLabel(item);
  elements.itemDetailSource.textContent = getItemSourceDetail(item);
  elements.itemDetailUse.textContent = getItemUseDetail(item);
  elements.itemDetailNote.textContent = getItemNoteDetail(item);
}

function openItemDetail(itemId) {
  if (!itemIndex[itemId]) return;
  activeDetailItemId = itemId;
  renderItemDetailOverlay();
}

function closeItemDetailOverlay() {
  activeDetailItemId = null;
  renderItemDetailOverlay();
}

function advanceIntro() {
  if (introStepIndex < introSequence.length - 1) {
    introStepIndex += 1;
    renderIntro();
    return;
  }

  finishIntro();
}

function finishIntro() {
  state.introSeen = true;
  introStepIndex = 0;
  persistState();
  render();
}

function renderHeaderSummary() {
  const blessing = getDailyBlessing();
  const latestEvent = state.lastRareEvent;
  const shopRank = getShopRankTier();
  const tickerText = buildWorldTickerText(blessing, latestEvent);

  elements.appShell.dataset.shopRank = String(shopRank);
  elements.brandEyebrow.textContent = runtimeConfig.brandEyebrow || runtimeConfig.worldName;
  elements.brandTitle.textContent = runtimeConfig.shopName;
  elements.brandRankLabel.textContent = getShopRankLabel();
  showTickerOnce(tickerText);

  elements.schoolStatusText.textContent = blessing.title;
  elements.schoolStatusDetail.textContent = latestEvent
    ? `${blessing.description} 最近一次触发的是「${latestEvent.title}」，继续推进还可能再出惊喜。`
    : blessing.description;
}

function showTickerOnce(tickerText) {
  const ticker = elements.worldTicker?.closest(".board-ribbon-ticker");
  if (!ticker || !tickerText || tickerText === activeTickerText) return;

  activeTickerText = tickerText;
  elements.worldTicker.textContent = tickerText;
  elements.worldTickerEcho.textContent = "";
  ticker.classList.remove("ticker-active");
  void ticker.offsetWidth;
  ticker.classList.add("ticker-active");

  if (tickerHideTimer) {
    clearTimeout(tickerHideTimer);
  }
  tickerHideTimer = window.setTimeout(() => {
    ticker.classList.remove("ticker-active");
  }, 6800);
}

function renderAssistant() {
  const assistantState = getAssistantState();
  elements.assistantName.textContent = runtimeConfig.assistantName;
  elements.assistantPortrait.src =
    runtimeConfig.assistantPortraits[assistantState.mood] ||
    runtimeConfig.assistantPortraits.serious;
  elements.assistantPortrait.alt = `${runtimeConfig.assistantName}·${assistantState.badge}`;
  elements.assistantMood.textContent = assistantState.badge;
  elements.assistantFocus.textContent = assistantState.focus;
  elements.assistantStatus.textContent = assistantState.status;
  startAssistantTyping(assistantState.line);
}

function getPrimarySource() {
  return sourceConfigs[0] || {
    name: "首批货源",
    shortLabel: "首批",
  };
}

function getNextUnlockSource(level = getLevel()) {
  return sourceConfigs.find((source) => level < source.unlockLevel) || null;
}

function getFirstCollectionName() {
  const candidate =
    itemChains.find((chain) => chain.id !== "waste" && chain.id !== "secret" && chain.items.length >= 4) ||
    itemChains.find((chain) => chain.id !== "waste" && chain.id !== "secret") ||
    itemChains[0];
  return candidate?.items?.[Math.min(3, (candidate.items?.length || 1) - 1)]?.[0] || "第一件陈列货";
}

function getAssistantState() {
  const primarySource = getPrimarySource();
  const nextSource = getNextUnlockSource();
  const firstCollectionName = getFirstCollectionName();
  if (assistantReaction) {
    return assistantReaction;
  }

  if (state.completedOrders === 0) {
    return {
      mood: "serious",
      badge: "冷静指引",
      line: `店主，先把今天第一单做出来。${primarySource.shortLabel}线起步最稳，我会继续盯着新来的委托。`,
      focus: "今日重点：顺利开张",
      status: "店铺状态：筹备中",
    };
  }

  if (getLevel() < 2) {
    return {
      mood: "serious",
      badge: "专注筹备",
      line: nextSource
        ? `再赚一点金币和经验，${nextSource.name}就能进店。之后金币不仅能进货，还能加急补回补货次数。`
        : "再赚一点金币和经验，把当前节奏跑稳，后面的扩张会顺很多。",
      focus: "今日重点：升到 2 级",
      status: "店铺状态：试营业",
    };
  }

  if (!state.shelf.length) {
    return {
      mood: "serious",
      badge: "进度推进",
      line: `把一条合成线推到 4 级，店里就会出现第一件值得陈列的货，比如「${firstCollectionName}」这种层级。`,
      focus: "今日重点：做出首件收藏",
      status: "店铺状态：经营稳定",
    };
  }

  return {
    mood: "smile",
    badge: "掌控节奏",
    line: "现在可以同时盯高阶订单、稀有事件和收藏进度了。金币别囤着，继续拿去补货、加急恢复和刷新委托。",
    focus: "今日重点：冲高阶订单",
    status: "店铺状态：客流上升",
  };
}

function setAssistantReaction(reaction) {
  assistantReaction = reaction;
}

function startAssistantTyping(text) {
  if (assistantTypingTargetText === text) return;

  assistantTypingTargetText = text;
  if (assistantTypingTimer) {
    window.clearTimeout(assistantTypingTimer);
    assistantTypingTimer = null;
  }

  const writeNext = (index) => {
    if (assistantTypingTargetText !== text) return;

    elements.assistantLine.textContent = text.slice(0, index);
    elements.assistantLine.classList.toggle("typing", index < text.length);
    if (index >= text.length) {
      return;
    }

    const currentChar = text[index - 1] || "";
    const delay = /[，。！？：；]/.test(currentChar) ? 72 : 20;
    assistantTypingTimer = window.setTimeout(() => writeNext(index + 1), delay);
  };

  writeNext(1);
}

function renderOrder() {
  const order = state.order;
  const canFulfill = canFulfillOrder(order);
  const requirements = order.requirements
    .map((requirement) => {
      const item = itemIndex[requirement.itemId];
      const owned = countItem(requirement.itemId);
      return `
        <li>
          <strong>${item.name}</strong> x${requirement.count}
          <span>（当前有 ${owned} 个）</span>
        </li>
      `;
    })
    .join("");

  elements.orderCard.innerHTML = `
    <h3>${order.title}</h3>
    <p class="order-client">${order.client.name} · ${order.client.role}</p>
    <p class="order-body">${order.client.requestFlavor}</p>
    <ul class="requirement-list">${requirements}</ul>
    <ul class="order-reward">
      <li>奖励：${order.rewardGold} 金币</li>
      <li>经验：${order.rewardXp}</li>
    </ul>
    <div class="order-actions">
      <button class="primary-button" id="fulfillButton" type="button" ${canFulfill ? "" : "disabled"}>
        交付委托
      </button>
      <button class="secondary-button" id="skipButton" type="button">
        花 6 金币刷新
      </button>
    </div>
  `;

  document.getElementById("fulfillButton").addEventListener("click", fulfillOrder);
  document.getElementById("skipButton").addEventListener("click", refreshOrder);
}

function renderDailyEvent() {
  const blessing = getDailyBlessing();
  const last = state.lastRareEvent;
  elements.dailyEventCard.innerHTML = `
    <h3>${blessing.title}</h3>
    <p class="event-lead">${blessing.description}</p>
    <div class="event-tag-row">
      ${blessing.tags.map((tag) => `<span class="event-tag">${tag}</span>`).join("")}
    </div>
    <div class="event-last">
      <strong>${last ? `最近触发：${last.title}` : "最近触发：还没有稀有事件"}</strong>
      <div>${last ? last.body : "继续补货、合成和交委托，稀有事件会在关键时刻出现。"}</div>
    </div>
  `;
}

function renderSources() {
  const level = getLevel();
  const selectedSource =
    sourceConfigs.find((source) => source.id === activeSourceId) || sourceConfigs[0];
  activeSourceId = selectedSource.id;
  const sourceState = state.sources[selectedSource.id];
  const sourceItem = itemIndex[selectedSource.baseItemId];
  const unlocked = level >= selectedSource.unlockLevel;
  const nextChargeIn = getNextChargeSeconds(selectedSource.id);
  const affordable = state.gold >= selectedSource.cost;
  const refreshCost = getSourceRefreshCost(selectedSource.id);
  const canRefresh = unlocked && sourceState.charges < selectedSource.maxCharges && state.gold >= refreshCost;

  elements.sourceList.innerHTML = `
    <article class="source-card source-card-single ${unlocked ? "unlocked" : "locked"}">
      <div class="source-showcase">
        <button
          class="source-preview source-preview-button"
          type="button"
          data-detail-item-id="${sourceItem.id}"
          aria-label="查看 ${sourceItem.name} 详情"
        >
          ${buildItemArtMarkup(sourceItem, "source-preview-image")}
        </button>
        <div class="source-showcase-copy">
          <div class="source-topline">
            <div>
              <h3>${selectedSource.name}</h3>
              <p class="source-blurb">${selectedSource.blurb}</p>
              <p class="source-product">当前起始货：${sourceItem.name}</p>
            </div>
            <span class="source-state">${unlocked ? "可用" : `${selectedSource.unlockLevel}级`}</span>
          </div>
          <div class="source-meta">
            <span class="source-meta-pill"><strong>${sourceState.charges}</strong> 补货</span>
            <span class="source-meta-pill"><strong>${unlocked ? (sourceState.charges >= selectedSource.maxCharges ? "已满" : `${nextChargeIn}s`) : "--"}</strong> 恢复</span>
            <span class="source-meta-pill"><strong>${selectedSource.cost}</strong> 单价</span>
          </div>
        </div>
      </div>
      <div class="source-actions">
        <button
          class="source-button"
          type="button"
          data-source-id="${selectedSource.id}"
          ${unlocked && sourceState.charges > 0 && affordable ? "" : "disabled"}
        >
          ${affordable ? `补货 ${selectedSource.cost}` : `需 ${selectedSource.cost}`}
        </button>
        <button
          class="secondary-button source-refresh-button"
          type="button"
          data-source-refresh-id="${selectedSource.id}"
          ${canRefresh ? "" : "disabled"}
        >
          ${
            !unlocked
              ? "尚未解锁"
              : sourceState.charges >= selectedSource.maxCharges
                ? "次数已满"
                : state.gold >= refreshCost
                  ? `加急 +1 ${refreshCost}`
                  : `需 ${refreshCost}`
          }
        </button>
      </div>
    </article>
    <div class="source-switcher">
      ${sourceConfigs
        .map(
          (source) => `
            <button
              class="source-switch ${source.id === activeSourceId ? "active" : ""}"
              type="button"
              data-source-switch-id="${source.id}"
            >
              ${source.shortLabel}
            </button>
          `,
        )
        .join("")}
    </div>
  `;

  elements.sourceList.querySelector("[data-source-id]")?.addEventListener("click", () => conjureFromSource(selectedSource.id));
  elements.sourceList
    .querySelector("[data-source-refresh-id]")
    ?.addEventListener("click", () => rushSourceCharge(selectedSource.id));
  elements.sourceList.querySelector("[data-detail-item-id]")?.addEventListener("click", () => {
    openItemDetail(sourceItem.id);
  });
  elements.sourceList.querySelectorAll("[data-source-switch-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSourceId = button.dataset.sourceSwitchId;
      renderSources();
    });
  });
}

function renderBoard() {
  elements.board.innerHTML = "";

  state.board.forEach((itemId, index) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `tile ${itemId ? "occupied" : "empty"}`;
    cell.dataset.index = String(index);

    if (selectedCell === index) {
      cell.classList.add("selected");
    }

    if (!itemId) {
      cell.setAttribute("aria-label", `空位 ${index + 1}`);
      cell.addEventListener("pointerdown", (event) => handleTilePointerDown(index, event));
      elements.board.appendChild(cell);
      return;
    }

    const item = itemIndex[itemId];
    if (!item) {
      cell.classList.add("waste-item");
      cell.innerHTML = `
        <div class="item-frame">
          <div class="item-visual">${buildFallbackArtMarkup()}</div>
          <div class="item-label">
            <div class="item-chain">异常</div>
            <h3 class="item-name">未知残留</h3>
            <div class="item-tier">请重置本局</div>
          </div>
        </div>
      `;
      cell.title = "当前格子的存档物件无法识别，建议点击“重新开始”清理本局。";
      cell.addEventListener("pointerdown", (event) => handleTilePointerDown(index, event));
      elements.board.appendChild(cell);
      return;
    }

    const toneClass = getBoardTileToneClass(item);
    if (toneClass) {
      cell.classList.add(toneClass);
    }
    if (state.lastNewItemId === itemId) {
      cell.classList.add("discovery");
    }

    cell.style.setProperty("--tile-tint", getItemTint(item));
    cell.style.setProperty("--tile-solid-tint", getItemSolidTint(item));
    cell.innerHTML = `
      <div class="item-frame">
        <div class="item-visual">${buildItemArtMarkup(item, "item-art")}</div>
        <div class="item-label">
          <div class="item-chain">${item.chainLabel}</div>
          <h3 class="item-name">${item.name}</h3>
          <div class="item-tier">等级 ${item.tier}</div>
        </div>
      </div>
    `;
    cell.title = `${item.name}：${item.description}（桌面端双击查看详情，触屏长按查看详情）`;
    cell.addEventListener("pointerdown", (event) => handleTilePointerDown(index, event));
    cell.addEventListener("dblclick", () => openItemDetail(item.id));
    elements.board.appendChild(cell);
  });
}

function getBoardTileToneClass(item) {
  if (!item) return "";
  if (item.chainId === "waste") return "waste-item";
  if (item.chainId === "secret" && item.tier >= 4) return "legendary-item";
  if (item.chainId === "secret" || item.rare) return "rare-item";
  return "";
}

function buildItemArtMarkup(item, className = "item-art") {
  if (!item?.imageUrl) {
    return buildFallbackArtMarkup(className);
  }
  return `<img class="${className}" src="${item.imageUrl}" alt="${item.name}" loading="lazy" decoding="async" draggable="false" ondragstart="return false" />`;
}

function buildFallbackArtMarkup(className = "item-art") {
  return `<div class="${className} ${className}-fallback"></div>`;
}

function getItemTint(item) {
  const color = item.colors?.[0];
  if (!color) return `color-mix(in srgb, ${getChainThemeColor(item.chainId)} 18%, transparent)`;
  return hexToRgba(color, 0.18);
}

function getItemSolidTint(item) {
  const color = item.colors?.[0];
  if (!color) return `color-mix(in srgb, ${getChainThemeColor(item.chainId)} 24%, var(--shop-card))`;
  return `color-mix(in srgb, ${color} 24%, var(--shop-card))`;
}

function getChainThemeColor(chainId) {
  const themeColorMap = {
    botanical: "var(--shop-green)",
    alchemy: "var(--shop-gold)",
    curio: "var(--shop-light)",
    waste: "var(--shop-muted)",
    secret: "var(--shop-gold-soft)",
  };
  return themeColorMap[chainId] || "var(--shop-gold-soft)";
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const padded = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : normalized;
  const red = parseInt(padded.slice(0, 2), 16);
  const green = parseInt(padded.slice(2, 4), 16);
  const blue = parseInt(padded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixHexColors(primaryHex, secondaryHex, primaryWeight = 0.5) {
  const primary = normalizeHexColor(primaryHex);
  const secondary = normalizeHexColor(secondaryHex);
  const weight = Math.max(0, Math.min(1, primaryWeight));
  const secondaryWeight = 1 - weight;

  const red = Math.round(parseInt(primary.slice(0, 2), 16) * weight + parseInt(secondary.slice(0, 2), 16) * secondaryWeight);
  const green = Math.round(parseInt(primary.slice(2, 4), 16) * weight + parseInt(secondary.slice(2, 4), 16) * secondaryWeight);
  const blue = Math.round(parseInt(primary.slice(4, 6), 16) * weight + parseInt(secondary.slice(4, 6), 16) * secondaryWeight);

  return `rgb(${red}, ${green}, ${blue})`;
}

function normalizeHexColor(hex) {
  const normalized = hex.replace("#", "");
  if (normalized.length === 3) {
    return normalized
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  return normalized;
}

function getItemRarityLabel(item) {
  if (item.chainId === "waste") return "事故残留";
  if (item.chainId === "secret" && item.tier >= 6) return "传奇货品";
  if (item.chainId === "secret") return "秘方珍品";
  if (item.rare) return "高阶收藏";
  return "常规库存";
}

function getItemSourceDetail(item) {
  if (item.chainId === "waste") {
    return "由同级异材试配失败后生成，通常意味着这次实验没有稳定成货。";
  }
  if (item.chainId === "secret") {
    return "只能通过特定的同级异材配方稳定开出，属于店里的隐藏秘方线。";
  }
  const source = sourceConfigs.find((entry) => entry.baseItemId.startsWith(item.chainId));
  if (!source) {
    return `来自 ${item.chainLabel} 货线的第 ${item.tier} 阶物件。`;
  }
  return `主要来自「${source.name}」，属于 ${item.chainLabel} 货线的第 ${item.tier} 阶物件。`;
}

function getItemUseDetail(item) {
  if (item.chainId === "waste") {
    return "基本没有正向经营价值，最好的处理方式是尽快腾格并继续补货试配。";
  }
  if (item.chainId === "secret") {
    return item.tier >= 6
      ? "适合作为镇店级招牌货，用来拉高收藏感和稀有度预期。"
      : "适合做成高价值委托目标，也能作为收藏线的阶段性追逐目标。";
  }
  if (item.tier >= 4) {
    return "已经接近收藏级货品，既能冲高价委托，也能拉动图鉴和收藏进度。";
  }
  return "属于常规经营素材，主要用于继续合成、完成订单和解锁更高阶货品。";
}

function getItemNoteDetail(item) {
  const sourceName = sourceConfigs.find((entry) => entry.id === item.chainId)?.name || item.chainLabel;
  if (item.chainId === "botanical") {
    return item.tier >= 4
      ? `${runtimeConfig.assistantName}建议优先留着做高阶订单，这条线后期稳定而且容易滚雪球。`
      : `这类由${sourceName}补进来的货起步最稳，最适合开局铺盘和练手。`;
  }
  if (item.chainId === "alchemy") {
    return item.tier >= 4
      ? `${item.chainLabel}越往后惊喜越多，和别的高阶货拼配时尤其容易炸出高价值结果。`
      : `${sourceName}这条线中期开始发力，适合用来冲节奏和做试配。`;
  }
  if (item.chainId === "curio") {
    return item.tier >= 4
      ? `${item.chainLabel}容易出风格化珍品，适合和别的高阶货一起试配秘方。`
      : `${sourceName}这条线本身波动大，但更容易带来意外的惊喜感。`;
  }
  if (item.chainId === "secret") {
    return "这是店里的隐藏配方产物，看到它就说明你已经开始摸到真正值得炫耀的内容了。";
  }
  return "这种事故货别留太久，占格子会拖慢节奏。";
}

function renderShelf() {
  if (!state.shelf.length) {
    elements.shelfList.innerHTML = `
      <div class="shelf-item">
        <p class="eyebrow">暂时空着</p>
        <h3>还没有陈列货</h3>
        <p>把任意一条线合到 4 级以上，就会开始出现值得摆出来的收藏。</p>
      </div>
    `;
    return;
  }

  elements.shelfList.innerHTML = state.shelf
    .map((itemId) => {
      const item = itemIndex[itemId];
      return `
        <article class="shelf-item">
          <div class="shelf-badge">${runtimeConfig.shopName}收藏</div>
          <article
            class="codex-item codex-item-button known"
            role="button"
            tabindex="0"
            data-detail-item-id="${item.id}"
            aria-label="查看 ${item.name} 详情"
          >
            <div class="codex-art">${buildItemArtMarkup(item, "codex-image")}</div>
            <div class="codex-text">
              <strong>${item.name}</strong>
              <span>${item.description}</span>
            </div>
            <span class="codex-tier">${item.tier}级</span>
          </article>
        </article>
      `;
    })
    .join("");

  bindDetailCardEvents(elements.shelfList);
}

function renderCodex() {
  elements.codexList.innerHTML = itemOrder
    .map((itemId) => {
      const item = itemIndex[itemId];
      const discovered = state.discoveries.includes(itemId);
      return `
        <article
          class="codex-item codex-item-button ${discovered ? "known" : "locked"}"
          ${discovered ? `role="button" tabindex="0" data-detail-item-id="${item.id}" aria-label="查看 ${item.name} 详情"` : ""}
        >
          <div class="codex-art">${discovered ? buildItemArtMarkup(item, "codex-image") : buildFallbackArtMarkup("codex-image")}</div>
          <div class="codex-text">
            <strong>${discovered ? item.name : "未发现货品"}</strong>
            <span>${discovered ? item.description : "继续往上合成，才能解锁这一格收藏。"}</span>
          </div>
          <span class="codex-tier">${item.tier}级</span>
        </article>
      `;
    })
    .join("");

  bindDetailCardEvents(elements.codexList);
}

function bindDetailCardEvents(container) {
  container.querySelectorAll("[data-detail-item-id]").forEach((card) => {
    const itemId = card.dataset.detailItemId;
    card.addEventListener("click", () => openItemDetail(itemId));
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openItemDetail(itemId);
    });
  });
}

function handleCellClick(index) {
  const itemId = state.board[index];
  if (!itemId) {
    selectedCell = null;
    renderBoard();
    return;
  }
  openItemDetail(itemId);
}

function handleTilePointerDown(index, event) {
  logDragDebug("tile-pointerdown", event, { sourceIndex: index });
  event.preventDefault();

  const itemId = state.board[index];
  if (!itemId) {
    handleCellClick(index);
    return;
  }

  dragState = {
    sourceIndex: index,
    pointerId: event.pointerId,
    pointerType: event.pointerType || "mouse",
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    itemId,
    dragging: false,
    detailHoldTimer: null,
    ghost: null,
    targetIndex: null,
    targetKind: "board",
  };

  if (dragState.pointerType !== "mouse") {
    dragState.detailHoldTimer = window.setTimeout(() => {
      if (!dragState || dragState.sourceIndex !== index || dragState.dragging) return;
      const heldItemId = dragState.itemId;
      cleanupDragState();
      openItemDetail(heldItemId);
    }, TOUCH_DETAIL_HOLD_MS);
  }

  window.addEventListener("pointermove", handleGlobalPointerMove);
  window.addEventListener("pointerup", handleGlobalPointerUp);
  window.addEventListener("pointercancel", handleGlobalPointerUp);
}

function handleGlobalPointerMove(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  dragState.currentX = event.clientX;
  dragState.currentY = event.clientY;

  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (distance > DETAIL_HOLD_DISTANCE_PX) {
    clearPendingTileDetail();
  }

  if (!dragState.dragging && distance > DRAG_START_DISTANCE_PX) {
    dragState.dragging = true;
    logDragDebug("custom-drag-start", event, {
      sourceIndex: dragState.sourceIndex,
      distance,
    });
    createDragGhost(dragState.sourceIndex);
    getTileElement(dragState.sourceIndex)?.classList.add("dragging");
  }

  if (!dragState.dragging) return;

  moveDragGhost(event.clientX, event.clientY);
  updateDropTarget(event.clientX, event.clientY);
}

function handleGlobalPointerUp(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  logDragDebug("tile-pointerup", event, {
    sourceIndex: dragState.sourceIndex,
    wasDragging: dragState.dragging,
    targetIndex: dragState.targetIndex,
    targetKind: dragState.targetKind,
  });

  const sourceIndex = dragState.sourceIndex;
  const targetIndex = dragState.targetIndex;
  const targetKind = dragState.targetKind;
  const wasDragging = dragState.dragging;

  cleanupDragState();

  if (!wasDragging) {
    return;
  }

  if (targetKind === "trash") {
    discardBoardItem(sourceIndex);
    return;
  }

  if (targetIndex === null || targetIndex === sourceIndex) {
    renderBoard();
    return;
  }

  applyBoardAction(sourceIndex, targetIndex);
}

function applyBoardAction(sourceIndex, targetIndex) {
  const sourceItemId = state.board[sourceIndex];
  const targetItemId = state.board[targetIndex];
  if (!sourceItemId) return;

  if (!targetItemId) {
    state.board[targetIndex] = sourceItemId;
    state.board[sourceIndex] = null;
    selectedCell = null;
    persistState();
    render();
    return;
  }

  if (canMerge(sourceItemId, targetItemId)) {
    mergeItems(sourceIndex, targetIndex);
    return;
  }

  state.board[sourceIndex] = targetItemId;
  state.board[targetIndex] = sourceItemId;
  selectedCell = null;
  persistState();
  render();
}

function createDragGhost(sourceIndex) {
  const sourceTile = getTileElement(sourceIndex);
  if (!sourceTile) return;

  const rect = sourceTile.getBoundingClientRect();
  const ghost = sourceTile.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.classList.remove("dragging", "drop-target", "selected", "discovery");
  ghost.removeAttribute("data-index");
  ghost.removeAttribute("title");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;

  elements.dragLayer.innerHTML = "";
  elements.dragLayer.appendChild(ghost);
  dragState.ghost = ghost;
  moveDragGhost(dragState.startX, dragState.startY);
}

function moveDragGhost(x, y) {
  if (!dragState?.ghost) return;
  dragState.ghost.style.left = `${x}px`;
  dragState.ghost.style.top = `${y}px`;
}

function updateDropTarget(x, y) {
  const pointTarget = document.elementFromPoint(x, y);
  const trashHit = pointTarget?.closest("#trashBin");
  if (trashHit) {
    if (dragState.targetIndex !== null) {
      getTileElement(dragState.targetIndex)?.classList.remove("drop-target");
    }
    dragState.targetIndex = null;
    dragState.targetKind = "trash";
    elements.trashBin.classList.add("trash-target");
    return;
  }

  elements.trashBin.classList.remove("trash-target");
  const hit = pointTarget?.closest(".tile");
  const nextTarget = hit ? Number(hit.dataset.index) : null;
  if (dragState.targetIndex === nextTarget && dragState.targetKind === "board") return;

  if (dragState.targetIndex !== null) {
    getTileElement(dragState.targetIndex)?.classList.remove("drop-target");
  }
  dragState.targetIndex = Number.isInteger(nextTarget) ? nextTarget : null;
  dragState.targetKind = "board";
  if (dragState.targetIndex !== null && dragState.targetIndex !== dragState.sourceIndex) {
    getTileElement(dragState.targetIndex)?.classList.add("drop-target");
  }
}

function cleanupDragState() {
  if (!dragState) return;
  clearPendingTileDetail();
  getTileElement(dragState.sourceIndex)?.classList.remove("dragging");
  if (dragState.targetIndex !== null) {
    getTileElement(dragState.targetIndex)?.classList.remove("drop-target");
  }
  elements.trashBin.classList.remove("trash-target");
  elements.dragLayer.innerHTML = "";
  dragState = null;
  window.removeEventListener("pointermove", handleGlobalPointerMove);
  window.removeEventListener("pointerup", handleGlobalPointerUp);
  window.removeEventListener("pointercancel", handleGlobalPointerUp);
}

function clearPendingTileDetail() {
  if (!dragState?.detailHoldTimer) return;
  window.clearTimeout(dragState.detailHoldTimer);
  dragState.detailHoldTimer = null;
}

function discardBoardItem(index) {
  const itemId = state.board[index];
  if (!itemId) return;

  const item = itemIndex[itemId];
  state.board[index] = null;
  selectedCell = null;
  setAssistantReaction({
    mood: item.chainId === "waste" ? "serious" : "angry",
    badge: item.chainId === "waste" ? "台面整理" : "及时清场",
    line:
      item.chainId === "waste"
        ? `这份${item.name}清掉得对，先把工作台空格留给可继续推进的货。`
        : `我先记一下，${item.name}已经腾出位置了。接下来尽量别让关键材料也被挤掉。`,
    focus: "今日重点：保持台面通畅",
    status: "店铺状态：正在整理",
  });
  persistState();
  render();
  showToast(
    item.chainId === "waste" ? "废料已清理" : "材料已丢弃",
    item.chainId === "waste"
      ? `「${item.name}」已经扔进垃圾桶，工作台腾出了一格。`
      : `「${item.name}」已经被丢弃，工作台腾出了一格。`,
  );
}

function getTileElement(index) {
  return elements.board.querySelector(`[data-index="${index}"]`);
}

function getMergePlan(firstId, secondId) {
  if (!firstId || !secondId) return null;
  const firstItem = itemIndex[firstId];
  const secondItem = itemIndex[secondId];
  if (!firstItem || !secondItem) return null;

  if (firstId === secondId) {
    if (!canAdvanceItem(firstId)) return null;
    return {
      mode: "match",
      resultItemId: advanceItemId(firstId, 1),
      rewardGold: 3 + firstItem.tier,
      toastTitle: "合成成功",
      toastBody: `你做出了「${itemIndex[advanceItemId(firstId, 1)].name}」`,
    };
  }

  if (
    !firstItem.blendable ||
    !secondItem.blendable ||
    firstItem.tier !== secondItem.tier ||
    firstItem.chainId === secondItem.chainId
  ) {
    return null;
  }

  const recipe = mixedRecipeMap[normalizePairKey(firstId, secondId)];
  if (recipe) {
    return {
      mode: "recipe",
      resultItemId: recipe.resultItemId,
      rewardGold: 6 + firstItem.tier * 2,
      toastTitle: "秘方解锁",
      toastBody: `你拼出了「${itemIndex[recipe.resultItemId].name}」`,
      rareEventTitle: recipe.title,
      rareEventBody: recipe.body,
    };
  }

  const wasteItemId = `waste-${Math.min(firstItem.tier, itemIndex["waste-6"].tier)}`;
  return {
    mode: "waste",
    resultItemId: wasteItemId,
    rewardGold: 1,
    toastTitle: "试配失败",
    toastBody: `这次混料只留下了「${itemIndex[wasteItemId].name}」`,
  };
}

function canMerge(firstId, secondId) {
  return Boolean(getMergePlan(firstId, secondId));
}

function mergeItems(sourceIndex, targetIndex) {
  const sourceItem = itemIndex[state.board[sourceIndex]];
  const targetItem = itemIndex[state.board[targetIndex]];
  const mergePlan = getMergePlan(sourceItem?.id, targetItem?.id);
  if (!mergePlan) return;
  let resultItemId = mergePlan.resultItemId;

  state.board[sourceIndex] = null;
  state.board[targetIndex] = resultItemId;
  selectedCell = null;
  state.dailyStats.mergesCompleted += 1;

  registerDiscovery(resultItemId);

  const blessing = getDailyBlessing();
  if (
    mergePlan.mode === "match" &&
    blessing.id === "cauldron" &&
    sourceItem.chainId === "alchemy" &&
    Math.random() < 0.22 &&
    canAdvanceItem(resultItemId)
  ) {
    resultItemId = advanceItemId(resultItemId, 1);
    state.board[targetIndex] = resultItemId;
    registerDiscovery(resultItemId);
    triggerRareEvent(`${blessing.title}`, `这次合成额外跳到了「${itemIndex[resultItemId].name}」。`);
  }

  if (mergePlan.mode === "match" && itemIndex[resultItemId].tier >= 3 && Math.random() < 0.08) {
    state.gold += 18;
    recordDailyGain(18);
    triggerRareEvent("好运掠过", "你抓到了一阵好运，额外获得 18 金币。");
  }

  if (mergePlan.rewardGold > 0) {
    state.gold += mergePlan.rewardGold;
    recordDailyGain(mergePlan.rewardGold);
  }
  if (mergePlan.rareEventTitle) {
    triggerRareEvent(mergePlan.rareEventTitle, mergePlan.rareEventBody);
  }

  const resultItem = itemIndex[resultItemId];
  if (mergePlan.mode === "recipe") {
    setAssistantReaction({
      mood: "smile",
      badge: "秘方命中",
      line: `这次试配对了，我们真的做出了${resultItem.name}。这种组合值得继续记进店里的隐藏配方册。`,
      focus: "今日重点：继续试配稀有组合",
      status: "店铺状态：发现新秘方",
    });
  } else if (mergePlan.mode === "waste") {
    setAssistantReaction({
      mood: "confused",
      badge: "差点翻车",
      line: `这组材料没有稳定成货，只剩下${resultItem.name}。先清一清台面，再换别的同级组合试。`,
      focus: "今日重点：避开无效试配",
      status: "店铺状态：发生小事故",
    });
  } else {
    setAssistantReaction({
      mood: resultItem.tier >= 4 ? "smile" : "serious",
      badge: resultItem.tier >= 4 ? "合成漂亮" : "推进成功",
      line: `很好，${sourceItem.name}已经顺利推进成${resultItem.name}了。再沿着这条线往上做，订单价值会更高。`,
      focus: "今日重点：把一条货线继续做高",
      status: "店铺状态：节奏顺畅",
    });
  }
  persistState();
  render();
  showToast(mergePlan.toastTitle, mergePlan.toastBody || `你做出了「${itemIndex[resultItemId].name}」`);
}

function registerDiscovery(itemId) {
  state.lastNewItemId = itemId;
  if (!state.discoveries.includes(itemId)) {
    state.discoveries.push(itemId);
    state.dailyStats.discoveriesMade += 1;
    if (itemIndex[itemId].rare) {
      addShelfItem(itemId);
    }
    showToast("发现新物件", `「${itemIndex[itemId].name}」已加入收集册`);
    return;
  }

  if (itemIndex[itemId].rare) {
    addShelfItem(itemId);
  }
}

function addShelfItem(itemId) {
  state.shelf = [itemId, ...state.shelf.filter((entry) => entry !== itemId)].slice(
    0,
    MAX_SHELF_ITEMS,
  );
}

function conjureFromSource(sourceId) {
  const level = getLevel();
  const sourceConfig = sourceConfigs.find((entry) => entry.id === sourceId);
  const sourceState = state.sources[sourceId];
  if (!sourceConfig || level < sourceConfig.unlockLevel || sourceState.charges <= 0) return;

  if (state.gold < sourceConfig.cost) {
    setAssistantReaction({
      mood: "angry",
      badge: "预算不够",
      line: `${sourceConfig.name}这批货还差一点金币。先交一单或者合成出更高价货，再回来补也来得及。`,
      focus: "今日重点：先补金币",
      status: "店铺状态：补货被卡住",
    });
    renderAssistant();
    showToast("金币不够", `${sourceConfig.name} 每次补货需要 ${sourceConfig.cost} 金币。`);
    return;
  }

  const emptyIndex = state.board.findIndex((cell) => cell === null);
  if (emptyIndex === -1) {
    setAssistantReaction({
      mood: "confused",
      badge: "台面太满",
      line: "工作台已经塞满了。先合成、挪动，或者把废料拖进垃圾桶，不然新货放不下来。",
      focus: "今日重点：先腾格子",
      status: "店铺状态：台面拥堵",
    });
    renderAssistant();
    showToast("工作台满了", "先挪一挪或合成一下，再继续补货。");
    return;
  }

  state.gold -= sourceConfig.cost;
  recordDailySpend(sourceConfig.cost);
  sourceState.charges -= 1;
  sourceState.lastChargeAt = Date.now();

  const blessing = getDailyBlessing();
  let itemId = sourceConfig.baseItemId;

  if (blessing.id === "greenhouse" && sourceId === "botanical" && Math.random() < 0.28) {
    itemId = "botanical-2";
    triggerRareEvent(`${sourceConfig.name}补货走运`, `${sourceConfig.name}今天格外给力，直接掉出更高一级的货。`);
  }

  if (Math.random() < 0.1 && canAdvanceItem(itemId)) {
    itemId = advanceItemId(itemId, 1);
    triggerRareEvent("补货好运", `补货时闪过一道好运，你直接拿到了「${itemIndex[itemId].name}」。`);
  }

  state.board[emptyIndex] = itemId;
  registerDiscovery(itemId);

  setAssistantReaction({
    mood: itemIndex[itemId].tier >= 2 ? "smile" : "serious",
    badge: itemIndex[itemId].tier >= 2 ? "补货走运" : "新货到台",
    line: `我把${itemIndex[itemId].name}放到工作台了。现在最适合顺手找同类材料往上合。`,
    focus: `今日重点：推进${itemIndex[itemId].chainLabel}货线`,
    status: "店铺状态：货源刚补进来",
  });

  if (blessing.id === "owl" && sourceId === "curio" && Math.random() < 0.32) {
    const bonusIndex = state.board.findIndex((cell, index) => index !== emptyIndex && cell === null);
    if (bonusIndex !== -1) {
      state.board[bonusIndex] = sourceConfig.baseItemId;
      registerDiscovery(sourceConfig.baseItemId);
      triggerRareEvent("额外回货", `${sourceConfig.name}里又多掉出来一件额外的小货。`);
    }
  }

  persistState();
  render();
}

function rushSourceCharge(sourceId) {
  const level = getLevel();
  const sourceConfig = sourceConfigs.find((entry) => entry.id === sourceId);
  const sourceState = state.sources[sourceId];
  if (!sourceConfig || !sourceState || level < sourceConfig.unlockLevel) return;

  if (sourceState.charges >= sourceConfig.maxCharges) {
    setAssistantReaction({
      mood: "serious",
      badge: "储备已满",
      line: `${sourceConfig.name}现在已经满补货了，先把手上的次数用掉，再决定要不要继续加急。`,
      focus: "今日重点：先消耗现有补货",
      status: "店铺状态：储备充足",
    });
    renderAssistant();
    showToast("次数已满", `${sourceConfig.name} 现在已经是满补货状态。`);
    return;
  }

  const refreshCost = getSourceRefreshCost(sourceId);
  if (state.gold < refreshCost) {
    setAssistantReaction({
      mood: "angry",
      badge: "金库存疑",
      line: `加急${sourceConfig.name}还差一点金币。现在更适合先完成委托，再回来用钱换节奏。`,
      focus: "今日重点：先赚金币",
      status: "店铺状态：加急失败",
    });
    renderAssistant();
    showToast("金币不够", `加急恢复 ${sourceConfig.name} 需要 ${refreshCost} 金币。`);
    return;
  }

  state.gold -= refreshCost;
  recordDailySpend(refreshCost);
  sourceState.charges = Math.min(sourceConfig.maxCharges, sourceState.charges + 1);
  sourceState.lastChargeAt = Date.now();

  setAssistantReaction({
    mood: "serious",
    badge: "加急处理中",
    line: `${sourceConfig.name}已经被我催回一批补货机会了。金币花得值，现在可以继续推盘面。`,
    focus: "今日重点：用金币换节奏",
    status: "店铺状态：补给加急中",
  });
  persistState();
  render();
  showToast("加急补货", `${sourceConfig.name} 立即恢复了 1 次补货机会。`);
}

function countItem(itemId) {
  return state.board.filter((entry) => entry === itemId).length;
}

function canFulfillOrder(order) {
  return order.requirements.every((requirement) => countItem(requirement.itemId) >= requirement.count);
}

function fulfillOrder() {
  if (!canFulfillOrder(state.order)) return;

  const rewardGold = state.order.rewardGold;
  const rewardXp = state.order.rewardXp;

  state.order.requirements.forEach((requirement) => {
    let remaining = requirement.count;
    for (let index = 0; index < state.board.length && remaining > 0; index += 1) {
      if (state.board[index] === requirement.itemId) {
        state.board[index] = null;
        remaining -= 1;
      }
    }
  });

  state.gold += rewardGold;
  state.xp += rewardXp;
  state.completedOrders += 1;
  state.dailyStats.ordersCompleted += 1;
  recordDailyGain(rewardGold);
  selectedCell = null;

  const previousLevel = getLevelFromXp(state.xp - rewardXp);
  const currentLevel = getLevel();
  if (currentLevel > previousLevel) {
    unlockSourcesForLevel(currentLevel);
    state.dailyStats.upgradesGained += currentLevel - previousLevel;
    showToast("店铺升级", `已升到 ${currentLevel} 级，新区域可能已经解锁。`);
  }

  if (Math.random() < 0.12) {
    const sourceName = grantRandomCharge();
    if (sourceName) {
      triggerRareEvent("活点地图线索", `${sourceName} 的补货次数额外恢复了 1 次。`);
    }
  }

  const blessing = getDailyBlessing();
  if (blessing.id === "owl" && Math.random() < 0.28) {
    const sourceName = grantRandomCharge();
    if (sourceName) {
      triggerRareEvent("返货机会", `完成委托后，${sourceName} 额外返还了 1 次补货机会。`);
    }
  }

  setAssistantReaction({
    mood: "smile",
    badge: "交单顺利",
    line: `${state.order.client.name}这一单已经结清了。金币和经验都到账，继续按这个节奏滚下去就行。`,
    focus: "今日重点：续上下一张委托",
    status: currentLevel > previousLevel ? `店铺状态：已升到 ${currentLevel} 级` : "店铺状态：委托已完成",
  });
  showToast("委托完成", `${state.order.client.name} 很满意，你收到 ${rewardGold} 金币。`);
  state.order = createOrder({
    completedOrders: state.completedOrders,
    discoveries: state.discoveries,
    level: currentLevel,
  });

  if (state.completedOrders === 1) {
    state.pendingReport = createOpeningReport();
  }

  persistState();
  render();
}

function refreshOrder() {
  if (state.gold < 6) {
    setAssistantReaction({
      mood: "angry",
      badge: "先别换单",
      line: "现在金币不够刷新委托，先做点现成的进展更划算。",
      focus: "今日重点：先保住金币",
      status: "店铺状态：无法刷新委托",
    });
    renderAssistant();
    showToast("金币不够", "刷新委托需要 6 金币。");
    return;
  }

  state.gold -= 6;
  recordDailySpend(6);
  state.order = createOrder({
    completedOrders: state.completedOrders,
    discoveries: state.discoveries,
    level: getLevel(),
  });
  setAssistantReaction({
    mood: "serious",
    badge: "重新筛单",
    line: "我把旧委托先压下去了，换了一张更适合当前盘面的新订单，看看这一张能不能顺手完成。",
    focus: "今日重点：挑更顺手的订单",
    status: "店铺状态：委托已刷新",
  });
  persistState();
  render();
}

function unlockSourcesForLevel(level) {
  sourceConfigs.forEach((source) => {
    const sourceState = state.sources[source.id];
    if (level >= source.unlockLevel && sourceState.charges === 0) {
      sourceState.charges = source.maxCharges;
      sourceState.lastChargeAt = Date.now();
    }
  });
}

function createOrder({ completedOrders, discoveries, level }) {
  const firstSource = sourceConfigs[0] || { shortLabel: "首批", name: "首批货源" };
  const secondSource = sourceConfigs[1] || firstSource;
  const scriptedOrders = [
    {
      title: `${firstSource.shortLabel}起步单`,
      client: clientProfiles[1],
      requirements: [{ itemId: "botanical-2", count: 1 }],
      rewardGold: 18,
      rewardXp: 2,
    },
    {
      title: `${firstSource.shortLabel}补货包`,
      client: clientProfiles[1],
      requirements: [
        { itemId: "botanical-1", count: 2 },
        { itemId: "botanical-2", count: 1 },
      ],
      rewardGold: 24,
      rewardXp: 2,
    },
    {
      title: `${secondSource.shortLabel}预备单`,
      client: clientProfiles[0],
      requirements: [{ itemId: "alchemy-1", count: 2 }],
      rewardGold: 22,
      rewardXp: 1,
    },
  ];

  if (completedOrders < scriptedOrders.length) {
    return scriptedOrders[completedOrders];
  }

  const unlockedChains = sourceConfigs
    .filter((source) => level >= source.unlockLevel)
    .map((source) => source.id);

  const pool = discoveries
    .map((itemId) => itemIndex[itemId])
    .filter((item) => unlockedChains.includes(item.chainId) && item.tier >= 1 && item.tier <= Math.min(5, level + 2));

  const fallback = pool.length ? pool : [itemIndex["botanical-2"]];
  const firstItem = fallback[Math.floor(Math.random() * fallback.length)];
  const requirements = [];

  if (Math.random() < 0.4 || firstItem.tier === 1) {
    const baseCount = firstItem.tier === 1 ? 2 : 1;
    requirements.push({
      itemId: firstItem.id,
      count: baseCount + (Math.random() < 0.22 ? 1 : 0),
    });
  } else {
    requirements.push({ itemId: firstItem.id, count: 1 });
  }

  if (completedOrders > 3 && Math.random() > 0.5) {
    const secondItem = fallback[Math.floor(Math.random() * fallback.length)];
    const secondCount = secondItem.tier === 1 && Math.random() > 0.45 ? 2 : 1;
    if (secondItem.id !== firstItem.id) {
      requirements.push({ itemId: secondItem.id, count: secondCount });
    } else {
      requirements[0].count += secondCount;
    }
  }

  const rewardBase = requirements.reduce((sum, requirement) => {
    return sum + itemIndex[requirement.itemId].tier * 10 * requirement.count;
  }, 10);

  const titleOptions = [
    `${firstSource.shortLabel}加急单`,
    `${secondSource.shortLabel}临时单`,
    `${runtimeConfig.shopName}采购单`,
    "高阶补货单",
    "陈列追加单",
  ];

  return {
    title: titleOptions[Math.floor(Math.random() * titleOptions.length)],
    client: clientProfiles[Math.floor(Math.random() * clientProfiles.length)],
    requirements,
    rewardGold: rewardBase + Math.floor(Math.random() * 8),
    rewardXp: requirements.length === 2 ? 2 : 1,
  };
}

function tickSources() {
  let changed = false;
  const now = Date.now();
  const level = getLevel();

  sourceConfigs.forEach((source) => {
    const sourceState = state.sources[source.id];
    if (level < source.unlockLevel) return;
    if (sourceState.charges >= source.maxCharges) return;

    const elapsed = now - sourceState.lastChargeAt;
    if (elapsed >= CHARGE_REGEN_MS) {
      const gained = Math.floor(elapsed / CHARGE_REGEN_MS);
      const nextCharges = Math.min(source.maxCharges, sourceState.charges + gained);
      if (nextCharges !== sourceState.charges) {
        sourceState.charges = nextCharges;
        sourceState.lastChargeAt = now;
        changed = true;
      }
    }
  });

  if (changed) {
    persistState();
    renderSources();
  }
}

function getNextChargeSeconds(sourceId) {
  const sourceConfig = sourceConfigs.find((source) => source.id === sourceId);
  const sourceState = state.sources[sourceId];
  if (!sourceConfig || sourceState.charges >= sourceConfig.maxCharges) return 0;
  const elapsed = Date.now() - sourceState.lastChargeAt;
  return Math.max(1, Math.ceil((CHARGE_REGEN_MS - elapsed) / 1000));
}

function getSourceRefreshCost(sourceId) {
  const sourceConfig = sourceConfigs.find((source) => source.id === sourceId);
  if (!sourceConfig) return 0;
  return sourceConfig.cost * 2;
}

function getLevelFromXp(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function buildWorldTickerText(blessing, latestEvent) {
  if (latestEvent) {
    return `最新异象：${latestEvent.title}。${latestEvent.body}`;
  }

  if (state.completedOrders === 0) {
    return `开张指引：先从${getPrimarySource().name}补第一批货，把两份同类材料往上合，再完成今天的第一张委托。`;
  }

  if (getLevel() < 2) {
    const nextSource = getNextUnlockSource();
    return nextSource
      ? `经营建议：继续交单攒经验，尽快升到 ${nextSource.unlockLevel} 级，把${nextSource.name}接进店里。`
      : "经营建议：继续交单、补货和扩盘面，把店里的货线都往高阶推进。";
  }

  if (!state.shelf.length) {
    return "经营建议：优先把一条货线推到 4 级以上，同时开始尝试同级异材配方，争取做出第一件收藏。";
  }

  return `今日风向：${blessing.title}。${blessing.description}`;
}

function showToast(title, body) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.toastId = String((toastId += 1));
  toast.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
  elements.toastStack.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prepareCurrentDayState() {
  const todayKey = getTodayKey();
  if (state.openedDayKey === todayKey) return;

  const yesterdayStats = {
    ...createEmptyDailyStats(state.openedDayKey),
    ...(state.dailyStats || {}),
  };
  const netIncome = yesterdayStats.goldEarned - yesterdayStats.goldSpent;
  const hadMeaningfulProgress =
    yesterdayStats.goldEarned > 0 ||
    yesterdayStats.goldSpent > 0 ||
    yesterdayStats.ordersCompleted > 0 ||
    yesterdayStats.discoveriesMade > 0 ||
    yesterdayStats.mergesCompleted > 0;

  state.pendingReport = hadMeaningfulProgress
    ? createReport("daily", yesterdayStats.dayKey, {
        title: "新的一天开始了",
        subtitle: "昨晚关店后，账本和货架已经整理完毕。今天可以继续接单、补货和冲更高等级的货品。",
        assistantLine:
          `${runtimeConfig.assistantName}：昨天的结算我已经替你记好了。今天的订单和补给都重新准备完毕，可以直接开店。`,
        metricLabelA: "净收入",
        metricValueA: `${netIncome >= 0 ? "+" : ""}${netIncome}`,
        metricLabelB: "完成订单",
        metricValueB: String(yesterdayStats.ordersCompleted),
        metricLabelC: "新发现",
        metricValueC: String(yesterdayStats.discoveriesMade),
        buttonLabel: "开始今天营业",
      })
    : null;

  state.openedDayKey = todayKey;
  state.dailyStats = createEmptyDailyStats(todayKey);
  state.lastRareEvent = null;
  refillUnlockedSources();
  state.order = createOrder({
    completedOrders: state.completedOrders,
    discoveries: state.discoveries,
    level: getLevel(),
  });
  persistState();
}

function hashString(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 2147483647;
  }
  return hash;
}

function getDailyBlessing() {
  const key = getTodayKey();
  const index = hashString(key) % dailyBlessings.length;
  return dailyBlessings[index];
}

function normalizePairKey(firstId, secondId) {
  return [firstId, secondId].sort().join("+");
}

function canAdvanceItem(itemId) {
  const item = itemIndex[itemId];
  return Boolean(item) && item.tier < item.maxTier;
}

function refillUnlockedSources() {
  const level = getLevel();
  sourceConfigs.forEach((source) => {
    const sourceState = state.sources[source.id];
    if (level < source.unlockLevel) return;
    sourceState.charges = source.maxCharges;
    sourceState.lastChargeAt = Date.now();
  });
}

function advanceItemId(itemId, steps = 1) {
  let currentId = itemId;
  for (let step = 0; step < steps; step += 1) {
    const currentItem = itemIndex[currentId];
    if (!currentItem || currentItem.tier >= currentItem.maxTier) break;
    currentId = `${currentItem.chainId}-${currentItem.tier + 1}`;
  }
  return currentId;
}

function grantRandomCharge() {
  const level = getLevel();
  const availableSources = sourceConfigs.filter((source) => level >= source.unlockLevel);
  if (!availableSources.length) return null;

  const pickedSource = availableSources[Math.floor(Math.random() * availableSources.length)];
  const sourceState = state.sources[pickedSource.id];
  sourceState.charges = Math.min(sourceState.maxCharges, sourceState.charges + 1);
  sourceState.lastChargeAt = Date.now();
  return pickedSource.name;
}

function triggerRareEvent(title, body) {
  state.lastRareEvent = {
    title,
    body,
    day: getTodayKey(),
  };
  setAssistantReaction({
    mood: title.includes("误投") || title.includes("返件") ? "confused" : "smile",
    badge: "突发异象",
    line: `${title}。这类变化往往会把节奏推快一点，先顺着它带来的机会继续做。`,
    focus: "今日重点：接住异象红利",
    status: "店铺状态：刚出现异象",
  });
  showToast(title, body);
}

function recordDailyGain(amount) {
  state.dailyStats.goldEarned += amount;
}

function recordDailySpend(amount) {
  state.dailyStats.goldSpent += amount;
}

function createOpeningReport() {
  return createReport("opening", getTodayKey(), {
    title: "开张成功",
    subtitle: `你的第一张订单已经顺利完成，${runtimeConfig.shopName}现在正式开始稳定运转。`,
    assistantLine:
      `${runtimeConfig.assistantName}：第一单已经跑通，接下来就是重复进货、合成、交单，再把店面一点点升级起来。`,
    metricLabelA: "现有金币",
    metricValueA: String(state.gold),
    metricLabelB: "完成订单",
    metricValueB: String(state.completedOrders),
    metricLabelC: "店铺等级",
    metricValueC: String(getLevel()),
    buttonLabel: "继续经营",
  });
}

function getShopRankTier() {
  const level = getLevel();
  if (level >= 7) return 4;
  if (level >= 5) return 3;
  if (level >= 2) return 2;
  return 1;
}

function getShopRankLabel() {
  const tier = getShopRankTier();
  if (tier === 4) return "招牌店";
  if (tier === 3) return "热门店";
  if (tier === 2) return "试营业中";
  return "筹备开张";
}
