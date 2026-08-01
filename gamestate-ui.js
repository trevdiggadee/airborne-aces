"use strict";

  // ---------- Game state ----------
  let state = "start"; // start | playing | over
  let score = 0;
  let gameplayScore = 0; // dodge-only score used for boss pacing; excludes bonus-round points
  let best = 0;
  try {
    best = parseInt(localStorage.getItem("aa_best") || "0", 10) || 0;
  } catch (e) { best = 0; }

  // ---------- Checkpoint pickup — collectible glowing item after each bonus round ----------
  let checkpointPickup = null; // { x, y, r, bobPhase, targetNum, collected, vx }
  let checkpointReached = 0; // next boss number the player still has to face (0 = none)
  let checkpointScore = 0; // score stored when checkpoint was collected — enables second life
  let checkpointGameplayScore = 0; // gameplayScore at that same moment — keeps boss pacing in sync on resume
  let checkpointBossesDefeated = 0;

  /* ===== Tutorial System ===== */
  // Walks a first-time player through the core mechanics before their first
  // real run starts. Reuses the same 36-frame Flight Tutor sprite sheet as
  // the pre-flight cutscene (TUTOR_SHEET_URL/COLS/ROWS/FRAMES/FPS, defined
  // in menu-intro.js) so the guide here is the same character, not a
  // placeholder icon.
  const TUTORIAL_STEPS = [
    "Tap or click anywhere to climb \u2014 let go and you'll glide back down.",
    "Dodge the buildings, birds, and balloons \u2014 a hit costs you a heart!",
    "Grab hearts to heal up, and shields to block one hit for free.",
    "Dodge cleanly to fill your Storm meter, then tap it for a burst of power.",
    "Reach the boss at the end of each stretch and beat them to keep flying!"
  ];
  const TUTORIAL_STEP_MS = 3400; // auto-advance delay if the player doesn't tap

  let tutGuideAnimTimer = null;
  function setTutGuideFrame(i) {
    const el = document.getElementById("tutGuideChar");
    if (!el) return;
    const col = i % TUTOR_COLS;
    const row = Math.floor(i / TUTOR_COLS);
    el.style.backgroundPosition = (col / (TUTOR_COLS - 1)) * 100 + "% " + (row / (TUTOR_ROWS - 1)) * 100 + "%";
  }
  function startTutGuideSpriteAnim() {
    const el = document.getElementById("tutGuideChar");
    if (!el) return;
    el.style.backgroundImage = 'url("' + TUTOR_SHEET_URL + '")';
    let frame = 0;
    setTutGuideFrame(0);
    if (tutGuideAnimTimer) clearInterval(tutGuideAnimTimer);
    tutGuideAnimTimer = setInterval(() => {
      frame = (frame + 1) % TUTOR_FRAMES;
      setTutGuideFrame(frame);
    }, 1000 / TUTOR_FPS);
  }
  function stopTutGuideSpriteAnim() {
    if (tutGuideAnimTimer) { clearInterval(tutGuideAnimTimer); tutGuideAnimTimer = null; }
  }

  function startTutorial() {
    state = "tutorial";
    const overlay = document.getElementById("tutorialGuide");
    const textEl = document.getElementById("tutBubbleText");
    const stepEl = document.getElementById("tutStepCount");
    const bubbleEl = overlay.querySelector(".tutBubble");
    const skipBtn = document.getElementById("tutSkipBtn");

    overlay.classList.remove("hidden");
    startTutGuideSpriteAnim();

    let stepIndex = 0;
    let stepTimer = null;
    let done = false;

    function showStep(i) {
      stepIndex = i;
      textEl.textContent = TUTORIAL_STEPS[i];
      stepEl.textContent = (i + 1) + " / " + TUTORIAL_STEPS.length;
      clearTimeout(stepTimer);
      stepTimer = setTimeout(advance, TUTORIAL_STEP_MS);
    }

    function advance() {
      if (stepIndex < TUTORIAL_STEPS.length - 1) {
        showStep(stepIndex + 1);
      } else {
        finish();
      }
    }

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(stepTimer);
      stopTutGuideSpriteAnim();
      overlay.classList.add("hidden");
      bubbleEl.removeEventListener("click", advance);
      skipBtn.removeEventListener("click", onSkip);
      if (state === "tutorial") { state = "playing"; startGame(); }
    }

    function onSkip(e) {
      e.stopPropagation();
      finish();
    }

    bubbleEl.addEventListener("click", advance);
    skipBtn.addEventListener("click", onSkip);

    showStep(0);
  }
 // bossesDefeatedCount at that same moment — keeps the level/background in sync on resume

  const startOverlay = document.getElementById("startOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const scoreVal = document.getElementById("scoreVal");

  function bumpScorePop() {
    scoreVal.classList.remove("pop");
    void scoreVal.offsetWidth; // restart the animation
    scoreVal.classList.add("pop");
  }

  // ---------- Survival timer (top-right) ----------
  const timerFrame = document.getElementById("timerFrame");
  let runStartTime = 0;
  let elapsedMs = 0;

// ---------- Flip Clock logic — mechanical card flip animation ----------
  const flipClockState = { m1: '0', m2: '0', s1: '0', s2: '0' };

  function updateFlipClock(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const mStr = String(m).padStart(2, '0');
    const sStr = String(s).padStart(2, '0');
    const newDigits = { m1: mStr[0], m2: mStr[1], s1: sStr[0], s2: sStr[1] };

    Object.entries(newDigits).forEach(([pos, newVal]) => {
      const oldVal = flipClockState[pos];
      if (newVal !== oldVal) {
        flipClockState[pos] = newVal;
        animateFlip(pos, oldVal, newVal);
      }
    });
  }

  function animateFlip(pos, fromVal, toVal) {
    const staticEl = document.getElementById('fc-' + pos + '-static');
    const cardEl = document.getElementById('fc-' + pos);
    const topEl = document.getElementById('fc-' + pos + '-top');
    const bottomEl = document.getElementById('fc-' + pos + '-bottom');

    if (!staticEl || !cardEl || !topEl || !bottomEl) return;

    // Set up the flip: top half shows old value, bottom half will show new value
    topEl.querySelector('.digit').textContent = fromVal;
    bottomEl.querySelector('.digit').textContent = toVal;

    // Show the animated card, hide the static one
    staticEl.style.display = 'none';
    cardEl.style.display = '';

    // Reset animations
    topEl.classList.remove('flipping');
    bottomEl.classList.remove('flipping');
    void topEl.offsetWidth; // force reflow

    // Start the flip
    topEl.classList.add('flipping');
    bottomEl.classList.add('flipping');

    // After animation completes, update static to new value and show it
    setTimeout(() => {
      staticEl.textContent = toVal;
      staticEl.style.display = '';
      cardEl.style.display = 'none';
      topEl.classList.remove('flipping');
      bottomEl.classList.remove('flipping');
    }, 450);
  }

  // ---------- Health (4 hits before a crash) ----------
  const MAX_HEALTH = 4;
  const HEART_KEYS = ["asset_extra_11", "asset_extra_12", "asset_extra_13", "asset_extra_14", "heartPickup"];
  const HEART_URLS = [
    "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/asset_extra_11.webp?cb=2", // 0 hits left
    "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/asset_extra_12.webp?cb=2",   // 1 hit left
    "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/asset_extra_13.webp?cb=2",   // 2 hits left
    "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/asset_extra_14.webp?cb=2",   // 3 hits left
    "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/heartPickup.webp?cb=2"   // 4 hits left (full health)
  ];
  const HEART_IMAGES = PLACEHOLDER_MODE ? HEART_KEYS.map(renderPlaceholder) : HEART_URLS;
  const MAX_BONUS_HEARTS = 2; // how many extra hearts can stack on top of a full bar
  const healthMeter = document.getElementById("healthMeter");
  const healthImg = document.getElementById("healthImg");
  const bonusHeartsEl = document.getElementById("bonusHearts");
  let health = MAX_HEALTH;
  let invulnerableUntil = 0; // timestamp (ms) — no damage taken before this

  function updateHealthDisplay() {
    healthImg.src = HEART_IMAGES[Math.max(0, Math.min(MAX_HEALTH, health))];

    const bonus = Math.max(0, health - MAX_HEALTH);
    while (bonusHeartsEl.children.length > bonus) {
      bonusHeartsEl.removeChild(bonusHeartsEl.lastChild);
    }
    while (bonusHeartsEl.children.length < bonus) {
      const img = document.createElement("img");
      img.src = HEART_IMAGES[4];
      img.alt = "Bonus heart";
      bonusHeartsEl.appendChild(img);
    }
  }

  function takeHit() {
    if (state !== "playing") return;
    if (bonusActive) return; // invincible during the bonus round
    if (shieldActive) {
      // the shield absorbs the hit — a spark, a soft chime, and a bright ripple on the bubble itself
      spawnHitParticles(player.x, player.y);
      sfxDeflect();
      shieldImpactTime = performance.now();
      return;
    }
    if (performance.now() < invulnerableUntil) return; // still invulnerable from the last hit

    health--;
    dodgeStreak = 0;
    updateHealthDisplay();
    healthMeter.classList.remove("hit");
    void healthMeter.offsetWidth; // restart the pulse animation
    healthMeter.classList.add("hit");
    invulnerableUntil = performance.now() + 1200;
    sfxHit();
    triggerScreenShake(4, 200);

    if (health <= 0) {
      crash();
    }
  }

  function startGame() {
    ensureAudio();
    setMusicTheme(THEME_NORMAL);
    startMusic();
    // force hide overlays
    document.getElementById("startOverlay").classList.add("hidden");
    document.getElementById("gameOverOverlay").classList.add("hidden");
    score = 0;
    gameplayScore = 0;
    dodgeStreak = 0;
    comboPopups = [];
    shieldPickup = null;
    shieldActive = false;
    shieldSpawnTimer = 25 + Math.random() * 15;
    rainDrops = [];
    lightningState = null;
    lightningTimer = 3 + Math.random() * 3;
    stormCloudsDecorative = []; cloudWisps = [];
    scoreVal.textContent = "0";
    elapsedMs = 0;
    runStartTime = performance.now();
    updateFlipClock(elapsedMs);
    health = MAX_HEALTH;
    invulnerableUntil = 0;
    updateHealthDisplay();
    obstacles = [];
    spawnTimer = 0;
    spawnInterval = 1.7;
    obstacleSpeed = 220;
    lastBossTriggered = 0;
    checkpointPickup = null;
    checkpointReached = 0;
    checkpointScore = 0;
    checkpointGameplayScore = 0;
    checkpointBossesDefeated = 0;
    bossNumber = 0;
    bossesDefeatedCount = 0;
    bossActive = false;
    boss = null;
    powerup = null;
    hasFirepower = false;
    hasDualFire = false;
    hasArcBomb = false;
    powerupRespawnTimer = 0;
    bullets = [];
    bulletTimer = 0;
    bombs = [];
    bombTimer = 0;
    playerBombs = [];
    playerBombTrailParticles = [];
    arcBombTimer = 0;
    bonusActive = false;
    bonusType = null;
    bonusPending = false;
    bonusPendingType = null;
    bonusItems = [];
    bonusTotal = 0;
    bonusCollected = 0;
    bonusPoints = 0;
    rockets = [];
    rocketTimer = 0;
    bossThrowFrame = 0;
    bossThrowFrameTimer = 0;
    bossThrowBombSpawned = false;
    bossBanner = null;
    bossHitFlashUntil = 0;
    bossShakeUntil = 0;
    hitParticles = [];
    explosionBursts = [];
    windParticles = [];
    healPickup = null;
    healSpawnTimer = 6 + Math.random() * 5;
    stormCharge = 0;
    stormMilestoneCount = Math.floor(score / STORM_CHARGE_PER_MILESTONE);
    stormWasReady = false;
    stormActive = false;
    stormCloud = null;
    stormChainBolts = [];
    updateStormMeterDisplay();
    defeatDebris = [];
    shockwaves = [];
    groundVehicles = [];
    buildingSmokeParticles = [];
    defeatSlowMo = false;
    resetPlayer();
    blimpPersonality.squashX = 1;
    blimpPersonality.squashY = 1;
    blimpPersonality.exhaustParticles = [];
    blimpPersonality.propAngle = 0;
    blimpPersonality.propBlurOpacity = 0;
    initBuildings();
    initClouds();
    birdFlocks = [];
    birdFlockTimer = 6 + Math.random() * 8;
    initParallaxLayers();
    showBanner("LEVEL 1", 2000, "level");
    
    state = "playing";
    startOverlay.classList.add("hidden");
    gameOverOverlay.classList.add("hidden");
  }

  function crash() {
    if (state !== "playing") return;
    state = "over";
    state = "over";
    sfxCrash();
    triggerScreenShake(10, 600);
    triggerScreenFlash(0.4, 400);
    stopMusic();
    defeatDebris = [];
    shockwaves = [];
    groundVehicles = [];
    buildingSmokeParticles = [];
    defeatSlowMo = false;
    if (score > best) {
      best = score;
      try { localStorage.setItem("aa_best", String(best)); } catch (e) {}
    }
    document.getElementById("finalScore").textContent = score;
    document.getElementById("bestScoreLine").textContent = "Best: " + best;
    document.getElementById("checkpointBtn").classList.toggle("hidden", checkpointReached <= 0);
    gameOverOverlay.classList.remove("hidden");
  }

  document.getElementById("startBtn").addEventListener("click", () => { ensureAudio(); sfxClick(); startGame(); document.getElementById("startOverlay").classList.add("hidden"); });
  document.getElementById("retryBtn").addEventListener("click", () => { ensureAudio(); sfxClick(); startGame(); });

  document.getElementById("checkpointBtn").addEventListener("click", () => {
    ensureAudio();
    sfxClick();
    restartFromCheckpoint();
  });

  document.getElementById("menuBtn").addEventListener("click", () => {
    ensureAudio();
    sfxClick();
    state = "start";
    checkpointReached = 0;
    checkpointScore = 0;
    checkpointGameplayScore = 0;
    checkpointBossesDefeated = 0;
    gameOverOverlay.classList.add("hidden");
    document.getElementById("gameScreen").style.display = "none";
    const menuScreenEl = document.getElementById("menuScreen");
    menuScreenEl.style.display = "";
    if (window.__airborneShowMenu) window.__airborneShowMenu();
  });

  function restartFromCheckpoint() {
    // Resume game from last checkpoint — keep score, reset health, clear threats
    ensureAudio();
    setMusicTheme(THEME_NORMAL);
    startMusic();

    // Restore score to checkpoint level
    score = checkpointScore;
    scoreVal.textContent = score;
    // gameplayScore and lastBossTriggered drive boss pacing — without restoring
    // these too, they'd stay at their pre-crash values (later than the checkpoint),
    // which could let the player skip straight past a boss they never actually beat
    gameplayScore = checkpointGameplayScore;
    bossesDefeatedCount = checkpointBossesDefeated;
    lastBossTriggered = Math.max(0, checkpointReached - 1);

    // Reset health
    health = MAX_HEALTH;
    invulnerableUntil = performance.now() + 2000;
    updateHealthDisplay();

    // Clear all threats
    obstacles = [];
    bombs = [];
    rockets = [];
    playerBombs = [];
    playerBombTrailParticles = [];
    bullets = [];
    hitParticles = [];
    explosionBursts = [];
    windParticles = [];
    comboPopups = [];

    // Clear boss state
    bossActive = false;
    boss = null;
    bossNumber = 0;
    bossThrowFrame = 0;
    bossThrowFrameTimer = 0;
    bossThrowBombSpawned = false;
    bossBanner = null;
    bossHitFlashUntil = 0;
    bossShakeUntil = 0;

    // Clear powerups and pickups
    powerup = null;
    hasFirepower = false;
    hasDualFire = false;
    hasArcBomb = false;
    powerupRespawnTimer = 0;
    checkpointPickup = null;
    healPickup = null;
    shieldPickup = null;
    shieldActive = false;

    // Reset timers
    spawnTimer = 0;
    spawnInterval = Math.max(0.95, 1.7 - score * 0.03);
    obstacleSpeed = 220 + Math.min(160, score * 6);
    bulletTimer = 0;
    bombTimer = 0;
    rocketTimer = 0;
    arcBombTimer = 0;
    healSpawnTimer = 6 + Math.random() * 5;
    shieldSpawnTimer = 25 + Math.random() * 15;

    // Reset bonus state
    bonusActive = false;
    bonusType = null;
    bonusPending = false;
    bonusPendingType = null;
    bonusItems = [];
    bonusTotal = 0;
    bonusCollected = 0;
    bonusPoints = 0;

    // Reset storm
    stormCharge = 0;
    stormCloudsDecorative = []; cloudWisps = [];
    stormMilestoneCount = 0;
    stormWasReady = false;
    stormActive = false;
    stormCloud = null;
    stormChainBolts = [];
    updateStormMeterDisplay();
    defeatDebris = [];
    shockwaves = [];
    groundVehicles = [];
    buildingSmokeParticles = [];
    defeatSlowMo = false;

    // Reset player
    resetPlayer();
    blimpPersonality.squashX = 1;
    blimpPersonality.squashY = 1;
    blimpPersonality.exhaustParticles = [];
    blimpPersonality.propAngle = 0;
    blimpPersonality.propBlurOpacity = 0;

    // Reset buildings and clouds
    initBuildings();
    initClouds();
    initParallaxLayers(); // resync the background to the restored level immediately — no crossfade, no stray "LEVEL X" banner

    // Resume
    state = "playing";
    runStartTime = performance.now() - elapsedMs;
    gameOverOverlay.classList.add("hidden");
    showBanner("RESUMED FROM CHECKPOINT!", 2000, "checkpoint");
  }

  const muteBtn = document.getElementById("muteBtn");
  if (muteBtn) {
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ensureAudio();
      setMuted(!muted);
    });
  }

  // Bridge for the menu screen: calling this begins gameplay immediately,
  // skipping this screen's own start overlay. If assets are still loading
  // (should be near-instant since they're embedded base64), the start is
  // queued and fires the moment loading finishes.
  let pendingStart = false;
  function bridgeStart() {
    if (assetsLoaded === assetKeys.length) {
      startTutorial();
    } else {
      pendingStart = true;
    }
  }
  window.__airborneGameStart = bridgeStart;

  function handleInput(e) {
    if (e.cancelable) e.preventDefault();
    ensureAudio();
    if (state === "playing") flap();
  }
  canvas.addEventListener("touchstart", handleInput, { passive: false });
  canvas.addEventListener("mousedown", handleInput);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      ensureAudio();
      if (state === "playing") flap();
    }
  });


  // =====================================================================
  // FEATURE ADDITIONS: Screen Effects, Atmospheric Particles, 
  // Parallax Layers, Blimp Personality
  // =====================================================================

  // ---------- Screen Effects System ----------
  const screenChromatic = document.getElementById('screenChromatic');
  const screenFlash = document.getElementById('screenFlash');
  let screenShakeIntensity = 0;
  let screenShakeDecay = 0;
  let screenShakeOffsetX = 0;
  let screenShakeOffsetY = 0;

  function triggerScreenShake(intensity, durationMs) {
    screenShakeIntensity = intensity;
    screenShakeDecay = intensity / (durationMs / 1000);
  }

  function updateScreenEffects(dt) {
    // Chromatic aberration on high-speed moments
    if (screenChromatic) {
      const speed = Math.abs(player.vy);
      const chromaIntensity = Math.min(1, (speed - 300) / 400);
      screenChromatic.classList.toggle('active', chromaIntensity > 0.3 || bossActive);
      screenChromatic.style.opacity = (0.05 + chromaIntensity * 0.08).toFixed(3);
    }

    // Screen shake decay
    if (screenShakeIntensity > 0) {
      screenShakeIntensity -= screenShakeDecay * dt;
      if (screenShakeIntensity < 0) screenShakeIntensity = 0;
      screenShakeOffsetX = (Math.random() - 0.5) * screenShakeIntensity * 2;
      screenShakeOffsetY = (Math.random() - 0.5) * screenShakeIntensity * 2;
      canvas.style.transform = 'translate(' + screenShakeOffsetX.toFixed(1) + 'px,' + screenShakeOffsetY.toFixed(1) + 'px)';
    } else {
      canvas.style.transform = '';
    }
  }

  function triggerScreenFlash(opacity, durationMs) {
    if (!screenFlash) return;
    screenFlash.style.opacity = opacity;
    screenFlash.style.transition = 'opacity ' + (durationMs * 0.3) + 'ms ease-in, opacity ' + (durationMs * 0.7) + 'ms ease-out ' + (durationMs * 0.3) + 'ms';
    requestAnimationFrame(() => {
      screenFlash.style.opacity = '0';
    });
  }

