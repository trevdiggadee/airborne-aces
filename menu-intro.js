"use strict";


const BLIMP_DATA = {
  blimp1: { url: "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/asset_extra_06.webp?cb=2", key: "asset_extra_06", name: "Zeppelin Ace", effect: "propeller" },
  blimp2: { url: "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/blimp2_main.webp?cb=2", key: "blimp2_main", name: "Deco Liner", effect: null },
  blimp3: { url: "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/blimp3_main.webp?cb=2", key: "blimp3_main", name: "Aero Slicer", effect: null },
  blimp4: { url: "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/blimp4_main.webp?cb=2", key: "blimp4_main", name: "Steampunk", effect: null }
};

// blimps with a real in-game flight animation get that same animation on the
// menu hero card too; anything not listed here just shows its static image
const AA_ASSET_BASE = "https://raw.githubusercontent.com/trevdiggadee/airborne-aces/main/";

// ---------- Flight-tutor cutscene assets — 36-frame idle/talk loop baked into a 6x6 sheet ----------
const TUTOR_SHEET_URL = AA_ASSET_BASE + "tutor_dialogue_sheet.webp?cb=2";
const TUTOR_COLS = 6, TUTOR_ROWS = 6, TUTOR_FRAMES = 36, TUTOR_FPS = 20;
function heroFramesFor(count, prefix) {
  return Array.from({ length: count }, (_, i) => AA_ASSET_BASE + prefix + String(i + 1).padStart(2, "0") + ".webp?cb=2");
}
const HERO_ANIM = {
  blimp1: { urls: heroFramesFor(36, "player_blimp_"), fps: 24 },
  blimp2: { urls: heroFramesFor(25, "blimp2_flight_"), fps: 18 },
  blimp3: { urls: heroFramesFor(25, "blimp3_flight_"), fps: 18 },
  blimp4: { urls: heroFramesFor(25, "blimp4_flight_"), fps: 18 }
};

function blimpSrc(data) {
  return (typeof PLACEHOLDER_MODE !== "undefined" && PLACEHOLDER_MODE) ? renderPlaceholder(data.key) : data.url;
}

let selectedBlimp = "blimp1";

const heroBlimpLayers = [
  document.getElementById("heroBlimpImgA"),
  document.getElementById("heroBlimpImgB")
];
const propBlur = document.getElementById("propBlur");
const smokeParticles = document.getElementById("smokeParticles");

let heroAnimTimer = null;
let heroAnimFrame = 0;
let heroActiveLayer = 0;
let heroAnimGen = 0; // bumped every time startHeroAnimation runs, so a stale
                      // in-flight priming pass can never clobber a newer one

function preloadImages(sources) {
  return Promise.all(sources.map(src => new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => (img.decode ? img.decode().then(resolve).catch(resolve) : resolve());
    img.onerror = resolve;
    img.src = src;
  })));
}

// Cache of animation keys whose full frame set has already been decoded, so
// re-selecting a blimp (or re-showing the menu) never re-primes needlessly
const heroAnimPrimed = {};
function primeHeroAnimation(key) {
  const anim = HERO_ANIM[key];
  if (!anim) return Promise.resolve();
  if (heroAnimPrimed[key]) return Promise.resolve();
  return preloadImages(anim.urls).then(() => { heroAnimPrimed[key] = true; });
}

function startHeroAnimation(key) {
  const gen = ++heroAnimGen;
  if (heroAnimTimer) {
    clearInterval(heroAnimTimer);
    heroAnimTimer = null;
  }
  const [layerA, layerB] = heroBlimpLayers;
  const anim = (typeof PLACEHOLDER_MODE !== "undefined" && PLACEHOLDER_MODE) ? null : HERO_ANIM[key];

  // reset both layers to a clean, non-animated state before (re)starting
  layerA.style.transition = "none";
  layerB.style.transition = "none";
  layerB.style.opacity = 0;
  layerA.style.opacity = 1;
  heroActiveLayer = 0;

  if (!anim) {
    layerA.src = blimpSrc(BLIMP_DATA[key]);
    return;
  }

  heroAnimFrame = 0;
  // show the first frame immediately so there's never a blank hero card,
  // even while the rest of the animation's frames are still being primed
  layerA.src = anim.urls[0];

  // Every frame swap in the crossfade below assumes the image is already
  // downloaded AND decoded, otherwise the browser can briefly show nothing
  // while it fetches/decodes mid-fade, which reads as blinking. So we fully
  // prime (fetch + decode) every frame of this animation before the
  // interval-driven crossfade loop is allowed to start.
  primeHeroAnimation(key).then(() => {
    // if the user switched blimps (or the menu was re-shown with a different
    // selection) while we were priming, abandon this stale start
    if (gen !== heroAnimGen) return;

    layerB.src = anim.urls[1 % anim.urls.length];

    const frameMs = 1000 / anim.fps;
    const fadeMs = Math.max(40, frameMs * 0.7); // smooth blend, still shorter than the frame interval

    heroAnimTimer = setInterval(() => {
      heroAnimFrame = (heroAnimFrame + 1) % anim.urls.length;
      const outgoing = heroBlimpLayers[heroActiveLayer];
      const incoming = heroBlimpLayers[1 - heroActiveLayer];

      incoming.src = anim.urls[heroAnimFrame];
      incoming.style.transition = "none";
      outgoing.style.transition = "none";
      // force layout so the browser commits the "none" transition before we re-enable it below
      void incoming.offsetWidth;

      incoming.style.transition = `opacity ${fadeMs}ms linear`;
      outgoing.style.transition = `opacity ${fadeMs}ms linear`;
      incoming.style.opacity = 1;
      outgoing.style.opacity = 0;

      heroActiveLayer = 1 - heroActiveLayer;
    }, frameMs);
  });
}

