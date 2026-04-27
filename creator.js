(function () {
  const DEFAULTS = {
    worldName: "你的世界",
  };
  const REQUEST_TIMEOUT_MS = 60_000;
  const CONCEPT_LLM_TIMEOUT_MS = 120_000;
  const DIRECT_LLM_RETRY_COUNT = 3;
  const DIRECT_LLM_RETRY_BASE_MS = 1200;
  const SAVE_KEY = window.__SHOP_SAVE_KEY__ || "witch-curio_shop_mvp_v5_builder";
  const BUILD_PROGRESS_STEPS = [
    { id: "portrait", label: "助手到位", matches: ["生成店员表情肖像", "店员肖像已就位"] },
    { id: "content", label: "文本整理", matches: ["整理店内文本包", "店内文本包已写入"] },
    { id: "sheet", label: "素材出图", matches: ["生成店铺素材表"] },
    { id: "split", label: "切图落盘", matches: ["切分素材表"] },
    { id: "verify", label: "校验开张", matches: ["校验必需产物", "阻塞已解除"] },
  ];

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
    buildActionRow: document.getElementById("buildActionRow"),
    enterShopButton: document.getElementById("enterShopButton"),
    rebuildShopButton: document.getElementById("rebuildShopButton"),
    netaAuthStatus: document.getElementById("netaAuthStatus"),
    netaAuthHint: document.getElementById("netaAuthHint"),
    creatorAgentHint: document.getElementById("creatorAgentHint"),
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
      elements.portraitLoadingTitle.textContent = "等待助手到来";
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

    let metaText = "等待开始";
    if (state.buildFailed) {
      metaText = "施工中断";
    } else if (state.buildBlocked) {
      metaText = "等待补齐产物";
    } else if (state.buildReady) {
      metaText = `${BUILD_PROGRESS_STEPS.length} / ${BUILD_PROGRESS_STEPS.length} 已完成`;
    } else if (activeIndex >= 0) {
      metaText = `${completedCount} / ${BUILD_PROGRESS_STEPS.length} 已完成`;
    }

    return {
      steps,
      completedCount,
      fillPercent,
      metaText,
    };
  }

  function renderBuildProgress() {
    if (!elements.buildProgressSteps || !elements.buildProgressFill || !elements.buildProgressMeta) return;
    const snapshot = getBuildProgressSnapshot();
    elements.buildProgressMeta.textContent = snapshot.metaText;
    elements.buildProgressFill.style.width = `${snapshot.fillPercent}%`;
    elements.buildProgressSteps.innerHTML = snapshot.steps
      .map(
        (step) => `
          <div class="creator-build-progress-step is-${step.status}">
            <span class="creator-build-progress-dot" aria-hidden="true"></span>
            <span class="creator-build-progress-label">${step.label}</span>
          </div>
        `,
      )
      .join("");
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
    return {
      ...(concept.runtimeConfig || {}),
      worldName,
      shopName: concept.shopName,
      brandEyebrow: concept.runtimeConfig?.brandEyebrow || `${worldName} · 资源中转`,
      assistantName: concept.assistantName || "店员助手",
      assistantRole: "店员助手",
      assistantPortraits: concept.runtimeConfig?.assistantPortraits || {
        angry: "/Downloads/hermione_emotions_tiles_1x4_trimmed/angry.png",
        confused: "/Downloads/hermione_emotions_tiles_1x4_trimmed/confused.png",
        serious: "/Downloads/hermione_emotions_tiles_1x4_trimmed/serious.png",
        smile: "/Downloads/hermione_emotions_tiles_1x4_trimmed/smile.png",
      },
      tileAssetBase: concept.runtimeConfig?.tileAssetBase || "/Downloads/magic_assets_tiles_4x8_trimmed",
      theme: concept.runtimeConfig?.theme || {
        bgTop: "#faefc9",
        bgBottom: "#d7b57c",
        paper: "#fff7e7",
        paperSoft: "#f5ead0",
        gold: "#c78e2a",
      },
    };
  }

  async function generateConceptDirect(worldName, shopIdea) {
    const prompt = [
      "You are a world-shop concept designer.",
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
      "Constraints:",
      "- must be feasible for a web merge + orders loop",
      "- assets and logic must be buildable from AI-generated material or external libraries",
      "- keep scope small enough for a fast MVP",
      "- the user's shop theme must dominate the merchandise, supply stations, and first-session fantasy",
      "- the world setting is external input and should only act as flavor framing unless the user explicitly asks for deeper coupling",
      "- do not default to wizard-school or magical supply categories unless the user explicitly asks for them",
      "",
      `World: ${worldName}`,
      `User shop idea: ${shopIdea}`,
      "",
      "Return compact JSON with keys: shopName, summary, assistantName, assistantRole, assistantSummary, loopSummary, confirmationLine, readySummary.",
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
      assistantSummary: parsed.assistantSummary || "这位助手会先承担建店阶段的陪伴与解释工作。",
      summary: parsed.summary || `${shopName}会先映射到当前经营骨架里，作为这座世界的第一家主题店。`,
      loopSummary: parsed.loopSummary || "当前本地版会先沿用现有 merge + 订单骨架。",
      confirmationLine: parsed.confirmationLine || `先把「${shopName}」搭起来。`,
      readySummary: parsed.readySummary || "店铺已经准备好，可以开始经营。",
      loadingPortraitUrl: "/Downloads/hermione_emotions_tiles_1x4_trimmed/serious.png",
    };
    concept.runtimeConfig = buildConceptRuntimeConfig(worldName, concept);
    return concept;
  }

  async function replyDuringLoadingDirect(concept, message) {
    const progressLog = state.buildTimeline
      .filter((item) => item.type === "stage" || item.type === "blocked" || item.type === "failed" || item.type === "complete")
      .map((item) => {
        if (item.type === "stage") {
          return `- stage: ${item.label || ""} | status: ${item.status || ""}`;
        }
        if (item.type === "blocked") {
          return `- blocked: ${item.reason || "missing required build artifacts"}`;
        }
        if (item.type === "failed") {
          return `- failed: ${item.error || "unknown error"}`;
        }
        return `- complete: session=${item.sessionId || ""} status=${item.status || ""}`;
      })
      .join("\n") || "- no real build progress yet";

    const prompt = [
      "You are an in-world shop assistant talking during shop construction.",
      `Shop: ${concept.shopName}`,
      `Assistant name: ${concept.assistantName || "店员助手"}`,
      `Assistant role: ${concept.assistantRole || "店长助手"}`,
      `Current real build stage: ${state.currentStageLabel || "not started"}`,
      "Real build progress log:",
      progressLog,
      `User message: ${message}`,
      "Only describe progress that is explicitly present in the real build progress log.",
      "If the user asks about work that has not happened yet, say it has not been completed yet.",
      "Do not invent completed assets, finished images, or finished code changes.",
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

    elements.netaAuthStatus.textContent = authenticated ? "Neta 已连接" : "尚未连接 Neta";
    elements.netaAuthHint.textContent = authenticated
      ? "角色对话和建店草案会优先走 Neta LLM。"
      : "先连接 Neta，建店草案和角色对话才会走平台 LLM。";
    elements.netaAuthButton.textContent = authenticated ? "已连接" : "连接 Neta";
    if (elements.llmProbeButton) {
      elements.llmProbeButton.disabled = !authenticated;
    }
    if (elements.creatorAgentHint) {
      const agentLabel = state.agentMeta?.label || "未识别";
      const agentMode = state.agentMeta?.mode === "remote" ? "远程" : "本地";
      elements.creatorAgentHint.textContent = `当前 Agent：${agentLabel}（${agentMode}）`;
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
      showCreatorToast("Neta 配置缺失", "当前页面还没有挂上 Neta 认证模块。");
      return false;
    }

    if (await auth.isAuthenticated().catch(() => false)) {
      await refreshAuthUi();
      return true;
    }

    showCreatorToast("先连接 Neta", "登录后才能用 Neta LLM 生成草案和角色回复。");
    await auth.signIn();
    return false;
  }

  function setStep(step) {
    elements.ideaStep.hidden = step !== "idea";
    elements.confirmStep.hidden = step !== "confirm";
    elements.buildingStep.hidden = step !== "building";
    elements.page.dataset.step = step;

    const phaseMap = {
      idea: "建店前夜",
      confirm: "确认设定",
      building: state.buildReady ? "可开张" : "施工中",
    };
    elements.phaseChip.textContent = phaseMap[step] || "建店中";
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
  }

  function disableLoadingChat(options = {}) {
    const { hidden = false } = options;
    elements.loadingInputRow.hidden = hidden;
    elements.loadingChatInput.disabled = true;
    elements.sendLoadingChatButton.disabled = true;
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
    resetShopRuntime(state.concept.runtimeConfig);
    if (elements.creatorDialogueCard) {
      elements.creatorDialogueCard.hidden = false;
    }
    elements.buildActionRow.hidden = false;
    setDialogue({
      speaker: "施工完成",
      text: "当前 agent 已完成这轮建店回写。现在可以进入店铺，查看这次实际落下的店名、主题和初始工作台状态。",
      prompt: "",
    });
    renderBuildProgress();
  }

  function showAwaitingAgentState(concept) {
    if (elements.creatorDialogueCard) {
      elements.creatorDialogueCard.hidden = true;
    }
    disableLoadingChat({ hidden: true });
    startPortraitLoading("正在生成助手立绘");
    setBuildAssistant(concept, {
      introText: "等待助手到来，立绘生成完成后再开始对话。",
      record: false,
      portraitReady: false,
      assistantName: "等待助手到来",
      assistantRole: "立绘生成中",
    });
    renderBuildProgress();
  }

  function handleBuildEvent(payload) {
    if (!payload || !state.concept) return;
    console.log("[creator] build:event", payload);

    if (payload.type === "stage") {
      const receivedPortrait = Boolean(payload.loadingPortraitUrl || payload.assistantPortraits);
      if (!receivedPortrait && !state.portraitReady) {
        startPortraitLoading(payload.text || payload.label || "正在生成助手立绘");
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
      pushBuildTimeline({
        type: "stage",
        label: payload.label || "",
        status: payload.status || null,
        text: payload.text || "",
      });
      setDialogue({
        speaker: receivedPortrait ? state.concept.assistantName : "施工进度",
        text: receivedPortrait
          ? "我到了，先接手这轮建店。接下来施工有新进展，我会继续在这里告诉你。"
          : payload.text || payload.label || "收到新的施工进度。",
      });
      renderBuildProgress();
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
      state.buildBlocked = true;
      state.buildReady = false;
      pushBuildTimeline({
        type: "blocked",
        reason: payload.reason || "Missing required build artifacts",
        artifactDir: payload.artifactDir || null,
        missingArtifacts: Array.isArray(payload.missingArtifacts) ? payload.missingArtifacts : [],
      });
      console.warn("[creator] build:blocked", {
        jobId: state.jobId,
        sessionId: state.sessionId,
        reason: payload.reason || "Missing required build artifacts",
        artifactDir: payload.artifactDir || null,
        missingArtifacts: payload.missingArtifacts || [],
      });
      elements.buildActionRow.hidden = true;
      setDialogue({
        speaker: "施工阻塞",
        text:
          payload.reason ||
          "当前 agent 尚未产出建店必需文件，流程已阻塞，暂时不能进入店铺。",
      });
      showCreatorToast("等待真实产物", "缺少必需文件，这轮建店不会自动完成。");
      renderBuildProgress();
      return;
    }

    if (payload.type === "failed") {
      stopPortraitLoading();
      if (elements.creatorDialogueCard) {
        elements.creatorDialogueCard.hidden = false;
      }
      enableLoadingChat();
      state.buildFailed = true;
      state.buildBlocked = false;
      state.buildReady = false;
      pushBuildTimeline({
        type: "failed",
        error: payload.error || "Unknown build failure",
      });
      console.error("[creator] build:failed", {
        jobId: state.jobId,
        sessionId: state.sessionId,
        error: payload.error || "Unknown build failure",
        timeline: state.buildTimeline.slice(),
      });
      elements.buildActionRow.hidden = true;
      setDialogue({
        speaker: "施工中断",
        text: payload.error || "建店任务失败，请重新开始这一轮施工。",
      });
      closeBuildStream();
      showCreatorToast("建店失败", payload.error || "当前 agent 没有完成这轮施工。");
      renderBuildProgress();
      return;
    }

    if (payload.type === "complete") {
      pushBuildTimeline({
        type: "complete",
        sessionId: payload.session?.sessionId || null,
        status: payload.session?.status || null,
      });
      console.log("[creator] build:summary", buildClientBuildSummary(payload.session || null));
      state.sessionId = payload.session?.sessionId || state.sessionId;
      const sessionConcept = hydrateConceptFromSession(payload.session);
      if (sessionConcept) {
        state.concept = sessionConcept;
      }
      renderBuildReady();
      closeBuildStream();
      renderBuildProgress();
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
      showCreatorToast("施工连接波动", "建店流连接有点不稳，正在尝试恢复。");
    };
  }

  async function bootstrapFromServer() {
    try {
      if (new URLSearchParams(window.location.search).get("reset") === "1") {
        await resetTestState({ reload: false });
        window.history.replaceState({}, "", window.location.pathname);
      }

      if (window.NetaAuth) {
        await window.NetaAuth.boot();
      }
      await refreshAuthUi();
      const payload = await requestJson("/api/session", { method: "GET", headers: {} });
      state.defaults.worldName = payload.defaults?.worldName || DEFAULTS.worldName;
      state.agentMeta = payload.adapters?.agent || null;
      initPageCopy();

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
      showCreatorToast("建店服务未连上", "先启动本地服务，再继续接 LLM 和 agent。");
      await refreshAuthUi();
    }
  }

  function initPageCopy() {
    elements.worldEyebrow.textContent = `${state.defaults.worldName} · 世界商店创建`;
    elements.title.textContent = "世界商店创建";
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
      showCreatorToast("还没写店铺主题", "先输入一句店铺设想，再继续往下建店。");
      elements.shopIdeaInput.focus();
      return;
    }

    if (!(await ensureNetaAuth())) return;

    elements.generateConceptButton.disabled = true;
    elements.shopIdeaInput.disabled = true;
    showIdeaLlmLoading("正在整理这家店的建店草案");
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
      showCreatorToast("建店草案生成失败", error.message || "本地编排器没有返回有效设定。");
    } finally {
      hideIdeaLlmLoading();
      elements.shopIdeaInput.disabled = false;
      elements.generateConceptButton.disabled = false;
    }
  }

  async function handleStartBuild() {
    console.log("[creator] start-build:click", {
      hasConcept: Boolean(state.concept),
      currentStep: elements.page?.dataset?.step,
    });
    if (!state.concept) return;
    if (!(await ensureNetaAuth())) return;

    elements.startBuildButton.disabled = true;
    elements.backToIdeaButton.disabled = true;

    resetBuildView();
    showAwaitingAgentState(state.concept);
    setStep("building");
    try {
      const payload = await requestJson("/api/build/start", {
        method: "POST",
        body: JSON.stringify({
          worldName: state.defaults.worldName,
          shopIdea: state.concept.shopIdea,
          concept: state.concept,
        }),
      });
      state.jobId = payload.jobId;
      state.sessionId = payload.sessionId;
      console.log("[creator] build:start", payload);
      connectBuildStream(payload.jobId);
    } catch (error) {
      console.error("Failed to start build job", error);
      showCreatorToast("施工没有启动", "本地 builder 没有成功接住这次建店请求。");
      setStep("confirm");
    } finally {
      elements.startBuildButton.disabled = false;
      elements.backToIdeaButton.disabled = false;
    }
  }

  async function handleLoadingChat() {
    const message = elements.loadingChatInput.value.trim();
    if (!message) return;
    if (!(await ensureNetaAuth())) return;

    elements.loadingChatInput.value = "";
    elements.loadingChatInput.disabled = true;
    elements.sendLoadingChatButton.disabled = true;
    startDialogueLoading(message, `${state.concept?.assistantName || "店员助手"}正在整理回答`);
    try {
      const reply = await replyDuringLoadingDirect(state.concept, message);
      console.log("[creator] loading-chat:response", reply);
      stopLoadingLoop();
      setDialogue({
        speaker: state.concept.assistantName,
        text: reply?.text || "我先继续处理这轮建店。",
      });
    } catch (error) {
      console.error("Failed to send loading chat", error);
      stopLoadingLoop();
      elements.loadingChatInput.value = message;
      showCreatorToast("对话暂时没接上", "角色 LLM 当前没有返回内容，稍后再试一次。");
    }
    elements.loadingChatInput.disabled = false;
    elements.sendLoadingChatButton.disabled = false;
    elements.loadingChatInput.focus();
  }

  async function handleEnterShop() {
    closeBuildStream();
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
    showShopPage();
  }

  async function handleRebuild() {
    closeBuildStream();
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
    startProbeLoading("正在用当前 app 的 OAuth token 直连 LLM 网关");

    try {
      const result = await requestDirectLlm(
        [
          {
            role: "user",
            content: "请只回复这四个字：测试成功",
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
          "LLM 自检成功",
          `模型：${result.model}`,
          `状态：HTTP ${result.status}`,
          `返回：${result.text}`,
        ].join("\n"),
      );
    } catch (error) {
      renderProbeResult(
        "error",
        [
          "LLM 自检失败",
          `原因：${error.message || "未知错误"}`,
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
  elements.llmProbeButton?.addEventListener("click", handleRunLlmProbe);
  elements.netaAuthButton?.addEventListener("click", async () => {
    const auth = window.NetaAuth;
    if (!auth) {
      showCreatorToast("Neta 模块缺失", "认证脚本尚未加载。");
      return;
    }
    if (await auth.isAuthenticated().catch(() => false)) {
      showCreatorToast("Neta 已连接", "现在可以继续生成店铺设定。");
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
