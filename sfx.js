(function initShopSfx() {
  const BASE = "./assets/sfx";
  const CREATOR_BGM_URL = "https://oss.talesofai.cn/fe_assets/mng/71/39815ab076db8f8e5905831ead1b7448.mp3";
  const FILES = {
    tap: "ui_tap.ogg",
    pickup: "item_pickup.ogg",
    drop: "item_drop.ogg",
    invalid: "invalid_move.ogg",
    merge1: "merge_pop_01.ogg",
    merge2: "merge_pop_02.ogg",
    merge3: "merge_pop_03.ogg",
    sparkle: "merge_success_sparkle.ogg",
    chain: "merge_chain.ogg",
    unlock: "unlock_new_item.ogg",
    coin: "reward_coin.ogg",
    level: "level_up.ogg",
  };
  const VOLUME = {
    tap: 0.28,
    pickup: 0.34,
    drop: 0.36,
    invalid: 0.26,
    merge1: 0.42,
    merge2: 0.46,
    merge3: 0.5,
    sparkle: 0.34,
    chain: 0.42,
    unlock: 0.5,
    coin: 0.5,
    level: 0.58,
  };

  const library = new Map();
  let bgmAudio = null;
  let bgmWanted = false;
  let unlocked = false;
  let muted = false;

  function getAudio(name) {
    if (!FILES[name]) return null;
    if (!library.has(name)) {
      const audio = new Audio(`${BASE}/${FILES[name]}`);
      audio.preload = "auto";
      audio.volume = VOLUME[name] ?? 0.4;
      library.set(name, audio);
    }
    return library.get(name);
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.keys(FILES).forEach((name) => getAudio(name));
    if (bgmWanted) playCreatorBgm();
  }

  function getCreatorBgm() {
    if (!bgmAudio) {
      bgmAudio = new Audio(CREATOR_BGM_URL);
      bgmAudio.loop = true;
      bgmAudio.preload = "auto";
      bgmAudio.volume = 0.24;
      bgmAudio.crossOrigin = "anonymous";
    }
    return bgmAudio;
  }

  function playCreatorBgm() {
    bgmWanted = true;
    if (muted || !unlocked) return;
    const audio = getCreatorBgm();
    audio.play().catch(() => {});
  }

  function stopCreatorBgm() {
    bgmWanted = false;
    if (!bgmAudio) return;
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
  }

  function play(name, options = {}) {
    if (muted || !unlocked) return;
    const source = getAudio(name);
    if (!source) return;
    const audio = source.cloneNode(true);
    audio.volume = Math.max(0, Math.min(1, options.volume ?? source.volume));
    audio.play().catch(() => {});
  }

  function playSequence(names, delayMs = 64) {
    names.forEach((name, index) => {
      window.setTimeout(() => play(name), index * delayMs);
    });
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    if (muted) {
      bgmAudio?.pause();
    } else if (bgmWanted) {
      playCreatorBgm();
    }
  }

  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target?.closest?.("button, [role='button'], a, input[type='submit']");
      if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
      play("tap");
    },
    true,
  );

  window.ShopSfx = {
    play,
    playSequence,
    playCreatorBgm,
    setMuted,
    stopCreatorBgm,
    unlock,
  };
})();