// Set the default hero image right away (placeholder mode skips the network round trip)
startHeroAnimation("blimp1");

// Preload every blimp asset (static hero images + full animation sets) once
// up front so switching, and the animation itself, never stutters. This also
// warms the browser's image cache for primeHeroAnimation() above.
preloadImages(Object.values(BLIMP_DATA).map(b => blimpSrc(b)));
if (!(typeof PLACEHOLDER_MODE !== "undefined" && PLACEHOLDER_MODE)) {
  preloadImages(Object.values(HERO_ANIM).flatMap(a => a.urls));
}
preloadImages([TUTOR_SHEET_URL]);

// ---------- Centralized volume preferences — music and SFX independently
// adjustable from the menu control panel, persisted, and applied to every
// sound source: menu music, gameplay MP3, the procedural music synth, and SFX. ----------
let musicVolumePref = 0.25;
let sfxVolumePref = 1.0;
try {
  const savedMusicVol = localStorage.getItem("aa_music_vol");
  const savedSfxVol = localStorage.getItem("aa_sfx_vol");
  if (savedMusicVol !== null) musicVolumePref = Math.max(0, Math.min(1, parseFloat(savedMusicVol)));
  if (savedSfxVol !== null) sfxVolumePref = Math.max(0, Math.min(1, parseFloat(savedSfxVol)));
} catch (e) {}

function setMusicVolumePref(v) {
  musicVolumePref = Math.max(0, Math.min(1, v));
  try { localStorage.setItem("aa_music_vol", String(musicVolumePref)); } catch (e) {}
  menuMusicFadeStep();
  if (gameplayMusic && !gameplayMusic.paused && !gameplayMusicMuted) {
    gameplayMusic.volume = musicVolumePref;
  }
  if (window.__airborneSetSynthMusicVolume) window.__airborneSetSynthMusicVolume(musicVolumePref);
}
function setSfxVolumePref(v) {
  sfxVolumePref = Math.max(0, Math.min(1, v));
  try { localStorage.setItem("aa_sfx_vol", String(sfxVolumePref)); } catch (e) {}
  if (window.__airborneSetSfxVolume) window.__airborneSetSfxVolume(sfxVolumePref);
}

// wire up the actual slider UI on the menu screen
(function initVolumeControls() {
  const musicSlider = document.getElementById("musicVolumeSlider");
  const sfxSlider = document.getElementById("sfxVolumeSlider");
  const musicValueEl = document.getElementById("musicVolumeValue");
  const sfxValueEl = document.getElementById("sfxVolumeValue");
  if (musicSlider) {
    musicSlider.value = Math.round(musicVolumePref * 100);
    if (musicValueEl) musicValueEl.textContent = musicSlider.value + "%";
    musicSlider.addEventListener("input", () => {
      const v = parseInt(musicSlider.value, 10) / 100;
      setMusicVolumePref(v);
      if (musicValueEl) musicValueEl.textContent = musicSlider.value + "%";
    });
  }
  if (sfxSlider) {
    sfxSlider.value = Math.round(sfxVolumePref * 100);
    if (sfxValueEl) sfxValueEl.textContent = sfxSlider.value + "%";
    sfxSlider.addEventListener("input", () => {
      const v = parseInt(sfxSlider.value, 10) / 100;
      setSfxVolumePref(v);
      if (sfxValueEl) sfxValueEl.textContent = sfxSlider.value + "%";
    });
  }
})();

// ---------- Menu background music — a real audio file, faded in/out at the
// loop seam so restarting the track doesn't sound like a hard cut ----------
const menuMusic = document.getElementById("menuMusic");
const MENU_MUSIC_FADE_SEC = 1.5; // fade in at the start / fade out near the end of each loop
let menuMusicUnlocked = false;   // becomes true once a user gesture lets audio actually play

