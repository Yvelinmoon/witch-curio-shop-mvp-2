(function () {
  const DEFAULTS = {
    worldName: "你的世界",
  };
  const REQUEST_TIMEOUT_MS = 60_000;
  const CONCEPT_LLM_TIMEOUT_MS = 120_000;
  const DIRECT_LLM_RETRY_COUNT = 3;
  const DIRECT_LLM_RETRY_BASE_MS = 1200;
  const BUILD_COMPLETION_POLL_INTERVAL_MS = 1800;
  const SAVE_KEY = window.__SHOP_SAVE_KEY__ || "witch-curio_shop_mvp_v5_builder";
  const ARCHIVE_PREFIX = `${SAVE_KEY}:archive:`;
  const DEFAULT_CREATOR_THEME = {
    bgTop: "#faefc9",
    bgBottom: "#d7b57c",
    paper: "#fff7e7",
    paperSoft: "#f5ead0",
    gold: "#c78e2a",
    shopBgTop: "#faefc9",
    shopBgMid: "#f5dfa1",
    shopBgBottom: "#d0ab71",
    shopLight: "#f6d88f",
    shopLightSoft: "rgba(246, 216, 143, 0.24)",
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
  const THEME_TOKEN_KEYS = Object.keys(DEFAULT_CREATOR_THEME);
  const BUILD_PROGRESS_STEPS = [
    { id: "theme", label: "主题定好", matches: ["定下店铺氛围"] },
    { id: "portrait", label: "助手到位", matches: ["等待店员到来", "店员到位"] },
    { id: "content", label: "清单写好", matches: ["书写货源与委托", "货源委托就绪"] },
    { id: "goods", label: "货物就绪", matches: ["准备第一批货物", "摆放第一批货物"] },
    { id: "decor", label: "装饰就绪", matches: ["挑选店面装饰", "店面装饰就绪", "准备入口小牌", "入口小牌就绪"] },
    { id: "verify", label: "校验开张", matches: ["清点开张用品", "开张用品已入店", "缺件已补齐"] },
  ];

  const BUILD_EVENT_COPY = {
    "连接远方回执": "开店信已经送出，正在等回信确认谁来接手准备。",
    "核对开张清单": "正在核对开店清单：店名、店员、货物、装饰和入口小牌都要准备好。",
    "等待开店信回执": "开店信已经送到路上，等有人接信后就开始准备店铺。",
    "开店信已接下": "开店信已经有人接下，接下来会按清单准备这家店。",
    "排开开张清单": "正在把开店清单排好：先请店员到岗，再准备货物和装饰。",
    "定下店铺氛围": "正在确定这家店的主色、灯光、柜台材质和整体氛围。",
    "等待店员到来": "店员正在赶来上班，到了之后会先在这里和你说话。",
    "店员到位": "我到岗了，先替你看住柜台。后面每一步准备进度，我都会告诉你。",
    "书写货源与委托": "正在写第一批货源、材料名称、客人委托和店内提示。",
    "货源委托就绪": "第一批货源和委托已经写好，进店后你能直接看到。",
    "准备第一批货物": "正在准备第一批可合成的货物图片，让工作台有东西可摆。",
    "摆放第一批货物": "正在把货物逐件切好并放进工作台格子。",
    "挑选店面装饰": "正在准备店面装饰贴纸，之后可以拖动摆在工作台区域。",
    "店面装饰就绪": "店面装饰已经准备好，进店后可以用来布置你的店。",
    "准备入口小牌": "正在准备大厅、图鉴、收藏、重开和垃圾桶这些入口小牌。",
    "入口小牌就绪": "入口小牌已经准备好，进店后会换成这家店自己的样式。",
    "清点开张用品": "正在最后清点：店员、货物、文本、装饰和按钮小牌是否都齐了。",
    "开张用品已入店": "开店要用的东西都齐了，正在搬进店里。",
    "缺件已补齐": "缺少的开店物品已经补齐，准备继续。",
  };

  const elements = {
    page: document.getElementById("creatorOverlay"),
    appShell: document.getElementById("appShell"),
    title: document.getElementById("creatorTitle"),
    worldEyebrow: document.getElementById("creatorWorldEyebrow"),
    narration: document.getElementById("creatorNarration"),
    phaseChip: document.getElementById("creatorPhaseChip"),
    ideaStep: document.getElementById("creatorIdeaStep"),
    confirmStep: document.getElementById("creatorConfirmStep"),
    buildingStep: document.getElementById("creatorBuildingStep"),
    shopIdeaInput: document.getElementById("shopIdeaInput"),
    generateConceptButton: document.getElementById("generateConceptButton"),
    backToIdeaButton: document.getElementById("backToIdeaButton"),
    startBuildButton: document.getElementById("startBuildButton"),
    conceptShopName: document.getElementById("conceptShopName"),
    conceptSummary: document.getElementById("conceptSummary"),
    conceptAssistantName: document.getElementById("conceptAssistantName"),
    conceptAssistantSummary: document.getElementById("conceptAssistantSummary"),
    conceptLoopSummary: document.getElementById("conceptLoopSummary"),
    loadingAssistantPortrait: document.getElementById("loadingAssistantPortrait"),
    portraitLoadingCard: document.getElementById("portraitLoadingCard"),
    portraitLoadingTitle: document.getElementById("portraitLoadingTitle"),
    portraitLoadingStatus: document.getElementById("portraitLoadingStatus"),
    loadingAssistantName: document.getElementById("loadingAssistantName"),
    loadingAssistantRole: document.getElementById("loadingAssistantRole"),
    buildProgress: document.getElementById("creatorBuildProgress"),
    buildProgressMeta: document.getElementById("creatorBuildProgressMeta"),
    buildProgressFill: document.getElementById("creatorBuildProgressFill"),
    buildProgressSteps: document.getElementById("creatorBuildProgressSteps"),
    creatorVisualNovel: document.getElementById("creatorVisualNovel"),
    creatorDialogueCard: document.getElementById("creatorDialogueCard"),
    loadingDialogueSpeaker: document.getElementById("loadingDialogueSpeaker"),
    loadingDialogueText: document.getElementById("loadingDialogueText"),
    playerPromptEcho: document.getElementById("playerPromptEcho"),
    toggleHistoryButton: document.getElementById("toggleHistoryButton"),
    historyPanel: document.getElementById("historyPanel"),
    historyList: document.getElementById("historyList"),
    loadingChatInput: document.getElementById("loadingChatInput"),
    loadingInputRow: document.getElementById("loadingInputRow"),
    sendLoadingChatButton: document.getElementById("sendLoadingChatButton"),
    buildRecoveryRow: document.getElementById("buildRecoveryRow"),
    retryBuildButton: document.getElementById("retryBuildButton"),
    reviseBuildButton: document.getElementById("reviseBuildButton"),
    buildActionRow: document.getElementById("buildActionRow"),
    enterShopButton: document.getElementById("enterShopButton"),
    rebuildShopButton: document.getElementById("rebuildShopButton"),
    netaAuthStatus: document.getElementById("netaAuthStatus"),
    netaAuthHint: document.getElementById("netaAuthHint"),
    creatorAgentHint: document.getElementById("creatorAgentHint"),
    creatorHallButton: document.getElementById("creatorHallButton"),
    llmProbeButton: document.getElementById("llmProbeButton"),
    llmProbeResult: document.getElementById("llmProbeResult"),
    creatorLlmStatus: document.getElementById("creatorLlmStatus"),
    netaAuthButton: document.getElementById("netaAuthButton"),
    toastStack: document.getElementById("toastStack"),
  };

  const state = {
    defaults: DEFAULTS,
    concept: null,
    buildReady: false,
    buildBlocked: false,
    buildFailed: false,
    timers: [],
    history: [],
    buildTimeline: [],
    historyOpen: false,
    jobId: null,
    sessionId: null,
    currentStageLabel: "",
    buildStream: null,
    buildCompletionPollTimer: null,
    buildCompletionPollInFlight: false,
    loadingLoopTimer: null,
    agentMeta: null,
    portraitReady: false,
    portraitLoadingActive: false,
  };

  if (!elements.page || !elements.appShell) return;

  function clearTimers() {
    state.timers.forEach((timer) => window.clearTimeout(timer));
    state.timers = [];
  }

  function schedule(fn, delay) {
    const timer = window.setTimeout(fn, delay);
    state.timers.push(timer);
  }

  function closeBuildStream() {
    if (!state.buildStream) return;
    state.buildStream.close();
    state.buildStream = null;
  }

  function stopBuildCompletionPolling() {
    if (!state.buildCompletionPollTimer) return;
    window.clearInterval(state.buildCompletionPollTimer);
    state.buildCompletionPollTimer = null;
    state.buildCompletionPollInFlight = false;
  }

  function shouldPollForBuildCompletion(label = "", status = "") {
    const normalizedLabel = String(label || "");
    return status === "done" && BUILD_PROGRESS_STEPS.at(-1).matches.some((token) => normalizedLabel.includes(token));
  }

  function archiveCurrentShop(name = "ollivanders") {
    if (typeof window.exportShopArchive !== "function") return false;
    const archive = window.exportShopArchive();
    window.localStorage.setItem(`${ARCHIVE_PREFIX}${name}`, JSON.stringify(archive));
    console.log("[creator] archive:saved", {
      name,
      shopName: archive.runtimeConfig?.shopName || null,
      archivedAt: archive.archivedAt,
    });
    return true;
  }

  function restoreShopArchive(name = "ollivanders") {
    const raw = window.localStorage.getItem(`${ARCHIVE_PREFIX}${name}`);
    if (!raw) return false;
    if (typeof window.importShopArchive !== "function") return false;
    window.importShopArchive(JSON.parse(raw));
    console.log("[creator] archive:restored", { name });
    return true;
  }

  function pushBuildTimeline(entry) {
    state.buildTimeline.push({
      at: new Date().toISOString(),
      ...entry,
    });
  }

  function buildClientBuildSummary(session) {
    const concept = session?.concept || state.concept || {};
    return {
      jobId: state.jobId,
      sessionId: session?.sessionId || state.sessionId || null,
      shopIdea: concept.shopIdea || state.concept?.shopIdea || null,
      shopName: concept.shopName || null,
      assistantName: concept.assistantName || null,
      assistantRole: concept.assistantRole || null,
      status: session?.status || null,
      agent: session?.sources?.agent || state.agentMeta?.label || null,
      sources: session?.sources || null,
      localWorker: session?.profile?.localWorker || null,
      runtimeConfig: session
        ? {
            shopName: session.runtimeConfig?.shopName || null,
            tileAssetBase: session.runtimeConfig?.tileAssetBase || null,
            assistantRole: session.runtimeConfig?.assistantRole || null,
          }
        : null,
      timeline: state.buildTimeline.slice(),
    };
  }

  function stopLoadingLoop() {
    if (!state.loadingLoopTimer) return;
    window.clearInterval(state.loadingLoopTimer);
    state.loadingLoopTimer = null;
  }

  function loadingSuffix(frame) {
    return ".".repeat((frame % 3) + 1);
  }

  function getGameStageText(payload = {}, fallback = "柜台正在准备中") {
    const label = String(payload.label || "");
    return BUILD_EVENT_COPY[label] || payload.text || label || fallback;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function isTransientDirectLlmError(error) {
    const message = String(error?.message || "");
    return (
      /fetch failed/i.test(message) ||
      /networkerror/i.test(message) ||
      /network request failed/i.test(message) ||
      /load failed/i.test(message) ||
      /failed to fetch/i.test(message)
    );
  }

  function isRetryableDirectLlmStatus(status) {
    return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
  }

  function isSafeThemeColor(value) {
    const normalized = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return true;
    return /^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(normalized);
  }

  function pickCreatorTheme(input = "") {
    const value = String(input || "").toLowerCase();
    if (value.includes("tesla") || value.includes("特斯拉") || value.includes("电车") || value.includes("新能源")) {
      return {
        eyebrow: "未来车库",
        tokens: {
          bgTop: "#0b1118",
          bgBottom: "#1f2937",
          paper: "#e8eef5",
          paperSoft: "#c9d5e2",
          gold: "#e23a3a",
          shopBgTop: "#090f16",
          shopBgMid: "#111c29",
          shopBgBottom: "#263241",
          shopLight: "#dce8f6",
          shopLightSoft: "rgba(220, 232, 246, 0.18)",
          shopPanel: "#111c29",
          shopPanel2: "#1b2938",
          shopPaper: "#e8eef5",
          shopPaperSoft: "#c9d5e2",
          shopCard: "#f4f7fb",
          shopCardDark: "#324256",
          shopBorder: "#617186",
          shopBorderDark: "#05080c",
          shopGold: "#e23a3a",
          shopGoldSoft: "#ff7474",
          shopGreen: "#46c6a8",
          shopRed: "#d42f2f",
          shopText: "#edf4fb",
          shopInk: "#111827",
          shopMuted: "#9fb0c2",
        },
      };
    }
    if (value.includes("陈香贵") || value.includes("拉面") || value.includes("牛肉面") || value.includes("面馆")) {
      return {
        eyebrow: "热汤面台",
        tokens: {
          bgTop: "#3b170b",
          bgBottom: "#a64519",
          paper: "#fff0d0",
          paperSoft: "#f4c982",
          gold: "#e6a43a",
          shopBgTop: "#2a0f07",
          shopBgMid: "#6d2b12",
          shopBgBottom: "#a64519",
          shopLight: "#ffd27b",
          shopLightSoft: "rgba(255, 210, 123, 0.24)",
          shopPanel: "#5b230f",
          shopPanel2: "#783217",
          shopPaper: "#fff0d0",
          shopPaperSoft: "#f4c982",
          shopCard: "#fff6de",
          shopCardDark: "#a35123",
          shopBorder: "#c17834",
          shopBorderDark: "#2c0d05",
          shopGold: "#e6a43a",
          shopGoldSoft: "#ffd06d",
          shopGreen: "#5e8c49",
          shopRed: "#b83a1d",
          shopText: "#fff1d4",
          shopInk: "#361307",
          shopMuted: "#e5bd7d",
        },
      };
    }
    if (value.includes("火锅") || value.includes("海底捞") || value.includes("hotpot") || value.includes("锅")) {
      return {
        eyebrow: "热汤灶台",
        tokens: {
          bgTop: "#3f0f0d",
          bgBottom: "#b43a22",
          paper: "#fff0d6",
          paperSoft: "#ffd59a",
          gold: "#f0b84a",
          shopBgTop: "#3f0f0d",
          shopBgMid: "#7b1f18",
          shopBgBottom: "#b43a22",
          shopLight: "#ffcf75",
          shopLightSoft: "rgba(255, 207, 117, 0.24)",
          shopPanel: "#681b14",
          shopPanel2: "#8f2a1d",
          shopPaper: "#fff0d6",
          shopPaperSoft: "#ffd59a",
          shopCard: "#fff5df",
          shopCardDark: "#b84b2a",
          shopBorder: "#d68636",
          shopBorderDark: "#46110c",
          shopGold: "#f0b84a",
          shopGoldSoft: "#ffd77a",
          shopGreen: "#6c8d45",
          shopRed: "#c93b2f",
          shopText: "#fff0d6",
          shopInk: "#41110d",
          shopMuted: "#ffd59a",
        },
      };
    }
    if (value.includes("魔杖") || value.includes("wand") || value.includes("奥利凡德") || value.includes("ollivander")) {
      return {
        eyebrow: "魔杖匣柜",
        tokens: {
          bgTop: "#120b07",
          bgBottom: "#3b2415",
          paper: "#e7cf9b",
          paperSoft: "#d3b47a",
          gold: "#d8a642",
          shopBgTop: "#120b07",
          shopBgMid: "#24150d",
          shopBgBottom: "#3b2415",
          shopLight: "#f2c776",
          shopLightSoft: "rgba(242, 199, 118, 0.22)",
          shopPanel: "#2a190f",
          shopPanel2: "#3a2315",
          shopPaper: "#e7cf9b",
          shopPaperSoft: "#d3b47a",
          shopCard: "#ead7aa",
          shopCardDark: "#4b2d19",
          shopBorder: "#7a4a24",
          shopBorderDark: "#1b100a",
          shopGold: "#d8a642",
          shopGoldSoft: "#f0cf7a",
          shopGreen: "#556f46",
          shopRed: "#8d3c2f",
          shopText: "#f3e0b5",
          shopInk: "#3a2414",
          shopMuted: "#b89964",
        },
      };
    }
    return {
      eyebrow: "主题店铺",
      tokens: DEFAULT_CREATOR_THEME,
    };
  }

  function mergeCreatorTheme(baseTheme, generatedTheme = {}) {
    const baseTokens = baseTheme?.tokens || DEFAULT_CREATOR_THEME;
    const source = generatedTheme && typeof generatedTheme === "object" ? generatedTheme : {};
    const tokens = { ...baseTokens };
    THEME_TOKEN_KEYS.forEach((key) => {
      if (isSafeThemeColor(source[key])) {
        tokens[key] = String(source[key]).trim();
      }
    });
    tokens.bgTop ||= tokens.shopBgTop;
    tokens.bgBottom ||= tokens.shopBgBottom;
    tokens.paper ||= tokens.shopPaper;
    tokens.paperSoft ||= tokens.shopPaperSoft;
    tokens.gold ||= tokens.shopGold;
    return {
      eyebrow: typeof source.eyebrow === "string" && source.eyebrow.trim() ? source.eyebrow.trim() : baseTheme?.eyebrow || "主题店铺",
      tokens,
    };
  }

  function getMissingThemeTokens(runtimeConfig = {}) {
    const theme = runtimeConfig.theme || {};
    return THEME_TOKEN_KEYS.filter((key) => !isSafeThemeColor(theme[key]));
  }

  function hasCompleteTheme(runtimeConfig = {}) {
    return getMissingThemeTokens(runtimeConfig).length === 0;
  }

  function startLoadingLoop(renderFrame) {
    stopLoadingLoop();
    let frame = 0;
    renderFrame(frame);
    state.loadingLoopTimer = window.setInterval(() => {
      frame += 1;
      renderFrame(frame);
    }, 380);
  }

  function startPortraitLoading(baseText) {
    state.portraitLoadingActive = true;
    if (elements.creatorVisualNovel) {
      elements.creatorVisualNovel.dataset.mode = "portrait-loading";
    }
    if (elements.portraitLoadingCard) {
      elements.portraitLoadingCard.hidden = false;
    }
    if (elements.portraitLoadingTitle) {
      elements.portraitLoadingTitle.textContent = "店员正在路上";
    }
    if (!elements.portraitLoadingStatus) return;
    startLoadingLoop((frame) => {
      if (!state.portraitLoadingActive) return;
      elements.portraitLoadingStatus.textContent = `${baseText}${loadingSuffix(frame)}`;
    });
  }

  function stopPortraitLoading() {
    state.portraitLoadingActive = false;
    stopLoadingLoop();
    if (elements.creatorVisualNovel) {
      elements.creatorVisualNovel.dataset.mode = "dialogue";
    }
    if (elements.portraitLoadingCard) {
      elements.portraitLoadingCard.hidden = true;
    }
    if (elements.portraitLoadingStatus) {
      elements.portraitLoadingStatus.textContent = "";
    }
  }

  function getBuildProgressStepIndex(label = "") {
    const normalized = String(label || "");
    return BUILD_PROGRESS_STEPS.findIndex((step) =>
      step.matches.some((token) => normalized.includes(token)),
    );
  }

  function getBuildProgressSnapshot() {
    const stageEntries = state.buildTimeline.filter((item) => item.type === "stage");
    let highestSeen = -1;
    let lastMatchedStatus = null;
    const completedIndices = new Set();

    stageEntries.forEach((entry) => {
      const index = getBuildProgressStepIndex(entry.label);
      if (index < 0) return;
      highestSeen = index;
      lastMatchedStatus = entry.status || null;
      if (entry.status === "done") {
        completedIndices.add(index);
      }
    });

    let currentIndex = -1;
    let completedUntil = -1;

    if (state.buildReady) {
      completedUntil = BUILD_PROGRESS_STEPS.length - 1;
    } else if (highestSeen >= 0) {
      completedUntil = Math.max(...completedIndices, lastMatchedStatus === "done" ? highestSeen : highestSeen - 1);
      currentIndex =
        lastMatchedStatus === "done"
          ? Math.min(highestSeen + 1, BUILD_PROGRESS_STEPS.length - 1)
          : highestSeen;
    } else if (state.portraitLoadingActive) {
      currentIndex = 0;
    }

    if (state.buildBlocked || state.buildFailed) {
      currentIndex = currentIndex >= 0 ? currentIndex : Math.max(0, completedUntil + 1);
    }

    const steps = BUILD_PROGRESS_STEPS.map((step, index) => {
      let status = "pending";
      if (index <= completedUntil) {
        status = "completed";
      } else if (index === currentIndex) {
        status = state.buildFailed ? "failed" : state.buildBlocked ? "blocked" : "current";
      }
      return {
        ...step,
        index,
        status,
      };
    });

    const completedCount = steps.filter((step) => step.status === "completed").length;
    let activeIndex = currentIndex;
    if (state.buildReady) activeIndex = BUILD_PROGRESS_STEPS.length - 1;
    if (activeIndex < 0 && completedCount < BUILD_PROGRESS_STEPS.length) {
      activeIndex = Math.min(completedCount, BUILD_PROGRESS_STEPS.length - 1);
    }

    const fillUnits = state.buildReady
      ? BUILD_PROGRESS_STEPS.length
      : Math.min(
          BUILD_PROGRESS_STEPS.length,
          completedCount + (activeIndex >= 0 && !state.buildBlocked && !state.buildFailed ? 0.5 : 0),
        );
    const fillPercent = (fillUnits / BUILD_PROGRESS_STEPS.length) * 100;

    let activeLabel = activeIndex >= 0 ? BUILD_PROGRESS_STEPS[activeIndex]?.label || "等店员到岗" : "等店员到岗";
    let metaText = activeLabel;
    if (state.buildFailed) {
      metaText = `暂停在：${activeLabel}`;
    } else if (state.buildBlocked) {
      metaText = `待补齐：${activeLabel}`;
    } else if (state.buildReady) {
      metaText = "可以开门";
    }

    return {
      steps,
      completedCount,
      fillPercent,
      metaText,
      activeLabel,
    };
  }

  function renderBuildProgress() {
    if (!elements.buildProgressSteps || !elements.buildProgressFill || !elements.buildProgressMeta) return;
    const snapshot = getBuildProgressSnapshot();
    elements.buildProgressMeta.textContent = snapshot.metaText;
    elements.buildProgressFill.style.width = `${snapshot.fillPercent}%`;
    let lastCompletedStep = null;
    snapshot.steps.forEach((step) => {
      if (step.status === "completed") lastCompletedStep = step;
    });
    const activeStep = snapshot.steps.find((step) => step.status === "current" || step.status === "blocked" || step.status === "failed")
      || lastCompletedStep
      || snapshot.steps[0];
    elements.buildProgressSteps.innerHTML = activeStep
      ? `<span class="creator-build-progress-label is-${activeStep.status}">${activeStep.label}</span>`
      : "";
  }

  function showIdeaLlmLoading(baseText) {
    if (!elements.creatorLlmStatus) return;
    elements.creatorLlmStatus.hidden = false;
    startLoadingLoop((frame) => {
      elements.creatorLlmStatus.textContent = `${baseText}${loadingSuffix(frame)}`;
    });
  }

  function hideIdeaLlmLoading() {
    stopLoadingLoop();
    if (!elements.creatorLlmStatus) return;
    elements.creatorLlmStatus.hidden = true;
    elements.creatorLlmStatus.textContent = "";
  }

  function completeBuildFromSession(session, source = "stream") {
    if (!session || state.buildReady) return false;
    pushBuildTimeline({
      type: "complete",
      sessionId: session.sessionId || null,
      status: session.status || null,
      source,
    });
    console.log("[creator] build:summary", buildClientBuildSummary(session));
    state.sessionId = session.sessionId || state.sessionId;
    const sessionConcept = hydrateConceptFromSession(session);
    if (sessionConcept) {
      state.concept = sessionConcept;
    }
    renderBuildReady();
    closeBuildStream();
    stopBuildCompletionPolling();
    renderBuildProgress();
    return true;
  }

  async function pollBuildCompletion(jobId) {
    if (!jobId || state.buildReady || state.buildCompletionPollInFlight) return;
    state.buildCompletionPollInFlight = true;
    try {
      const jobPayload = await requestJson(`/api/agent/local/jobs/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: {},
        timeoutMs: 12_000,
      });
      const status = jobPayload?.status || {};
      console.log("[creator] build:poll", { jobId, state: status.state });

      if (status.state === "completed") {
        const sessionPayload = await requestJson("/api/session", {
          method: "GET",
          headers: {},
          timeoutMs: 12_000,
        });
        const session = sessionPayload?.session || null;
        if (session?.status === "ready") {
          completeBuildFromSession(session, "poll");
        }
        return;
      }

      if (status.state === "blocked") {
        stopBuildCompletionPolling();
        handleBuildEvent({
          type: "blocked",
          reason: status.blockReason || "还缺开张要用的东西",
          missingArtifacts: status.missingArtifacts || [],
          artifactDir: status.artifactDir || null,
        });
        return;
      }

      if (status.state === "failed") {
        stopBuildCompletionPolling();
        handleBuildEvent({
          type: "failed",
          error: status.error || "开张准备卡住了",
        });
      }
    } catch (error) {
      console.warn("[creator] build:poll:failed", { jobId, error: error.message || error });
    } finally {
      state.buildCompletionPollInFlight = false;
    }
  }

  function startBuildCompletionPolling(jobId) {
    if (!jobId || state.buildCompletionPollTimer || state.buildReady) return;
    pollBuildCompletion(jobId);
    state.buildCompletionPollTimer = window.setInterval(() => {
      pollBuildCompletion(jobId);
    }, BUILD_COMPLETION_POLL_INTERVAL_MS);
  }

  async function requestJson(url, options = {}) {
    const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const auth = window.NetaAuth;
    let hasAuth = false;
    if (auth) {
      try {
        if (await auth.isAuthenticated()) {
          headers.Authorization = `Bearer ${await auth.getAccessToken()}`;
          hasAuth = true;
        }
      } catch (error) {
        console.error("Failed to attach Neta token", error);
      }
    }

    console.log("[creator] request:start", {
      url,
      method: options.method || "GET",
      hasAuth,
      timeoutMs,
    });

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      console.log("[creator] request:done", {
        url,
        status: response.status,
        ok: response.ok,
        payload,
      });

      if (!response.ok) {
        throw new Error(payload?.error || `Request failed: ${response.status}`);
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function safeJsonParse(input) {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }

  function parseModelJson(input = "") {
    const direct = safeJsonParse(input);
    if (direct) return direct;

    const fencedMatch = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      const fenced = safeJsonParse(fencedMatch[1].trim());
      if (fenced) return fenced;
    }

    const firstBrace = input.indexOf("{");
    const lastBrace = input.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return safeJsonParse(input.slice(firstBrace, lastBrace + 1));
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

  async function requestDirectLlm(messages, options = {}) {
    const auth = window.NetaAuth;
    if (!auth) {
      throw new Error("Neta auth unavailable");
    }

    const token = await auth.getAccessToken();
    const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
    const model = options.model || window.NETA_CONFIG?.llmModel || "qwen3.5-flash-no-think";
    const endpoint = `${window.NETA_CONFIG?.llmGatewayEndpoint || "https://litellm.talesofai.com"}/chat/completions`;
    let lastError = null;

    console.log("[creator] llm:request:start", {
      model,
      timeoutMs,
      endpoint,
      messages,
    });

    for (let attempt = 1; attempt <= DIRECT_LLM_RETRY_COUNT; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model,
            stream: false,
            temperature: options.temperature ?? 0.7,
            messages,
            ...(options.extraBody || {}),
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);
        console.log("[creator] llm:request:done", {
          model,
          status: response.status,
          ok: response.ok,
          payload,
          attempt,
        });

        if (!response.ok) {
          const errorMessage = payload?.error?.message || payload?.error || `LLM request failed: ${response.status}`;
          if (isRetryableDirectLlmStatus(response.status) && attempt < DIRECT_LLM_RETRY_COUNT) {
            console.warn("[creator] llm:retryable-status", {
              model,
              attempt,
              status: response.status,
              nextDelayMs: DIRECT_LLM_RETRY_BASE_MS * attempt,
            });
            await sleep(DIRECT_LLM_RETRY_BASE_MS * attempt);
            continue;
          }
          throw new Error(errorMessage);
        }

        const text = extractMessageText(payload);
        if (!text) {
          throw new Error("LLM returned empty content");
        }
        if (options.includeMeta) {
          return {
            text,
            model,
            status: response.status,
            payload,
          };
        }
        return text;
      } catch (error) {
        lastError = error;
        if (error?.name === "AbortError") {
          throw new Error(`LLM timeout after ${timeoutMs}ms`);
        }
        if (isTransientDirectLlmError(error) && attempt < DIRECT_LLM_RETRY_COUNT) {
          console.warn("[creator] llm:transient-retry", {
            model,
            attempt,
            error: error.message || String(error),
            nextDelayMs: DIRECT_LLM_RETRY_BASE_MS * attempt,
          });
          await sleep(DIRECT_LLM_RETRY_BASE_MS * attempt);
          continue;
        }
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    throw lastError || new Error("LLM request failed");
  }

  function buildConceptRuntimeConfig(worldName, concept) {
    const theme = mergeCreatorTheme(
      pickCreatorTheme(`${concept.shopName || ""} ${concept.shopIdea || ""}`),
      concept.theme || concept.runtimeConfig?.theme,
    );
    return {
      ...(concept.runtimeConfig || {}),
      worldName,
      shopName: concept.shopName,
      brandEyebrow: concept.runtimeConfig?.brandEyebrow || `${worldName} · ${theme.eyebrow}`,
      assistantName: concept.assistantName || "店员助手",
      assistantRole: "店员助手",
      assistantPortraits: concept.runtimeConfig?.assistantPortraits || {
        angry: "/Downloads/hermione_emotions_tiles_1x4_trimmed/angry.png",
        confused: "/Downloads/hermione_emotions_tiles_1x4_trimmed/confused.png",
        serious: "/Downloads/hermione_emotions_tiles_1x4_trimmed/serious.png",
        smile: "/Downloads/hermione_emotions_tiles_1x4_trimmed/smile.png",
      },
      tileAssetBase: concept.runtimeConfig?.tileAssetBase || "/Downloads/magic_assets_tiles_4x8_trimmed",
      theme: theme.tokens,
    };
  }

  async function generateConceptDirect(worldName, shopIdea) {
    const prompt = [
      "You are designing a shop that belongs naturally inside the given world.",
      "",
      "Inputs:",
      "- world context",
      "- user's desired shop idea",
      "",
      "Output:",
      "- concise shop name",
      "- what the shop sells",
      "- why the shop exists in this world",
      "- who the assistant is and why they fit",
      "- what the first 3 minutes of play should feel like",
      "",
      "Style:",
      "- write as player-facing world content",
      "- focus the first version on one shop, one assistant, a few source stations, simple requests, and clear daily progress",
      "- use concrete shop goods, shop roles, customer needs, tools, decorations, and daily operation language",
      "- the user's shop theme must dominate the merchandise, supply stations, and first-session fantasy",
      "- the world setting is external input and should only act as flavor framing unless the user explicitly asks for deeper coupling",
      "- choose merchandise categories from the user's shop idea before adding world flavor",
      "- choose a distinct visual theme for the playable shop screen: background, panels, cards, borders, text, accent, and highlight colors should fit the user's shop idea",
      "",
      `World: ${worldName}`,
      `User shop idea: ${shopIdea}`,
      "",
      "Theme object keys: eyebrow, bgTop, bgBottom, paper, paperSoft, gold, shopBgTop, shopBgMid, shopBgBottom, shopLight, shopLightSoft, shopPanel, shopPanel2, shopPaper, shopPaperSoft, shopCard, shopCardDark, shopBorder, shopBorderDark, shopGold, shopGoldSoft, shopGreen, shopRed, shopText, shopInk, shopMuted.",
      "Use only #RRGGBB colors, except shopLightSoft may use rgba().",
      "Output compact JSON with keys: shopName, summary, assistantName, assistantRole, assistantSummary, loopSummary, confirmationLine, readySummary, theme.",
      "Answer in simplified Chinese values where appropriate.",
    ].join("\n");

    const rawText = await requestDirectLlm([
      {
        role: "user",
        content: prompt,
      },
    ], {
      timeoutMs: CONCEPT_LLM_TIMEOUT_MS,
    });
    console.log("[creator] llm:concept:text", rawText);

    const parsed = parseModelJson(rawText);
    if (!parsed) {
      throw new Error("LLM returned non-JSON concept payload");
    }

    const shopName = parsed.shopName || shopIdea;
    const concept = {
      worldName,
      shopIdea,
      shopName,
      assistantName: parsed.assistantName || "店员助手",
      assistantRole: parsed.assistantRole || "店长助手",
      assistantSummary: parsed.assistantSummary || "这位店员会先陪你确认开张前的细节，并在柜台旁解释第一轮经营节奏。",
      summary: parsed.summary || `${shopName}会成为这座世界里第一家围绕日常需求开张的主题店。`,
      loopSummary: parsed.loopSummary || "玩家会通过进货、合成和交付订单推进店铺经营。",
      confirmationLine: parsed.confirmationLine || `先把「${shopName}」搭起来。`,
      readySummary: parsed.readySummary || "店铺已经准备好，可以开始经营。",
      loadingPortraitUrl: "/Downloads/hermione_emotions_tiles_1x4_trimmed/serious.png",
      theme: parsed.theme || {},
    };
    concept.runtimeConfig = buildConceptRuntimeConfig(worldName, concept);
    return concept;
  }

  async function replyDuringLoadingDirect(concept, message) {
    const progressLog = state.buildTimeline
      .filter((item) => item.type === "stage" || item.type === "blocked" || item.type === "failed" || item.type === "complete")
      .map((item) => {
        if (item.type === "stage") {
          return `- 进度：${item.text || item.label || ""}`;
        }
        if (item.type === "blocked") {
          return `- 暂停：${item.reason || "还缺开张要用的东西"}`;
        }
        if (item.type === "failed") {
          return `- 中断：${item.error || "未知原因"}`;
        }
        return `- 完成：店铺状态=${item.status || "ready"}`;
      })
      .join("\n") || "- 暂时还没有新的开张动静";

    const prompt = [
      "You are an in-world shop assistant talking during shop construction.",
      `Shop: ${concept.shopName}`,
      `Assistant name: ${concept.assistantName || "店员助手"}`,
      `Assistant role: ${concept.assistantRole || "店长助手"}`,
      `Current shop preparation step: ${state.currentStageLabel || "尚未开始"}`,
      "Shop preparation progress log:",
      progressLog,
      `User message: ${message}`,
      "Only describe shop preparation progress that is explicitly present in the progress log.",
      "If the user asks about later work, say the shop is still waiting for that step.",
      "Answer in concise simplified Chinese.",
      "Keep it in character and under 90 Chinese characters.",
    ].join("\n\n");

    const text = await requestDirectLlm([
      {
        role: "user",
        content: prompt,
      },
    ], {
      temperature: 0.8,
    });
    console.log("[creator] llm:loading:text", text);
    return { text, mood: "serious" };
  }

  function showCreatorToast(title, body) {
    if (!elements.toastStack) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
    elements.toastStack.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 2400);
  }

  async function refreshAuthUi() {
    if (!elements.netaAuthStatus || !elements.netaAuthHint || !elements.netaAuthButton) return;
    const auth = window.NetaAuth;
    const authenticated = auth ? await auth.isAuthenticated().catch(() => false) : false;

    elements.netaAuthStatus.textContent = authenticated ? "Neta 通行章已连接" : "Neta 通行章未连接";
    elements.netaAuthHint.textContent = authenticated
      ? "店员已经能收到你的开店信。"
      : "连接后，店员才能收到你的开店信。";
    elements.netaAuthButton.textContent = authenticated ? "已连接" : "连接 Neta";
    if (elements.llmProbeButton) {
      elements.llmProbeButton.disabled = !authenticated;
    }
    if (elements.creatorAgentHint) {
      const hasMessenger = Boolean(state.agentMeta?.configured);
      elements.creatorAgentHint.textContent = hasMessenger ? "送信人：已在路上" : "送信人：等回音";
    }
  }

  function renderProbeResult(stateName, text) {
    if (!elements.llmProbeResult) return;
    elements.llmProbeResult.hidden = false;
    elements.llmProbeResult.dataset.state = stateName;
    elements.llmProbeResult.textContent = text;
  }

  function startProbeLoading(baseText) {
    renderProbeResult("running", `${baseText}${loadingSuffix(0)}`);
    startLoadingLoop((frame) => {
      renderProbeResult("running", `${baseText}${loadingSuffix(frame)}`);
    });
  }

  function startDialogueLoading(prompt, baseText) {
    const speaker = state.concept?.assistantName || "助手";
    elements.loadingDialogueSpeaker.textContent = speaker;
    elements.playerPromptEcho.hidden = false;
    elements.playerPromptEcho.textContent = `你：${prompt}`;
    pushHistory("user", "你", prompt);
    startLoadingLoop((frame) => {
      elements.loadingDialogueText.textContent = `${baseText}${loadingSuffix(frame)}`;
    });
  }

  async function ensureNetaAuth() {
    const auth = window.NetaAuth;
    if (!auth) {
      showCreatorToast("通行章缺失", "店员暂时收不到你的开店信。刷新后再试一次。");
      return false;
    }

    if (await auth.isAuthenticated().catch(() => false)) {
      await refreshAuthUi();
      return true;
    }

    showCreatorToast("先连接 Neta", "连接后，店员才能收到你的开店信。");
    await auth.signIn();
    return false;
  }

  function setStep(step) {
    elements.ideaStep.hidden = step !== "idea";
    elements.confirmStep.hidden = step !== "confirm";
    elements.buildingStep.hidden = step !== "building";
    elements.page.dataset.step = step;

    const phaseMap = {
      idea: "开店前夜",
      confirm: "确认开张",
      building: state.buildReady ? "可开张" : "布置中",
    };
    elements.phaseChip.textContent = phaseMap[step] || "布置中";
  }

  function showCreatorPage() {
    elements.page.hidden = false;
    elements.appShell.hidden = true;
    document.body.classList.add("creator-page-active");
  }

  function showShopPage() {
    elements.page.hidden = true;
    elements.appShell.hidden = false;
    document.body.classList.remove("creator-page-active");
  }

  function renderHistory() {
    elements.historyList.innerHTML = state.history
      .map(
        (item) => `
          <article class="creator-history-item ${item.role}">
            <strong>${item.speaker}</strong>
            <p>${item.text}</p>
          </article>
        `,
      )
      .join("");
  }

  function syncHistoryVisibility() {
    elements.historyPanel.hidden = !state.historyOpen;
    elements.toggleHistoryButton.textContent = state.historyOpen ? "收起记录" : "对话记录";
  }

  function pushHistory(role, speaker, text) {
    state.history.push({ role, speaker, text });
    renderHistory();
  }

  function enableLoadingChat() {
    elements.loadingInputRow.hidden = false;
    elements.loadingChatInput.disabled = false;
    elements.sendLoadingChatButton.disabled = false;
    elements.loadingChatInput.placeholder = state.buildBlocked || state.buildFailed
      ? "告诉店员要怎么改，或直接点下方重试"
      : `输入一句想问${state.concept?.assistantName || "店员"}的话`;
  }

  function disableLoadingChat(options = {}) {
    const { hidden = false } = options;
    elements.loadingInputRow.hidden = hidden;
    elements.loadingChatInput.disabled = true;
    elements.sendLoadingChatButton.disabled = true;
  }

  function showBuildRecovery() {
    if (!elements.buildRecoveryRow) return;
    elements.buildRecoveryRow.hidden = false;
    if (elements.retryBuildButton) elements.retryBuildButton.disabled = false;
    if (elements.reviseBuildButton) elements.reviseBuildButton.disabled = false;
  }

  function hideBuildRecovery() {
    if (!elements.buildRecoveryRow) return;
    elements.buildRecoveryRow.hidden = true;
    if (elements.retryBuildButton) elements.retryBuildButton.disabled = false;
    if (elements.reviseBuildButton) elements.reviseBuildButton.disabled = false;
  }

  function setDialogue({ speaker, text, prompt, record = true }) {
    elements.loadingDialogueSpeaker.textContent = speaker;
    elements.loadingDialogueText.textContent = text;

    if (prompt) {
      elements.playerPromptEcho.hidden = false;
      elements.playerPromptEcho.textContent = `你：${prompt}`;
      pushHistory("user", "你", prompt);
    } else {
      elements.playerPromptEcho.hidden = true;
      elements.playerPromptEcho.textContent = "";
    }

    if (record) {
      pushHistory("assistant", speaker, text);
    }
  }

  function applyRuntimeConfig(runtimeConfig) {
    if (typeof window.applyRuntimeConfig === "function") {
      window.applyRuntimeConfig(runtimeConfig || {});
    }
  }

  function resetShopRuntime(runtimeConfig, options = {}) {
    if (typeof window.resetShopState === "function") {
      window.resetShopState(runtimeConfig || {}, options);
      return;
    }
    applyRuntimeConfig(runtimeConfig || {});
  }

  function hydrateConceptFromSession(session) {
    if (!session?.concept) return null;
    return {
      ...session.concept,
      runtimeConfig: session.runtimeConfig || session.concept.runtimeConfig || {},
    };
  }

  function renderConcept(concept) {
    state.concept = concept;
    elements.conceptShopName.textContent = concept.shopName;
    elements.conceptSummary.textContent = concept.summary;
    elements.conceptAssistantName.textContent = concept.assistantName;
    elements.conceptAssistantSummary.textContent = concept.assistantSummary;
    elements.conceptLoopSummary.textContent = concept.loopSummary;
    elements.startBuildButton.disabled = false;
    setStep("confirm");
  }

  function applyBuildConceptPatch(patch = {}) {
    if (!state.concept) return;
    const runtimeConfigPatch = patch.runtimeConfig || {};
    state.concept = {
      ...state.concept,
      ...patch,
      runtimeConfig: {
        ...(state.concept.runtimeConfig || {}),
        ...runtimeConfigPatch,
      },
    };
  }

  function setBuildAssistant(concept, options = {}) {
    const {
      introText = concept.confirmationLine,
      record = true,
      portraitReady = Boolean(concept.loadingPortraitUrl),
      assistantName = concept.assistantName,
      assistantRole = concept.assistantRole,
    } = options;

    elements.loadingAssistantName.textContent = assistantName;
    elements.loadingAssistantRole.textContent = assistantRole;
    elements.loadingAssistantPortrait.hidden = !portraitReady;
    if (portraitReady && concept.loadingPortraitUrl) {
      elements.loadingAssistantPortrait.src = concept.loadingPortraitUrl;
    } else {
      elements.loadingAssistantPortrait.removeAttribute("src");
    }
    if (!introText) {
      elements.loadingDialogueSpeaker.textContent = assistantName;
      elements.loadingDialogueText.textContent = "";
      return;
    }
    setDialogue({
      speaker: assistantName,
      text: introText,
      record,
    });
  }

  function resetBuildView() {
    clearTimers();
    closeBuildStream();
    stopBuildCompletionPolling();
    stopPortraitLoading();
    state.history = [];
    state.buildTimeline = [];
    state.historyOpen = false;
    state.buildReady = false;
    state.buildBlocked = false;
    state.buildFailed = false;
    state.currentStageLabel = "";
    state.portraitReady = false;
    if (elements.creatorVisualNovel) {
      elements.creatorVisualNovel.dataset.mode = "dialogue";
    }
    state.jobId = null;
    elements.historyList.innerHTML = "";
    syncHistoryVisibility();
    if (elements.creatorDialogueCard) {
      elements.creatorDialogueCard.hidden = true;
    }
    disableLoadingChat({ hidden: false });
    elements.buildActionRow.hidden = true;
    hideBuildRecovery();
    elements.playerPromptEcho.hidden = true;
    elements.playerPromptEcho.textContent = "";
    elements.loadingChatInput.value = "";
    renderBuildProgress();
  }

  function renderBuildReady() {
    state.buildReady = true;
    state.buildBlocked = false;
    state.buildFailed = false;
    stopPortraitLoading();
    setStep("building");
    if (elements.creatorDialogueCard) {
      elements.creatorDialogueCard.hidden = false;
    }
    elements.buildActionRow.hidden = false;
    hideBuildRecovery();
    setDialogue({
      speaker: state.concept.assistantName || "店员",
      text: "门已经擦亮，货也摆上了。现在可以进店，看看这家店真正开张后的样子。",
      prompt: "",
    });
    renderBuildProgress();
  }

  function showAwaitingAgentState(concept) {
    if (elements.creatorDialogueCard) {
      elements.creatorDialogueCard.hidden = true;
    }
    disableLoadingChat({ hidden: true });
    startPortraitLoading("店员正在赶来上班");
    setBuildAssistant(concept, {
      introText: "店员正在赶来上班。到岗后，你就能一边聊天一边看店铺准备进度。",
      record: false,
      portraitReady: false,
      assistantName: "店员未到岗",
      assistantRole: "店员赶来中",
    });
    renderBuildProgress();
  }

  function handleBuildEvent(payload) {
    if (!payload || !state.concept) return;
    console.log("[creator] build:event", payload);

    if (payload.type === "stage") {
      const receivedPortrait = Boolean(payload.loadingPortraitUrl || payload.assistantPortraits);
      if (!receivedPortrait && !state.portraitReady) {
        startPortraitLoading(getGameStageText(payload, "店员正在赶来上班"));
      }
      if (receivedPortrait) {
        applyBuildConceptPatch({
          loadingPortraitUrl: payload.loadingPortraitUrl || state.concept.loadingPortraitUrl,
          runtimeConfig: {
            ...(payload.assistantPortraits ? { assistantPortraits: payload.assistantPortraits } : {}),
          },
        });
        state.portraitReady = true;
        stopPortraitLoading();
        if (elements.creatorDialogueCard) {
          elements.creatorDialogueCard.hidden = false;
        }
        elements.loadingAssistantName.textContent = state.concept.assistantName;
        elements.loadingAssistantRole.textContent = state.concept.assistantRole;
        elements.loadingAssistantPortrait.hidden = false;
        elements.loadingAssistantPortrait.src = state.concept.loadingPortraitUrl;
        enableLoadingChat();
      }
      state.currentStageLabel = payload.label || "";
      state.buildBlocked = false;
      state.buildFailed = false;
      hideBuildRecovery();
      pushBuildTimeline({
        type: "stage",
        label: payload.label || "",
        status: payload.status || null,
        text: getGameStageText(payload, "柜台正在准备中"),
      });
      const stageText = getGameStageText(payload, "柜台正在准备中");
      setDialogue({
        speaker: receivedPortrait ? state.concept.assistantName : "柜台响动",
        text: receivedPortrait
          ? "我到了，先替你看住柜台。接下来有新动静，我会在这里告诉你。"
          : stageText,
      });
      renderBuildProgress();
      if (shouldPollForBuildCompletion(payload.label, payload.status)) {
        startBuildCompletionPolling(state.jobId);
      }
      return;
    }

    if (payload.type === "assistant") {
      pushBuildTimeline({
        type: "assistant",
        name: payload.name || state.concept.assistantName,
        text: payload.text || "",
      });
      setDialogue({
        speaker: payload.name || state.concept.assistantName,
        text: payload.text,
      });
      return;
    }

    if (payload.type === "blocked") {
      stopPortraitLoading();
      if (elements.creatorDialogueCard) {
        elements.creatorDialogueCard.hidden = false;
      }
      enableLoadingChat();
      showBuildRecovery();
      state.buildBlocked = true;
      state.buildReady = false;
      pushBuildTimeline({
        type: "blocked",
        reason: payload.reason || "还缺开张要用的东西",
        artifactDir: payload.artifactDir || null,
        missingArtifacts: Array.isArray(payload.missingArtifacts) ? payload.missingArtifacts : [],
      });
      console.warn("[creator] build:blocked", {
        jobId: state.jobId,
        sessionId: state.sessionId,
        reason: payload.reason || "还缺开张要用的东西",
        artifactDir: payload.artifactDir || null,
        missingArtifacts: payload.missingArtifacts || [],
      });
      elements.buildActionRow.hidden = true;
      const isThemeBlocked = Array.isArray(payload.missingArtifacts)
        && payload.missingArtifacts.some((item) => String(item?.id || "").startsWith("theme."));
      setDialogue({
        speaker: "柜台暂停",
        text: isThemeBlocked
          ? "这家店的界面配色还没准备完整。你可以让店员按原方案重试，也可以在输入框里补一句修改建议。"
          : "当前还缺一件开张要用的东西。你可以让店员按原方案重试，也可以在输入框里补一句修改建议。",
      });
      showCreatorToast(isThemeBlocked ? "主题还没定好" : "还缺东西", isThemeBlocked ? "界面配色还缺几项，准备完整后才能进店。" : "有一件开张用品还没送到，先等它补齐。");
      renderBuildProgress();
      return;
    }

    if (payload.type === "failed") {
      stopPortraitLoading();
      if (elements.creatorDialogueCard) {
        elements.creatorDialogueCard.hidden = false;
      }
      enableLoadingChat();
      showBuildRecovery();
      state.buildFailed = true;
      state.buildBlocked = false;
      state.buildReady = false;
      pushBuildTimeline({
        type: "failed",
        error: "开张准备卡住了",
      });
      console.error("[creator] build:failed", {
        jobId: state.jobId,
        sessionId: state.sessionId,
        error: payload.error || "Unknown build failure",
        timeline: state.buildTimeline.slice(),
      });
      elements.buildActionRow.hidden = true;
      setDialogue({
        speaker: "柜台暂停",
        text: "开张准备卡住了。你可以问店员发生了什么，也可以直接重试；如果想改方向，就在输入框里写一句建议再重试。",
      });
      closeBuildStream();
      showCreatorToast("开张卡住了", "这轮准备没有顺利完成。");
      renderBuildProgress();
      return;
    }

    if (payload.type === "complete") {
      completeBuildFromSession(payload.session || null, "stream");
    }
  }

  function connectBuildStream(jobId) {
    closeBuildStream();
    console.log("[creator] build:stream:connect", { jobId });
    const stream = new EventSource(`/api/build/stream/${jobId}`);
    state.buildStream = stream;

    stream.onopen = () => {
      console.log("[creator] build:stream:open", { jobId });
    };

    stream.onmessage = (event) => {
      try {
        console.log("[creator] build:stream:raw", event.data);
        handleBuildEvent(JSON.parse(event.data));
      } catch (error) {
        console.error("Failed to parse build stream event", error);
      }
    };

    stream.onerror = (error) => {
      console.error("[creator] build:stream:error", { jobId, error, ready: state.buildReady });
      if (state.buildReady) return;
      startBuildCompletionPolling(jobId);
      showCreatorToast("猫头鹰迷路了", "开张回信晚了一点，正在重新等消息。");
    };
  }

  async function bootstrapFromServer() {
    try {
      if (window.NetaAuth) {
        await window.NetaAuth.boot();
      }

      const searchParams = new URLSearchParams(window.location.search);
      const isFreshPath = window.location.pathname === "/fresh";
      const archiveName = searchParams.get("archive");
      if (archiveName) {
        const saved = archiveCurrentShop(archiveName);
        showCreatorToast(saved ? "存档已保存" : "存档失败", saved ? `已保存 ${archiveName} 店铺快照。` : "当前页面还没有可导出的店铺状态。");
        window.history.replaceState({}, "", window.location.pathname);
      }
      const restoreArchiveName = searchParams.get("restoreArchive");
      if (restoreArchiveName) {
        const restored = restoreShopArchive(restoreArchiveName);
        showCreatorToast(restored ? "存档已恢复" : "未找到存档", restored ? `已恢复 ${restoreArchiveName} 店铺快照。` : `没有找到 ${restoreArchiveName} 存档。`);
        if (restored) {
          showShopPage();
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
        window.history.replaceState({}, "", window.location.pathname);
      }
      const shouldSoftFresh = isFreshPath || searchParams.get("fresh") === "1";
      const shouldHardReset = searchParams.get("reset") === "1";
      if (shouldHardReset) {
        await resetTestState({ reload: false });
        window.history.replaceState({}, "", window.location.pathname);
      }

      await refreshAuthUi();
      const payload = await requestJson("/api/session", { method: "GET", headers: {} });
      state.defaults.worldName = payload.defaults?.worldName || DEFAULTS.worldName;
      state.agentMeta = payload.adapters?.agent || null;
      initPageCopy();

      if (shouldSoftFresh) {
        resetBuildView();
        state.sessionId = null;
        state.concept = null;
        state.jobId = null;
        elements.shopIdeaInput.value = "";
        showCreatorPage();
        setStep("idea");
        console.log("[creator] bootstrap:fresh-entry", {
          preservedSessionId: payload.session?.sessionId || null,
        });
        return;
      }

      const existingLocalSave = (() => {
        try {
          return window.localStorage.getItem(SAVE_KEY);
        } catch (error) {
          console.error("Failed to inspect local save during bootstrap", error);
          return null;
        }
      })();

      if (payload.session?.status === "ready" && payload.session?.enteredShop) {
        resetBuildView();
        state.sessionId = payload.session.sessionId || null;
        state.concept = hydrateConceptFromSession(payload.session);
        state.jobId = null;
        elements.shopIdeaInput.value = "";

        const runtimeConfig =
          payload.session.runtimeConfig || payload.session.concept?.runtimeConfig || {};
        if (existingLocalSave) {
          applyRuntimeConfig(runtimeConfig);
        } else {
          resetShopRuntime(runtimeConfig, { introSeen: false });
        }

        showShopPage();
        return;
      }

      if (payload.session?.status === "ready") {
        resetBuildView();
        state.sessionId = payload.session.sessionId || null;
        state.concept = hydrateConceptFromSession(payload.session);
        state.jobId = null;
        elements.shopIdeaInput.value = "";
        showCreatorPage();
        setStep("building");
        if (state.concept) {
          completeBuildFromSession(payload.session, "bootstrap");
          return;
        }
      }

      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch (error) {
        console.error("Failed to clear local save during bootstrap", error);
      }

      resetBuildView();
      state.sessionId = null;
      state.concept = null;
      state.jobId = null;
      elements.shopIdeaInput.value = "";
      applyRuntimeConfig({});
      showCreatorPage();
      setStep("idea");
      if (payload.session) {
        console.log("[creator] bootstrap:ignore-session", {
          sessionId: payload.session.sessionId,
          enteredShop: payload.session.enteredShop,
          agent: payload.session.sources?.agent || null,
        });
      }
    } catch (error) {
      console.error("Failed to bootstrap creator session", error);
      initPageCopy();
      setStep("idea");
      showCreatorPage();
      showCreatorToast("猫头鹰没回来", "开店信暂时送不出去，先确认店门外的路通着，再试一次。");
      await refreshAuthUi();
    }
  }

  function initPageCopy() {
    elements.worldEyebrow.textContent = `${state.defaults.worldName} · 世界商店开张`;
    elements.title.textContent = "世界商店开张";
    elements.narration.textContent =
      `${state.defaults.worldName}正在有条不紊地建设中。\n为了持续获得世界建设资源，你决定先开一间主体店铺。\n想开什么店铺？`;
    if (elements.llmProbeResult) {
      elements.llmProbeResult.hidden = true;
      elements.llmProbeResult.textContent = "";
      delete elements.llmProbeResult.dataset.state;
    }
    hideIdeaLlmLoading();
    syncHistoryVisibility();
  }

  async function handleGenerateConcept() {
    const shopIdea = elements.shopIdeaInput.value.trim();
    if (!shopIdea) {
      showCreatorToast("还没写店铺主题", "先输入一句店铺设想，再继续往下开店。");
      elements.shopIdeaInput.focus();
      return;
    }

    if (!(await ensureNetaAuth())) return;

    elements.generateConceptButton.disabled = true;
    elements.shopIdeaInput.disabled = true;
    showIdeaLlmLoading("开店方案筹备中");
    console.log("[creator] concept:submit", {
      worldName: state.defaults.worldName,
      shopIdea,
    });

    try {
      const concept = await generateConceptDirect(state.defaults.worldName, shopIdea);
      if (!concept) {
        throw new Error("Concept payload missing");
      }
      console.log("[creator] concept:response", concept);
      renderConcept(concept);
    } catch (error) {
      console.error("Failed to generate concept", error);
      showCreatorToast("开店信没写成", "旁白暂时没写出可用的开店方案，换个说法再试一次。");
    } finally {
      hideIdeaLlmLoading();
      elements.shopIdeaInput.disabled = false;
      elements.generateConceptButton.disabled = false;
    }
  }

  async function handleStartBuild(options = {}) {
    const { retry = false, revision = "" } = options;
    const previousJobId = state.jobId;
    const nextShopIdea = [state.concept?.shopIdea, revision ? `补充建议：${revision}` : ""]
      .filter(Boolean)
      .join("\n");
    console.log("[creator] start-build:click", {
      hasConcept: Boolean(state.concept),
      currentStep: elements.page?.dataset?.step,
      retry,
      hasRevision: Boolean(revision),
    });
    if (!state.concept) return;
    if (!(await ensureNetaAuth())) return;

    elements.startBuildButton.disabled = true;
    elements.backToIdeaButton.disabled = true;

    if (revision) {
      applyBuildConceptPatch({
        shopIdea: nextShopIdea,
        loopSummary: `${state.concept.loopSummary || "开张方案已确认。"} 店员会按你的补充建议调整这轮准备。`,
      });
    }

    resetBuildView();
    showAwaitingAgentState(state.concept);
    setStep("building");
    try {
      const payload = await requestJson("/api/build/start", {
        method: "POST",
        body: JSON.stringify({
          worldName: state.defaults.worldName,
          shopIdea: nextShopIdea,
          concept: state.concept,
          retryOfJobId: retry ? previousJobId : null,
          revision: revision || "",
        }),
      });
      state.jobId = payload.jobId;
      state.sessionId = payload.sessionId;
      console.log("[creator] build:start", payload);
      connectBuildStream(payload.jobId);
      startBuildCompletionPolling(payload.jobId);
    } catch (error) {
      console.error("Failed to start build job", error);
      showCreatorToast("开店信没送出", "暂时没联系上接手准备的人，再试一次。 ");
      setStep("confirm");
    } finally {
      elements.startBuildButton.disabled = false;
      elements.backToIdeaButton.disabled = false;
    }
  }

  async function handleRetryBuild({ withRevision = false } = {}) {
    if (!state.concept) return;
    const revision = withRevision ? elements.loadingChatInput.value.trim() : "";
    if (withRevision && !revision) {
      showCreatorToast("先写一句建议", "在输入框里告诉店员这轮要怎么改，再带建议重试。 ");
      elements.loadingChatInput.focus();
      return;
    }
    hideBuildRecovery();
    if (elements.retryBuildButton) elements.retryBuildButton.disabled = true;
    if (elements.reviseBuildButton) elements.reviseBuildButton.disabled = true;
    await handleStartBuild({ retry: true, revision });
  }

  async function handleLoadingChat() {
    const message = elements.loadingChatInput.value.trim();
    if (!message) return;
    if (!(await ensureNetaAuth())) return;

    elements.loadingChatInput.value = "";
    elements.loadingChatInput.disabled = true;
    elements.sendLoadingChatButton.disabled = true;
    startDialogueLoading(message, `${state.concept?.assistantName || "店员助手"}正在翻看柜台笔记`);
    try {
      const reply = await replyDuringLoadingDirect(state.concept, message);
      console.log("[creator] loading-chat:response", reply);
      stopLoadingLoop();
      setDialogue({
        speaker: state.concept.assistantName,
        text: reply?.text || "我先继续看着柜台，有新动静就告诉你。",
      });
    } catch (error) {
      console.error("Failed to send loading chat", error);
      stopLoadingLoop();
      elements.loadingChatInput.value = message;
      showCreatorToast("店员没听清", "店员暂时没回话，稍后再问一次。");
    }
    elements.loadingChatInput.disabled = false;
    elements.sendLoadingChatButton.disabled = false;
    elements.loadingChatInput.focus();
  }

  async function handleEnterShop() {
    const missingThemeTokens = getMissingThemeTokens(state.concept?.runtimeConfig || {});
    if (missingThemeTokens.length) {
      console.warn("[creator] theme:incomplete", {
        missingThemeTokens,
        runtimeConfig: state.concept?.runtimeConfig || null,
      });
      showCreatorToast("主题还没定好", "这家店的界面配色还没准备完整，先别急着进店。");
      return;
    }
    closeBuildStream();
    stopBuildCompletionPolling();
    if (state.sessionId) {
      try {
        await requestJson("/api/session/enter", {
          method: "POST",
          body: JSON.stringify({
            sessionId: state.sessionId,
          }),
        });
      } catch (error) {
        console.error("Failed to mark session as entered", error);
      }
    }
    resetShopRuntime(state.concept?.runtimeConfig || {}, { introSeen: false });
    showShopPage();
  }

  async function handleRebuild() {
    closeBuildStream();
    stopBuildCompletionPolling();
    try {
      await requestJson("/api/session/reset", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error) {
      console.error("Failed to reset session", error);
    }

    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      console.error("Failed to clear local save", error);
    }

    resetBuildView();
    state.concept = null;
    state.sessionId = null;
    elements.shopIdeaInput.value = "";
    applyRuntimeConfig({});
    initPageCopy();
    setStep("idea");
    showCreatorPage();
  }

  async function resetTestState(options = {}) {
    const { clearAuth = false, reload = true } = options;
    console.log("[creator] reset:start", { clearAuth, reload });

    try {
      await requestJson("/api/session/reset", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error) {
      console.error("Failed to reset session", error);
    }

    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      console.error("Failed to clear local save", error);
    }

    if (clearAuth) {
      try {
        window.NetaAuth?.signOutLocal?.();
      } catch (error) {
        console.error("Failed to clear auth session", error);
      }
    }

    resetBuildView();
    state.concept = null;
    state.sessionId = null;
    state.jobId = null;
    elements.shopIdeaInput.value = "";
    applyRuntimeConfig({});
    initPageCopy();
    setStep("idea");
    showCreatorPage();

    console.log("[creator] reset:done", {
      saveKey: SAVE_KEY,
      authCleared: clearAuth,
    });

    if (reload) {
      window.location.href = clearAuth ? window.location.pathname : `${window.location.pathname}?reset=1`;
    }
  }

  async function handleRunLlmProbe() {
    if (!(await ensureNetaAuth())) return;
    if (!elements.llmProbeButton) return;

    elements.llmProbeButton.disabled = true;
    startProbeLoading("正在试听店员回声");

    try {
      const result = await requestDirectLlm(
        [
          {
            role: "user",
            content: "请只回复这四个字：回声清楚",
          },
        ],
        {
          temperature: 0,
          includeMeta: true,
          timeoutMs: 30_000,
        },
      );

      renderProbeResult(
        "success",
        [
          "回声清楚",
          "店员回了话",
          `内容：${result.text}`,
        ].join("\n"),
      );
    } catch (error) {
      renderProbeResult(
        "error",
        [
          "回声太远",
          "门外太吵，暂时没听清。",
        ].join("\n"),
      );
    } finally {
      stopLoadingLoop();
      await refreshAuthUi();
    }
  }

  elements.generateConceptButton.addEventListener("click", handleGenerateConcept);
  elements.backToIdeaButton.addEventListener("click", () => setStep("idea"));
  elements.startBuildButton.addEventListener("click", handleStartBuild);
  elements.sendLoadingChatButton.addEventListener("click", handleLoadingChat);
  elements.retryBuildButton?.addEventListener("click", () => handleRetryBuild({ withRevision: false }));
  elements.reviseBuildButton?.addEventListener("click", () => handleRetryBuild({ withRevision: true }));
  elements.toggleHistoryButton.addEventListener("click", () => {
    state.historyOpen = !state.historyOpen;
    syncHistoryVisibility();
  });
  elements.loadingChatInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleLoadingChat();
  });
  elements.enterShopButton.addEventListener("click", handleEnterShop);
  elements.rebuildShopButton.addEventListener("click", handleRebuild);
  elements.creatorHallButton?.addEventListener("click", () => {
    showCreatorToast("大厅即将上线", "即将上线，敬请期待。");
  });
  elements.llmProbeButton?.addEventListener("click", handleRunLlmProbe);
  elements.netaAuthButton?.addEventListener("click", async () => {
    const auth = window.NetaAuth;
    if (!auth) {
      showCreatorToast("通行章缺失", "盖章台还没摆出来，刷新后再试一次。");
      return;
    }
    if (await auth.isAuthenticated().catch(() => false)) {
      showCreatorToast("通行章已盖", "现在可以继续写开店信。");
      return;
    }
    await auth.signIn();
  });

  window.resetMvpTestState = resetTestState;
  window.__CREATOR_DEBUG__ = {
    resetTestState,
  };

  initPageCopy();
  bootstrapFromServer();
})();