try {
  menuMusicUnlocked = false;
  const wasMuted = localStorage.getItem("aa_muted") === "1";
  if (menuMusic) menuMusic.volume = 0; // always start silent; timeupdate ramps it up
  if (wasMuted && menuMusic) menuMusic.dataset.userMuted = "1";
} catch (e) {}

function menuMusicFadeStep() {
  if (!menuMusic || menuMusic.paused || !menuMusic.duration) return;
  if (menuMusic.dataset.userMuted === "1") { menuMusic.volume = 0; return; }
  const t = menuMusic.currentTime;
  const d = menuMusic.duration;
  let vol = musicVolumePref;
  if (t < MENU_MUSIC_FADE_SEC) {
    vol = musicVolumePref * (t / MENU_MUSIC_FADE_SEC);
  } else if (t > d - MENU_MUSIC_FADE_SEC) {
    vol = musicVolumePref * Math.max(0, (d - t) / MENU_MUSIC_FADE_SEC);
  }
  menuMusic.volume = Math.max(0, Math.min(musicVolumePref, vol));
}
if (menuMusic) menuMusic.addEventListener("timeupdate", menuMusicFadeStep);

function startMenuMusic() {
  if (!menuMusic) return;
  if (menuMusic.paused) {
    menuMusic.play().then(() => { menuMusicUnlocked = true; }).catch(() => {});
  }
}

function stopMenuMusicImmediately() {
  if (!menuMusic || menuMusic.paused) return;
  menuMusic.pause();
  menuMusic.currentTime = 0;
}

// autoplay is usually blocked until the user interacts with the page — try
// right away, and again on the first tap/click anywhere on the menu
startMenuMusic();
document.addEventListener("pointerdown", function unlockMenuMusic() {
  if (!menuMusicUnlocked) startMenuMusic();
}, { passive: true });

window.__airborneShowMenu = () => { startHeroAnimation(selectedBlimp); startMenuMusic(); };

// ---------- Gameplay background music — a real audio file (skyward-march 2.mp3)
// that plays during actual flight. Controlled from the inner game IIFE via the
// window bridge below, hooked into its existing startMusic()/stopMusic()/
// setMuted() calls — so every place that already turns the procedural music
// on or off (game start, retry, checkpoint resume, crash) automatically drives
// this track too, with no extra call sites needed. ----------
const gameplayMusic = document.getElementById("gameplayMusic");
const GAMEPLAY_MUSIC_FADE_MS = 900;
let gameplayMusicMuted = false;
try { gameplayMusicMuted = localStorage.getItem("aa_muted") === "1"; } catch (e) {}
if (gameplayMusic) gameplayMusic.volume = 0;

function fadeGameplayMusicVolume(target, thenPause) {
  if (!gameplayMusic) return;
  const startVol = gameplayMusic.volume;
  const startedAt = performance.now();
  (function step() {
    const p = Math.min(1, (performance.now() - startedAt) / GAMEPLAY_MUSIC_FADE_MS);
    gameplayMusic.volume = startVol + (target - startVol) * p;
    if (p < 1) {
      requestAnimationFrame(step);
    } else if (thenPause) {
      gameplayMusic.pause();
    }
  })();
}

function startGameplayMusic() {
  if (!gameplayMusic) return;
  if (gameplayMusic.paused) gameplayMusic.play().catch(() => {});
  fadeGameplayMusicVolume(gameplayMusicMuted ? 0 : musicVolumePref, false);
}

function stopGameplayMusic() {
  if (!gameplayMusic || gameplayMusic.paused) return;
  fadeGameplayMusicVolume(0, true);
}

function setGameplayMusicMuted(m) {
  gameplayMusicMuted = m;
  if (gameplayMusic && !gameplayMusic.paused) {
    gameplayMusic.volume = m ? 0 : musicVolumePref;
  }
}

window.__airborneStartGameplayMusic = startGameplayMusic;
window.__airborneStopGameplayMusic = stopGameplayMusic;
window.__airborneSetGameplayMusicMuted = setGameplayMusicMuted;

function setEffect(effect) {
  propBlur.style.display = effect === "propeller" ? "block" : "none";
  smokeParticles.style.display = effect === "smoke" ? "block" : "none";
}

function selectBlimp(key, el) {
  selectedBlimp = key;
  const data = BLIMP_DATA[key];

  startHeroAnimation(key);
  setEffect(data.effect);

  document.querySelectorAll(".numBtn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
}

// initialize the default selection's effect
setEffect(BLIMP_DATA.blimp1.effect);

function enterGameplay(){
  document.getElementById("menuScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "block";
  document.getElementById("startOverlay").classList.add("hidden");
  fadeOutMenuMusic();
  if (window.__airborneGameStart) window.__airborneGameStart();
}

// quick fade-out (rather than an abrupt cut) when handing off to gameplay music
function fadeOutMenuMusic() {
  if (!menuMusic || menuMusic.paused) return;
  menuMusic.removeEventListener("timeupdate", menuMusicFadeStep);
  const fadeMs = 350;
  const startVol = menuMusic.volume;
  const startedAt = performance.now();
  (function step() {
    const p = Math.min(1, (performance.now() - startedAt) / fadeMs);
    menuMusic.volume = startVol * (1 - p);
    if (p < 1) {
      requestAnimationFrame(step);
    } else {
      stopMenuMusicImmediately();
      menuMusic.addEventListener("timeupdate", menuMusicFadeStep);
    }
  })();
}

const flyBtn = document.getElementById("flyBtn");
flyBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  flyBtn.classList.add("pressed");
});
["pointerup", "pointercancel", "pointerleave"].forEach(evt => {
  flyBtn.addEventListener(evt, () => flyBtn.classList.remove("pressed"));
});
flyBtn.addEventListener("click", () => { showTutorCutscene(); });

// ---------- Take-Flight cutscene: close-up briefing from the flight tutor ----------
const TUTOR_LINES = [
  "Alright, ace \u2014 engines primed, dial locked in. Let's get you airborne!",
  "Keep her nose up, watch the skyline, and dodge anything that isn't sky.",
  "Reach every boss marker to keep the run going. Ready? Let's fly!"
];
const CUTSCENE_LINE_MS = 6000; // 3 lines x 6s = 18s total, 3x the original 6s hold

const cutsceneScreen = document.getElementById("cutsceneScreen");
const cutsceneBlimpImg = document.getElementById("cutsceneBlimpImg");
const cutsceneTutorWrap = document.getElementById("cutsceneTutorWrap");
const cutsceneTextEl = document.getElementById("cutsceneText");
const cutsceneSkipBtn = document.getElementById("cutsceneSkip");

let tutorAnimTimer = null;
function setTutorFrame(i) {
  const col = i % TUTOR_COLS;
  const row = Math.floor(i / TUTOR_COLS);
  const posX = (col / (TUTOR_COLS - 1)) * 100;
  const posY = (row / (TUTOR_ROWS - 1)) * 100;
  cutsceneTutorWrap.style.backgroundPosition = posX + "% " + posY + "%";
}
function startTutorSpriteAnim() {
  cutsceneTutorWrap.style.backgroundImage = 'url("' + TUTOR_SHEET_URL + '")';
  let frame = 0;
  setTutorFrame(0);
  if (tutorAnimTimer) clearInterval(tutorAnimTimer);
  tutorAnimTimer = setInterval(() => {
    frame = (frame + 1) % TUTOR_FRAMES;
    setTutorFrame(frame);
  }, 1000 / TUTOR_FPS);
}
function stopTutorSpriteAnim() {
  if (tutorAnimTimer) { clearInterval(tutorAnimTimer); tutorAnimTimer = null; }
}

let cutsceneAdvanceTimer = null;
let cutsceneDone = true;
let cutsceneLineIndex = 0;

function showTutorCutscene() {
  cutsceneDone = false;
  cutsceneLineIndex = 0;
  document.getElementById("menuScreen").style.display = "none";
  cutsceneScreen.style.display = "block";

  const data = BLIMP_DATA[selectedBlimp] || BLIMP_DATA.blimp1;
  cutsceneBlimpImg.src = blimpSrc(data);
  showCutsceneLine(0);

  startTutorSpriteAnim();

  cutsceneScreen.addEventListener("click", advanceCutsceneLine);
  cutsceneSkipBtn.addEventListener("click", endCutscene);
}

function showCutsceneLine(i) {
  cutsceneLineIndex = i;
  cutsceneTextEl.textContent = TUTOR_LINES[i];
  // re-trigger the dialogue box's entrance animation for each new line
  const box = document.getElementById("cutsceneDialogue");
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";
  if (cutsceneAdvanceTimer) clearTimeout(cutsceneAdvanceTimer);
  cutsceneAdvanceTimer = setTimeout(advanceCutsceneLine, CUTSCENE_LINE_MS);
}

function advanceCutsceneLine() {
  if (cutsceneDone) return;
  if (cutsceneLineIndex < TUTOR_LINES.length - 1) {
    showCutsceneLine(cutsceneLineIndex + 1);
  } else {
    endCutscene();
  }
}

function endCutscene() {
  if (cutsceneDone) return;
  cutsceneDone = true;
  if (cutsceneAdvanceTimer) { clearTimeout(cutsceneAdvanceTimer); cutsceneAdvanceTimer = null; }
  cutsceneScreen.removeEventListener("click", advanceCutsceneLine);
  cutsceneSkipBtn.removeEventListener("click", endCutscene);
  stopTutorSpriteAnim();
  cutsceneScreen.style.display = "none";
  enterGameplay();
}



