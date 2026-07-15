// ============================================================
//  CYBER-SHIELD: SPARK'S RESCUE — game.js
//  Pilot: LŪKASS · A 3D action-adventure built with Three.js
// ============================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sfx } from './audio.js?v=2';
import {
  makeSpark, makeDrone, makeCore, makePortal, makeIsland, makeBridge, makePlatform,
  makeLava, makeSkyDome, makeCloud, makeRockSpire, makeTetis, makeMamma, makeGigaDrill,
  makeLaserBall, makeSlipper, makeBroccoli, makeBubble, makePancake, makeHealthOrb,
  makeObjectiveArrow, makeHalo, glowTex,
} from './models.js?v=2';

const PLAYER_NAME = 'LŪKASS';
const SAVE_KEY = 'cs_save_v1';

// ---------------- DOM ----------------
const $ = id => document.getElementById(id);
const dom = {
  hud: $('hud'), healthBar: $('health-bar'), healthWrap: $('health-wrap'), energyBar: $('energy-bar'),
  cores: $('cores'), coreCount: $('core-count'), objective: $('objective'),
  bossWrap: $('boss-wrap'), bossName: $('boss-name'), bossBar: $('boss-bar'),
  btnPause: $('btn-pause'), btnMute: $('btn-mute'),
  hint: $('hint'), banner: $('banner'), speech: $('speech'), dmgLayer: $('dmg-layer'),
  flash: $('flash'), vignette: $('vignette-red'),
  title: $('title-screen'), pause: $('pause-screen'), victory: $('victory-screen'), defeat: $('defeat-screen'),
  victoryStats: $('victory-stats'),
  btnNew: $('btn-new'), btnContinue: $('btn-continue'), btnResume: $('btn-resume'), btnQuit: $('btn-quit'),
  btnAgain: $('btn-again'), btnRetry: $('btn-retry'),
  diffExplorer: $('diff-explorer'), diffHero: $('diff-hero'),
  touch: $('touch'), joyZone: $('joy-zone'), joyRing: $('joy-ring'), joyNub: $('joy-nub'),
  btnAttack: $('btn-attack'), btnJump: $('btn-jump'), btnShield: $('btn-shield'),
  rotate: $('rotate-overlay'),
};

// ---------------- Quality tiers ----------------
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const CORES_HW = navigator.hardwareConcurrency || 4;
const SMALL_SCREEN = Math.min(screen.width, screen.height) < 500;
let TIER = 'high';
if (IS_TOUCH && (SMALL_SCREEN || CORES_HW <= 4)) TIER = CORES_HW <= 3 ? 'low' : 'medium';
else if (IS_TOUCH) TIER = 'medium';
const Q = {
  high:   { pr: Math.min(devicePixelRatio, 2),   shadow: 2048, particles: 1.0,  clouds: 12, deco: 1.0 },
  medium: { pr: Math.min(devicePixelRatio, 1.5), shadow: 1024, particles: 0.6,  clouds: 7,  deco: 0.6 },
  low:    { pr: 1,                               shadow: 0,    particles: 0.35, clouds: 4,  deco: 0.35 },
}[TIER];

// ---------------- Renderer ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: TIER !== 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (Q.shadow > 0) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

// environment map — makes metals/PBR materials look rich instead of black
const _pmrem = new THREE.PMREMGenerator(renderer);
const ENV_TEX = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
_pmrem.dispose();
let renderScale = 1; // dynamic resolution
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth * renderScale, innerHeight * renderScale, false);
});

// ---------------- Global state ----------------
const S = {
  state: 'title',       // title | playing | paused | cine | warp | victory | defeat
  levelNum: 1,
  difficulty: localStorage.getItem('cs_diff') || 'explorer',
  time: 0,
  hitstop: 0,
  shake: 0,
  cine: null,
  paused: false,
  stats: { startTime: 0, kills: 0 },
  perks: { swordUp: false, hpBonus: 0 },
  frozen: false,
};
const DIFF = () => S.difficulty === 'explorer'
  ? { maxHp: 150, dmgTaken: 0.7, enemySpeed: 0.82, regen: true }
  : { maxHp: 100, dmgTaken: 1.0, enemySpeed: 1.0, regen: false };

let scene = null;
let L = null; // current level data

// ---------------- Input ----------------
const input = {
  keys: {}, move: new THREE.Vector2(),
  jumpHeld: false, jumpBuffer: 0,
  attackQueued: false, shieldHeld: false,
  wigglePresses: 0,
};
addEventListener('keydown', e => {
  if (e.repeat) return;
  input.keys[e.code] = true;
  input.wigglePresses++;
  if (e.code === 'Space') { input.jumpBuffer = 0.13; input.jumpHeld = true; e.preventDefault(); }
  if (e.code === 'KeyJ') input.attackQueued = true;
  if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.shieldHeld = true;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
addEventListener('keyup', e => {
  input.keys[e.code] = false;
  if (e.code === 'Space') input.jumpHeld = false;
  if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.shieldHeld = false;
});
canvas.addEventListener('mousedown', e => {
  if (S.state !== 'playing') return;
  if (e.button === 0) input.attackQueued = true;
  if (e.button === 2) input.shieldHeld = true;
});
addEventListener('mouseup', e => { if (e.button === 2) input.shieldHeld = false; });
addEventListener('contextmenu', e => e.preventDefault());

const _rawMove = new THREE.Vector2();
function readMoveInput(dt) {
  let x = 0, y = 0;
  const k = input.keys;
  if (k['KeyW'] || k['ArrowUp']) y -= 1;
  if (k['KeyS'] || k['ArrowDown']) y += 1;
  if (k['KeyA'] || k['ArrowLeft']) x -= 1;
  if (k['KeyD'] || k['ArrowRight']) x += 1;
  if (joy.active) { x += joy.x; y += joy.y; }
  _rawMove.set(x, y);
  if (_rawMove.lengthSq() > 1) _rawMove.normalize();
  // low-pass filter: input ramps in/out instead of snapping — smoother feel
  input.move.lerp(_rawMove, 1 - Math.exp(-9 * dt));
  if (_rawMove.lengthSq() === 0 && input.move.lengthSq() < 0.004) input.move.set(0, 0);
}

// ---------------- Touch controls ----------------
const joy = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };
if (IS_TOUCH) dom.touch.classList.remove('hidden');

dom.joyZone.addEventListener('pointerdown', e => {
  if (joy.id !== null) return;
  joy.id = e.pointerId; joy.active = true;
  joy.cx = e.clientX; joy.cy = e.clientY;
  dom.joyRing.classList.remove('hidden');
  dom.joyRing.style.left = joy.cx + 'px';
  dom.joyRing.style.top = joy.cy + 'px';
  try { dom.joyZone.setPointerCapture(e.pointerId); } catch {}
  input.wigglePresses++;
});
dom.joyZone.addEventListener('pointermove', e => {
  if (e.pointerId !== joy.id) return;
  const dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
  const max = 55;
  const len = Math.hypot(dx, dy);
  const cl = Math.min(len, max);
  const nx = len > 0 ? dx / len : 0, ny = len > 0 ? dy / len : 0;
  joy.x = (nx * cl) / max; joy.y = (ny * cl) / max;
  const dead = 0.14;
  if (Math.hypot(joy.x, joy.y) < dead) { joy.x = 0; joy.y = 0; }
  dom.joyNub.style.left = `calc(50% + ${nx * cl}px)`;
  dom.joyNub.style.top = `calc(50% + ${ny * cl}px)`;
});
function joyEnd(e) {
  if (e.pointerId !== joy.id) return;
  joy.id = null; joy.active = false; joy.x = 0; joy.y = 0;
  dom.joyRing.classList.add('hidden');
  dom.joyNub.style.left = '50%'; dom.joyNub.style.top = '50%';
}
dom.joyZone.addEventListener('pointerup', joyEnd);
dom.joyZone.addEventListener('pointercancel', joyEnd);

function bindBtn(el, down, up) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('pressed'); down(); input.wigglePresses++; });
  const release = () => { el.classList.remove('pressed'); if (up) up(); };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
}
bindBtn(dom.btnAttack, () => { input.attackQueued = true; });
bindBtn(dom.btnJump, () => { input.jumpBuffer = 0.13; input.jumpHeld = true; }, () => { input.jumpHeld = false; });
bindBtn(dom.btnShield, () => { input.shieldHeld = true; }, () => { input.shieldHeld = false; });

// right-half swipe = rotate camera (standard third-person mobile scheme)
// (guarded: a stale-cached index.html without #cam-zone must not crash the game)
const camZone = $('cam-zone') || document.createElement('div');
const camDrag = { id: null, x: 0, y: 0 };
camZone.addEventListener('pointerdown', e => {
  if (camDrag.id !== null) return;
  camDrag.id = e.pointerId; camDrag.x = e.clientX; camDrag.y = e.clientY;
  try { camZone.setPointerCapture(e.pointerId); } catch {}
  input.wigglePresses++;
});
camZone.addEventListener('pointermove', e => {
  if (e.pointerId !== camDrag.id) return;
  const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
  camDrag.x = e.clientX; camDrag.y = e.clientY;
  cam.yaw -= dx * 0.0075;
  cam.up = THREE.MathUtils.clamp(cam.up + dy * 0.02, 1.8, 6.5);
  cam.manualT = 1.2;
});
function camDragEnd(e) { if (e.pointerId === camDrag.id) camDrag.id = null; }
camZone.addEventListener('pointerup', camDragEnd);
camZone.addEventListener('pointercancel', camDragEnd);

// rotate overlay
function checkOrientation() {
  const portrait = innerHeight > innerWidth * 1.05;
  dom.rotate.classList.toggle('hidden', !(IS_TOUCH && portrait));
}
addEventListener('resize', checkOrientation);
checkOrientation();

// ---------------- HUD helpers ----------------
function setObjective(t) { dom.objective.textContent = t; }
let hintTimer = 0;
function showHint(t, dur = 5) { dom.hint.textContent = t; dom.hint.classList.remove('hidden'); hintTimer = dur; }
function hideHint() { dom.hint.classList.add('hidden'); hintTimer = 0; }
let bannerTimer = 0;
function showBanner(t, dur = 2.6) {
  dom.banner.textContent = t;
  dom.banner.classList.remove('hidden');
  dom.banner.style.animation = 'none'; dom.banner.offsetHeight; dom.banner.style.animation = '';
  bannerTimer = dur;
}
function showBossBar(name, virus) {
  dom.bossWrap.classList.remove('hidden');
  dom.bossWrap.classList.toggle('virus', !!virus);
  dom.bossName.textContent = name;
  dom.bossBar.style.width = '100%';
}
function hideBossBar() { dom.bossWrap.classList.add('hidden'); }
function setBossBar(frac) { dom.bossBar.style.width = Math.max(0, frac * 100) + '%'; }

const speech = { obj: null, timer: 0, offY: 0 };
function say(worldObj, text, dur = 3, offY = 5.6) {
  dom.speech.textContent = text;
  dom.speech.classList.remove('hidden');
  speech.obj = worldObj; speech.timer = dur; speech.offY = offY;
  Sfx.play('beep');
}
const _v = new THREE.Vector3();
function projectToScreen(pos) {
  _v.copy(pos).project(camera);
  return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, behind: _v.z > 1 };
}
function updateSpeech(dt) {
  if (!speech.obj || speech.timer <= 0) return;
  speech.timer -= dt;
  if (speech.timer <= 0) { dom.speech.classList.add('hidden'); speech.obj = null; return; }
  const p = speech.obj.position.clone(); p.y += speech.offY;
  const s = projectToScreen(p);
  if (s.behind) { dom.speech.style.opacity = 0; return; }
  dom.speech.style.opacity = 1;
  dom.speech.style.left = Math.max(80, Math.min(innerWidth - 80, s.x)) + 'px';
  dom.speech.style.top = Math.max(60, s.y) + 'px';
}

// damage numbers (HTML pool)
const dmgPool = [];
for (let i = 0; i < 24; i++) {
  const d = document.createElement('div');
  d.className = 'dmg-num'; d.style.display = 'none';
  dom.dmgLayer.appendChild(d);
  dmgPool.push({ el: d, life: 0, pos: new THREE.Vector3(), vy: 0 });
}
function spawnDmgNum(pos, text, cls = '') {
  const d = dmgPool.find(x => x.life <= 0);
  if (!d) return;
  d.el.textContent = text;
  d.el.className = 'dmg-num ' + cls;
  d.el.style.display = 'block';
  d.pos.copy(pos); d.life = 1; d.vy = 0;
}
function updateDmgNums(dt) {
  for (const d of dmgPool) {
    if (d.life <= 0) continue;
    d.life -= dt * 0.9;
    d.pos.y += dt * 1.6;
    if (d.life <= 0) { d.el.style.display = 'none'; continue; }
    const s = projectToScreen(d.pos);
    if (s.behind) { d.el.style.opacity = 0; continue; }
    d.el.style.opacity = Math.min(1, d.life * 2);
    d.el.style.left = s.x + 'px';
    d.el.style.top = s.y + 'px';
  }
}

let flashV = 0, flashColor = '#fff';
function flash(intensity = 1, color = '#fff') { flashV = Math.max(flashV, intensity); flashColor = color; }

// haptics — works on Android; iPhones don't expose vibration to web pages
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
}

// ---------------- Particles (pooled Points) ----------------
const P_MAX = Math.floor(700 * Q.particles);
class Particles {
  constructor() {
    this.pos = new Float32Array(P_MAX * 3);
    this.col = new Float32Array(P_MAX * 3);
    this.alpha = new Float32Array(P_MAX);
    this.size = new Float32Array(P_MAX);
    this.vel = new Float32Array(P_MAX * 3);
    this.life = new Float32Array(P_MAX);
    this.maxLife = new Float32Array(P_MAX);
    this.grav = new Float32Array(P_MAX);
    this.baseSize = new Float32Array(P_MAX);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { map: { value: glowTex() } },
      vertexShader: `
        attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, vAlpha) * t;
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
  }
  spawn(p, v, colorHex, size, life, grav = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % P_MAX;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    const c = new THREE.Color(colorHex);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life; this.maxLife[i] = life;
    this.baseSize[i] = size; this.grav[i] = grav;
  }
  burst(p, colorHex, count, speed, size = 1.6, life = 0.7, grav = 6) {
    const n = Math.max(2, Math.floor(count * Q.particles));
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.3), (Math.random() - 0.5)).normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.spawn(p, v, colorHex, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), grav);
    }
  }
  update(dt) {
    for (let i = 0; i < P_MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = f;
      this.size[i] = this.baseSize[i] * (0.5 + f * 0.5);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}
let FX = null;

// ---------------- Player ----------------
const player = {
  mesh: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  heading: 0, grounded: false, coyote: 0,
  hp: 150, maxHp: 150, energy: 100, maxEnergy: 100,
  invuln: 0, lastHurt: 99, jumpHoldT: 0, airborne: false,
  attackCd: 0, swinging: 0, shieldOn: false,
  trapped: 0, trappedBubble: null,
  lastSafe: new THREE.Vector3(), safeTimer: 0,
  bobT: 0, dead: false,
  swordRange: () => S.perks.swordUp ? 4.2 : 3.3,
  swordDmg: () => S.perks.swordUp ? 50 : 34,
};
let blobShadow = null;

function setupPlayer(spawn) {
  if (!player.mesh) player.mesh = makeSpark();
  const d = DIFF();
  player.maxHp = d.maxHp + S.perks.hpBonus;
  player.hp = player.maxHp;
  player.energy = player.maxEnergy;
  player.pos.copy(spawn);
  player.vel.set(0, 0, 0);
  player.lastSafe.copy(spawn);
  player.invuln = 0; player.dead = false; player.trapped = 0;
  player.heading = Math.PI; // face -Z (into the level)
  if (S.perks.swordUp) {
    player.mesh.userData.blade.scale.set(1.3, 1.3, 1.3);
    player.mesh.userData.bladeGlow.scale.setScalar(2.1);
  } else {
    player.mesh.userData.blade.scale.set(1, 1, 1);
    player.mesh.userData.bladeGlow.scale.setScalar(1.5);
  }
  scene.add(player.mesh);
  // cheap blob shadow (helps on low tier / extra grounding on all tiers)
  if (!blobShadow) {
    const m = new THREE.SpriteMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
    blobShadow = new THREE.Sprite(m);
    blobShadow.scale.set(1.6, 1.6, 1);
  }
  scene.add(blobShadow);
}

const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
function groundHit(pos, far = 3.2) {
  ray.set(_v.set(pos.x, pos.y + 1.5, pos.z), DOWN);
  ray.far = far + 1.5;
  const hits = ray.intersectObjects(L.walkables, false);
  return hits.length ? hits[0] : null;
}

function updatePlayer(dt) {
  const u = player.mesh.userData;
  const d = DIFF();
  player.attackCd -= dt;
  player.invuln -= dt;
  player.lastHurt += dt;
  input.jumpBuffer -= dt;

  // ---- trapped in bubble ----
  if (player.trapped > 0) {
    player.trapped -= dt + input.wigglePresses * 0.25;
    input.wigglePresses = 0;
    player.vel.set(0, Math.sin(S.time * 3) * 0.5, 0);
    player.pos.y += Math.sin(S.time * 3) * 0.5 * dt;
    if (player.trappedBubble) player.trappedBubble.position.copy(player.pos).y += 0.4;
    if (player.trapped <= 0 && player.trappedBubble) {
      FX.burst(player.pos, 0x88ccff, 14, 5, 1.4, 0.5, 2);
      Sfx.play('pop');
      scene.remove(player.trappedBubble);
      player.trappedBubble = null;
    }
    applyPlayerVisuals(dt, u);
    return;
  }
  input.wigglePresses = 0;

  // ---- movement (camera-relative) ----
  readMoveInput(dt);
  // camera-forward, horizontally: the camera sits at yaw+π behind the player,
  // so its view direction is (sin yaw, 0, cos yaw). Stick-up must map to THIS.
  const camYawV = cam.yaw;
  const fwd = new THREE.Vector3(Math.sin(camYawV), 0, Math.cos(camYawV));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const wish = new THREE.Vector3()
    .addScaledVector(fwd, -input.move.y)
    .addScaledVector(right, input.move.x);
  const wishLen = Math.min(1, wish.length());
  if (wishLen > 0.01) wish.normalize();

  const MAXSPD = 11, ACCEL = 46;
  const hv = new THREE.Vector3(player.vel.x, 0, player.vel.z);
  if (wishLen > 0.01) {
    hv.addScaledVector(wish, ACCEL * dt * wishLen);
    if (hv.length() > MAXSPD * wishLen) hv.setLength(Math.max(MAXSPD * wishLen, hv.length() - ACCEL * 1.6 * dt));
    player.heading = dampAngle(player.heading, Math.atan2(wish.x, wish.z), 8.5, dt);
  } else {
    const drag = Math.exp(-dt * 4.6); // softer hover-glide stop
    hv.multiplyScalar(drag);
    if (hv.length() < 0.05) hv.set(0, 0, 0);
  }
  player.vel.x = hv.x; player.vel.z = hv.z;

  // ---- vertical: gravity, jump, boost ----
  const GRAV = 26;
  player.vel.y -= GRAV * dt;
  player.coyote -= dt;

  if (input.jumpBuffer > 0 && (player.grounded || player.coyote > 0)) {
    input.jumpBuffer = 0;
    player.vel.y = 10;
    player.grounded = false; player.coyote = 0;
    player.jumpHoldT = 0.38;
    Sfx.play('jump');
    FX.burst(player.pos, 0x66ccff, 8, 3, 1.2, 0.4, 4);
    u.inner.scale.set(0.82, 1.25, 0.82); // stretch
    tut.onJump();
  }
  if (input.jumpHeld && player.jumpHoldT > 0 && player.energy > 1 && player.vel.y > -2) {
    player.jumpHoldT -= dt;
    player.vel.y += 24 * dt;
    player.energy = Math.max(0, player.energy - 32 * dt);
    if (Math.random() < 0.5) FX.spawn(
      _v.set(player.pos.x, player.pos.y + 0.1, player.pos.z).clone(),
      new THREE.Vector3((Math.random() - .5) * 2, -4, (Math.random() - .5) * 2), 0x55aaff, 1.4, 0.35, 0);
  } else if (!input.jumpHeld) player.jumpHoldT = 0;

  // integrate
  player.pos.addScaledVector(player.vel, dt);

  // ---- ground collision ----
  const wasGrounded = player.grounded;
  player.grounded = false;
  if (player.vel.y <= 0.01) {
    const hit = groundHit(player.pos, 0.25 + Math.max(0, -player.vel.y * dt) + 0.3);
    if (hit && hit.point.y >= player.pos.y - 0.6) {
      player.pos.y = hit.point.y;
      if (player.vel.y < -13) { // hard landing
        FX.burst(player.pos, 0xccddee, 12, 4, 1.4, 0.5, 5);
        u.inner.scale.set(1.3, 0.7, 1.3);
        Sfx.play('thrust');
      } else if (!wasGrounded) {
        u.inner.scale.set(1.15, 0.85, 1.15);
      }
      player.vel.y = 0;
      player.grounded = true;
      player.coyote = 0.13;
    }
  } else {
    // wasGrounded but moving up: nothing
  }
  if (wasGrounded && !player.grounded && player.vel.y <= 0) player.coyote = 0.13;

  // safe position sampling
  if (player.grounded) {
    player.safeTimer -= dt;
    if (player.safeTimer <= 0) { player.safeTimer = 0.4; player.lastSafe.copy(player.pos); }
  }

  // ---- kill plane / lava ----
  if (player.pos.y < L.killY) rescueTeleport();
  if (L.lavaY !== undefined && player.pos.y < L.lavaY + 0.5) {
    damagePlayer(10, null, true);
    rescueTeleport(false);
  }

  // ---- energy regen ----
  const draining = (input.jumpHeld && player.jumpHoldT > 0) || player.shieldOn;
  if (!draining) player.energy = Math.min(player.maxEnergy, player.energy + (player.grounded ? 26 : 12) * dt);

  // ---- hp regen (Explorer) ----
  if (d.regen && player.lastHurt > 5 && player.hp < player.maxHp)
    player.hp = Math.min(player.maxHp, player.hp + 6 * dt);

  // ---- shield ----
  player.shieldOn = input.shieldHeld && player.energy > 1;
  if (player.shieldOn) {
    player.energy = Math.max(0, player.energy - 22 * dt);
    if (!u.shield.visible) Sfx.play('shield');
    tut.onShield && tut.onShield();
  }
  u.shield.visible = player.shieldOn;
  if (player.shieldOn) u.shieldMat.opacity = 0.18 + Math.sin(S.time * 8) * 0.05;

  // ---- attack ----
  if (input.attackQueued) {
    input.attackQueued = false;
    if (player.attackCd <= 0) {
      player.attackCd = 0.42;
      player.swinging = 0.34;
      swordAimAssist();
      Sfx.play('slash');
      tut.onAttack();
    }
  }
  if (player.swinging > 0) {
    player.swinging -= dt;
    const t = 1 - player.swinging / 0.34;
    u.swordArm.rotation.y = THREE.MathUtils.lerp(1.4, -1.7, easeOut(t));
    u.swordArm.rotation.x = THREE.MathUtils.lerp(-0.7, 0.5, easeOut(t));
    if (t >= 0.35 && !player._hitDone) { player._hitDone = true; doSwordHit(); }
  } else {
    player._hitDone = false;
    u.swordArm.rotation.y = damp(u.swordArm.rotation.y, 0, 10, dt);
    u.swordArm.rotation.x = damp(u.swordArm.rotation.x, 0, 10, dt);
  }

  applyPlayerVisuals(dt, u);

  // tutorial move trigger
  if (input.move.lengthSq() > 0.2) tut.onMove();
}

function applyPlayerVisuals(dt, u) {
  // orient + bank
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  const hvLen = Math.hypot(player.vel.x, player.vel.z);
  const bank = THREE.MathUtils.clamp((player.vel.x * Math.cos(player.heading) - player.vel.z * Math.sin(player.heading)) * -0.05, -0.35, 0.35);
  u.inner.rotation.z = damp(u.inner.rotation.z, bank, 8, dt);
  u.inner.rotation.x = damp(u.inner.rotation.x, THREE.MathUtils.clamp(hvLen * 0.022, 0, 0.3), 8, dt);

  // hover bob + squash recovery
  player.bobT += dt * (2 + hvLen * 0.25);
  u.inner.position.y = 0.55 + Math.sin(player.bobT * 2.2) * 0.08;
  u.inner.scale.x = damp(u.inner.scale.x, 1, 8, dt);
  u.inner.scale.y = damp(u.inner.scale.y, 1, 8, dt);
  u.inner.scale.z = damp(u.inner.scale.z, 1, 8, dt);

  // thruster flame
  const thrust = (!player.grounded && input.jumpHeld && player.jumpHoldT > 0) ? 1.5 : 0.7 + Math.sin(S.time * 14) * 0.15;
  u.flame.scale.setScalar(0.7 * thrust + hvLen * 0.03);
  u.coreMat.emissiveIntensity = 2 + Math.sin(S.time * 5) * 0.8;

  // invulnerability flicker
  player.mesh.visible = !(player.invuln > 0 && Math.floor(S.time * 16) % 2 === 0);

  // blob shadow
  const gh = groundHit(player.pos, 30);
  if (gh) {
    blobShadow.visible = true;
    blobShadow.position.set(player.pos.x, gh.point.y + 0.06, player.pos.z);
    const h = Math.max(0, player.pos.y - gh.point.y);
    const sc = THREE.MathUtils.clamp(1.8 - h * 0.09, 0.5, 1.8);
    blobShadow.scale.set(sc, sc, 1);
    blobShadow.material.opacity = THREE.MathUtils.clamp(0.4 - h * 0.02, 0.08, 0.4);
  } else blobShadow.visible = false;
}

// is the miniboss currently a valid sword target?
function minibossTargetable() {
  if (!L.miniboss || L.miniboss.freed) return false;
  if (L.miniboss.mode !== undefined) return L.miniboss.mode === 'fight'; // Mamma
  return L.miniboss.active;                                             // Tētis
}

function doSwordHit() {
  const range = player.swordRange();
  const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const hitPos = player.pos.clone().addScaledVector(fwd, range * 0.6); hitPos.y += 1;
  let hitAny = false;
  // bodyR = the target's body radius — big bots are hit at their SURFACE, not center
  const tryHit = (targetPos, bodyR = 0) => {
    const to = targetPos.clone().sub(player.pos); const dy = Math.abs(to.y); to.y = 0;
    const dist = Math.max(0, to.length() - bodyR);
    if (dist > range + 0.8 || dy > 3.6) return false;
    if (dist > 2.0) { to.normalize(); if (to.dot(fwd) < 0.15) return false; } // wide arc; point-blank always hits
    return true;
  };
  // drones
  for (const e of L.enemies) {
    if (e.dead) continue;
    if (tryHit(e.group.position, 0.6)) { e.hurt(player.swordDmg()); hitAny = true; }
  }
  // minibosses (virus) — Tētis/Mamma are ~2 units wide
  if (minibossTargetable() && tryHit(L.miniboss.group.position, 2.1)) {
    L.miniboss.virusHit(12); hitAny = true;
  }
  // boss weak point
  if (L.boss && L.boss.active && !L.boss.dead) {
    const wp = L.boss.weakWorldPos();
    if (L.boss.weakOpen > 0 && player.pos.distanceTo(wp) < range + 2.4) {
      L.boss.hurt(S.perks.swordUp ? 75 : 60); hitAny = true;
    }
  }
  // pop bubbles
  for (const pr of L.projectiles) {
    if (pr.kind === 'bubble' && !pr.dead && tryHit(pr.mesh.position, 0.8)) {
      pr.dead = true; FX.burst(pr.mesh.position, 0x88ccff, 10, 4, 1.3, 0.4, 2); Sfx.play('pop');
    }
  }
  if (hitAny) { S.hitstop = Math.max(S.hitstop, 0.06); buzz(20); }
  FX.burst(hitPos, 0x66e0ff, 5, 3, 1.1, 0.25, 0);
}

// melee aim-assist: when a swing starts, turn Spark toward the nearest target
function swordAimAssist() {
  const reach = player.swordRange() + 2.6;
  const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  let best = null, bestD = 1e9;
  const consider = (pos, bodyR) => {
    const to = pos.clone().sub(player.pos); to.y = 0;
    const d = Math.max(0, to.length() - bodyR);
    if (d < reach && d < bestD && to.normalize().dot(fwd) > -0.3) { best = pos; bestD = d; }
  };
  for (const e of L.enemies) if (!e.dead) consider(e.group.position, 0.6);
  if (minibossTargetable()) consider(L.miniboss.group.position, 2.1);
  if (L.boss && L.boss.active && !L.boss.dead && L.boss.weakOpen > 0) consider(L.boss.weakWorldPos(), 1.4);
  if (best) player.heading = Math.atan2(best.x - player.pos.x, best.z - player.pos.z);
}

function damagePlayer(amount, sourcePos, ignoreInvuln = false) {
  if (player.invuln > 0 && !ignoreInvuln) return;
  if (S.state !== 'playing') return;
  let dmg = amount * DIFF().dmgTaken;
  if (player.shieldOn) dmg *= 0.5;
  dmg = Math.max(1, Math.round(dmg));
  player.hp -= dmg;
  player.invuln = Math.max(player.invuln, 1.0);
  player.lastHurt = 0;
  S.shake = Math.max(S.shake, 0.35);
  buzz(45);
  Sfx.play('hurt');
  dom.healthWrap.classList.remove('hurt'); dom.healthWrap.offsetHeight; dom.healthWrap.classList.add('hurt');
  dom.vignette.style.opacity = 0.9;
  if (sourcePos) {
    const kb = player.pos.clone().sub(sourcePos); kb.y = 0;
    if (kb.lengthSq() > 0.01) { kb.normalize(); player.vel.addScaledVector(kb, 7); player.vel.y = Math.max(player.vel.y, 3); }
  }
  if (player.hp <= 0) { player.hp = 0; onDefeat(); }
}

function rescueTeleport(playSfx = true) {
  if (playSfx) {
    damageNoKill(8);
    Sfx.play('teleport');
  }
  flash(0.8, '#9fdcff');
  buzz(40);
  FX.burst(player.pos, 0x66ccff, 16, 6, 1.6, 0.6, 0);
  player.pos.copy(player.lastSafe);
  player.pos.y += 0.5;
  player.vel.set(0, 0, 0);
  player.invuln = Math.max(player.invuln, 1.2);
  FX.burst(player.pos, 0x66ccff, 16, 5, 1.6, 0.6, 0);
}
function damageNoKill(amount) { // falls never defeat you
  const dmg = Math.round(amount * DIFF().dmgTaken);
  player.hp = Math.max(1, player.hp - dmg);
  player.lastHurt = 0;
  dom.vignette.style.opacity = 0.7;
}

// ---------------- Camera ----------------
const cam = { yaw: Math.PI, up: 3.4, manualT: 0, pos: new THREE.Vector3(0, 6, 8), look: new THREE.Vector3(), shakeOff: new THREE.Vector3() };
function angDelta(a, b) { return ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
function updateCamera(dt) {
  // Gentle follow: rotate behind the player ONLY when he runs roughly away
  // from the camera. Moving toward or across the camera never flips the view
  // (that caused spinning/backward controls). Manual swipe overrides for a bit.
  const hvLen = Math.hypot(player.vel.x, player.vel.z);
  cam.manualT = Math.max(0, cam.manualT - dt);
  if (hvLen > 1.5 && cam.manualT <= 0) {
    const moveDir = Math.atan2(player.vel.x, player.vel.z);
    if (Math.abs(angDelta(moveDir, cam.yaw)) < 1.0) cam.yaw = dampAngle(cam.yaw, moveDir, 1.6, dt);
  }

  const back = 6.2 + hvLen * 0.16;
  const up = cam.up + (player.grounded ? 0 : 0.7);
  const desired = new THREE.Vector3(
    player.pos.x + Math.sin(cam.yaw + Math.PI) * back,
    player.pos.y + up,
    player.pos.z + Math.cos(cam.yaw + Math.PI) * back
  );
  // terrain avoid: ray from head to desired camera
  const head = player.pos.clone(); head.y += 1.6;
  const dir = desired.clone().sub(head);
  const len = dir.length(); dir.normalize();
  ray.set(head, dir); ray.far = len;
  const blockers = L ? L.camBlockers : [];
  const hits = blockers.length ? ray.intersectObjects(blockers, false) : [];
  if (hits.length) desired.copy(head).addScaledVector(dir, Math.max(1.2, hits[0].distance - 0.4));

  const k = 1 - Math.exp(-dt * 4.6);
  cam.pos.lerp(desired, k);

  const lookTarget = player.pos.clone();
  lookTarget.y += 1.4;
  lookTarget.addScaledVector(new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading)), 1.6);
  cam.look.lerp(lookTarget, 1 - Math.exp(-dt * 7));

  // shake
  if (S.shake > 0) {
    S.shake = Math.max(0, S.shake - dt * 1.6);
    const a = S.shake * S.shake * 0.9;
    cam.shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
  } else cam.shakeOff.set(0, 0, 0);

  camera.position.copy(cam.pos).add(cam.shakeOff);
  camera.lookAt(cam.look);
}

// cinematic
function startCine(opts) {
  S.cine = { t: 0, ...opts };
  S.state = 'cine';
  document.body.classList.add('cine');
}
function updateCine(dt) {
  const c = S.cine;
  c.t += dt;
  const f = Math.min(1, c.t / c.dur);
  const e = easeInOut(f);
  camera.position.lerpVectors(c.from, c.to, e);
  const lk = c.lookFrom && c.lookTo ? new THREE.Vector3().lerpVectors(c.lookFrom, c.lookTo, e) : c.look;
  camera.lookAt(lk);
  if (c.onUpdate) c.onUpdate(f, dt);
  if (c.t >= c.dur + (c.hold || 0)) {
    document.body.classList.remove('cine');
    const done = c.onDone;
    S.cine = null;
    S.state = 'playing';
    cam.pos.copy(camera.position);
    if (done) done();
  }
}

// ---------------- math helpers ----------------
function damp(a, b, lambda, dt) { return THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt)); }
function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------- Projectiles ----------------
function spawnProjectile(opts) {
  const pr = {
    kind: 'laser', dmg: 8, r: 0.6, grav: 0, life: 6, friendly: false,
    spin: 0, homing: 0, dead: false, ...opts,
  };
  scene.add(pr.mesh);
  L.projectiles.push(pr);
  return pr;
}
function updateProjectiles(dt) {
  for (const pr of L.projectiles) {
    if (pr.dead) continue;
    pr.life -= dt;
    if (pr.life <= 0) { pr.dead = true; continue; }
    pr.vel.y -= pr.grav * dt;
    if (pr.homing > 0) {
      const to = player.pos.clone(); to.y += 0.8; to.sub(pr.mesh.position).normalize();
      pr.vel.lerp(to.multiplyScalar(pr.vel.length()), pr.homing * dt);
    }
    pr.mesh.position.addScaledVector(pr.vel, dt);
    if (pr.spin) { pr.mesh.rotation.x += pr.spin * dt; pr.mesh.rotation.y += pr.spin * 0.7 * dt; }

    if (pr.friendly) {
      // deflected shots hurt enemies
      for (const e of L.enemies) {
        if (!e.dead && e.group.position.distanceTo(pr.mesh.position) < 1.2) {
          e.hurt(20); pr.dead = true; break;
        }
      }
      if (!pr.dead && L.miniboss && L.miniboss.active && !L.miniboss.freed &&
          pr.mesh.position.distanceTo(L.miniboss.group.position.clone().add(_v.set(0, 3, 0))) < 3) {
        L.miniboss.virusHit(10); pr.dead = true;
      }
      continue;
    }

    // vs player
    const pp = player.pos.clone(); pp.y += 0.8;
    const dist = pr.mesh.position.distanceTo(pp);
    // shield deflect
    if (player.shieldOn && dist < 1.9 && pr.kind !== 'bubble') {
      pr.friendly = true;
      pr.vel.multiplyScalar(-1.2);
      pr.grav = 0; pr.homing = 0; pr.life = 3;
      Sfx.play('deflect');
      FX.burst(pr.mesh.position, 0x66aaff, 8, 4, 1.2, 0.3, 0);
      continue;
    }
    if (dist < pr.r + 0.7) {
      if (pr.kind === 'bubble') {
        if (player.trapped <= 0 && player.invuln <= 0) {
          player.trapped = 2.0;
          player.trappedBubble = pr.mesh;
          Sfx.play('trapped');
          showHint('Wiggle to pop free!', 2);
          pr.dead = true; pr.keepMesh = true;
        }
      } else {
        damagePlayer(pr.dmg, pr.mesh.position);
        pr.dead = true;
      }
    }
    // ground hit for arcing projectiles
    if (pr.grav > 0 && !pr.dead) {
      const gh = groundHit(pr.mesh.position, 0.2);
      if (gh && pr.mesh.position.y <= gh.point.y + 0.3) {
        pr.dead = true;
        FX.burst(pr.mesh.position, 0xccaa66, 8, 3, 1.3, 0.4, 6);
        Sfx.play('stomp');
        if (flatDist(pr.mesh.position, player.pos) < 1.8) damagePlayer(pr.dmg, pr.mesh.position);
      }
    }
  }
  // cleanup
  for (let i = L.projectiles.length - 1; i >= 0; i--) {
    const pr = L.projectiles[i];
    if (pr.dead) {
      if (!pr.keepMesh) scene.remove(pr.mesh);
      L.projectiles.splice(i, 1);
    }
  }
}

// ---------------- Shockwaves ----------------
function spawnShockwave(center, maxR, dmg, color = 0xff8844, speed = 10) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.28, 8, 40), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.copy(center); mesh.position.y += 0.3;
  scene.add(mesh);
  L.shockwaves.push({ mesh, mat, r: 1, maxR, dmg, speed, hitDone: false, center: center.clone() });
  buzz(35);
  Sfx.play('stomp');
  S.shake = Math.max(S.shake, 0.5);
}
function updateShockwaves(dt) {
  for (let i = L.shockwaves.length - 1; i >= 0; i--) {
    const sw = L.shockwaves[i];
    sw.r += sw.speed * dt;
    sw.mesh.scale.set(sw.r, sw.r, 1);
    sw.mat.opacity = Math.max(0, 0.9 * (1 - sw.r / sw.maxR));
    const pd = flatDist(player.pos, sw.center);
    const heightOK = player.pos.y < sw.center.y + 1.1; // jump over it!
    if (!sw.hitDone && heightOK && Math.abs(pd - sw.r) < 0.9) {
      sw.hitDone = true;
      damagePlayer(sw.dmg, sw.center);
    }
    if (sw.r >= sw.maxR) { scene.remove(sw.mesh); L.shockwaves.splice(i, 1); }
  }
}

// ---------------- Pickups ----------------
function spawnPickup(kind, pos, vel) {
  const mesh = kind === 'pancake' ? makePancake() : makeHealthOrb();
  mesh.position.copy(pos);
  scene.add(mesh);
  L.pickups.push({ kind, mesh, vel: vel ? vel.clone() : new THREE.Vector3(), t: Math.random() * 9, landed: !vel });
}
function updatePickups(dt) {
  for (let i = L.pickups.length - 1; i >= 0; i--) {
    const p = L.pickups[i];
    p.t += dt;
    if (!p.landed) {
      p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const gh = groundHit(p.mesh.position, 0.3);
      if (gh && p.mesh.position.y <= gh.point.y + 0.4) { p.mesh.position.y = gh.point.y + 0.4; p.landed = true; }
      if (p.mesh.position.y < L.killY) { scene.remove(p.mesh); L.pickups.splice(i, 1); continue; }
    } else {
      p.mesh.position.y += Math.sin(p.t * 3) * 0.15 * dt * 3;
    }
    p.mesh.rotation.y += dt * 2;
    if (player.pos.distanceTo(p.mesh.position) < 2.0) {
      const heal = p.kind === 'pancake' ? 25 : 15;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      spawnDmgNum(p.mesh.position, '+' + heal, 'heal');
      FX.burst(p.mesh.position, 0x4dff88, 10, 4, 1.4, 0.5, 2);
      Sfx.play('heal');
      scene.remove(p.mesh);
      L.pickups.splice(i, 1);
    }
  }
}

// ---------------- Drone enemy ----------------
class Drone {
  constructor(pos, homeRadius = 5) {
    this.group = makeDrone();
    this.group.position.copy(pos);
    this.group.userData.body.material = this.group.userData.body.material.clone();
    this.home = pos.clone();
    this.homeRadius = homeRadius;
    this.hp = 60;
    this.state = 'patrol';
    this.t = Math.random() * 10;
    this.shootT = 1.5 + Math.random() * 1.5;
    this.telegraph = 0;
    this.dead = false;
    this.flash = 0;
    scene.add(this.group);
  }
  hurt(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 0.15;
    Sfx.play('hit');
    spawnDmgNum(this.group.position.clone().add(_v.set(0, 1, 0)), dmg);
    FX.burst(this.group.position, 0xffcc55, 10, 5, 1.4, 0.4, 4);
    const kb = this.group.position.clone().sub(player.pos).setY(0).normalize();
    this.group.position.addScaledVector(kb, 0.7);
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true;
    S.stats.kills++;
    buzz(60);
    Sfx.play('explosion');
    S.shake = Math.max(S.shake, 0.3);
    FX.burst(this.group.position, 0xff8844, 22, 7, 2, 0.8, 6);
    FX.burst(this.group.position, 0xffee88, 12, 5, 1.6, 0.6, 4);
    if (Math.random() < 0.4) spawnPickup('orb', this.group.position.clone(), new THREE.Vector3(0, 4, 0));
    scene.remove(this.group);
  }
  update(dt) {
    if (this.dead) return;
    this.t += dt;
    const u = this.group.userData;
    const sp = DIFF().enemySpeed;
    u.ring1.rotation.z += dt * 3;
    u.ring2.rotation.z -= dt * 2.2;
    this.group.position.y += Math.sin(this.t * 2.4) * 0.2 * dt;
    if (this.flash > 0) {
      this.flash -= dt;
      u.body.material.emissive.setHex(0xffffff);
      u.body.material.emissiveIntensity = 1.5;
    } else { u.body.material.emissiveIntensity = 0; }

    const toPlayer = player.pos.clone().add(_v.set(0, 1.2, 0)).sub(this.group.position);
    const dist = toPlayer.length();

    if (this.state === 'patrol') {
      const px = this.home.x + Math.cos(this.t * 0.5) * this.homeRadius * 0.5;
      const pz = this.home.z + Math.sin(this.t * 0.5) * this.homeRadius * 0.5;
      this.group.position.x = damp(this.group.position.x, px, 1.2, dt);
      this.group.position.z = damp(this.group.position.z, pz, 1.2, dt);
      this.group.position.y = damp(this.group.position.y, this.home.y, 1.5, dt);
      if (dist < 17) this.state = 'chase';
    } else {
      // chase: hover toward player, keep ~7 distance
      const targetDist = 7;
      const dir = toPlayer.clone().normalize();
      const speed = 4.5 * sp * (dist > targetDist ? 1 : -0.7);
      this.group.position.addScaledVector(dir, speed * dt);
      const wantY = player.pos.y + 2 + Math.sin(this.t * 1.7);
      this.group.position.y = damp(this.group.position.y, wantY, 2, dt);
      this.group.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
      if (dist > 26) this.state = 'patrol';

      // shooting
      this.shootT -= dt;
      if (this.shootT <= 0 && this.telegraph <= 0 && dist < 18) {
        this.telegraph = 0.55;
        Sfx.play('warning');
      }
      if (this.telegraph > 0) {
        this.telegraph -= dt;
        u.eyeHalo.scale.setScalar(0.55 + Math.sin(S.time * 30) * 0.3 + 0.5);
        if (this.telegraph <= 0) {
          this.shootT = (2.4 + Math.random()) / sp;
          const m = makeLaserBall(0xff3355);
          m.position.copy(this.group.position);
          const aim = player.pos.clone().add(_v.set(0, 0.9, 0)).sub(this.group.position).normalize();
          spawnProjectile({ kind: 'laser', mesh: m, vel: aim.multiplyScalar(9.5 * sp), dmg: 8, life: 5 });
          Sfx.play('laser');
        }
      } else u.eyeHalo.scale.setScalar(0.55);
    }
    // contact damage
    if (dist < 1.5) damagePlayer(10, this.group.position);
  }
}

// ---------------- TĒTIS-BOT ----------------
class TetisBot {
  constructor(pos, arenaCenter, arenaRadius) {
    this.group = makeTetis();
    this.group.position.copy(pos);
    this.homePos = pos.clone();
    this.center = arenaCenter; this.radius = arenaRadius;
    this.virus = 100; this.maxVirus = 100;
    this.active = false; this.freed = false;
    this.state = 'idle'; this.t = 0; this.stateT = 0;
    this.attackCycle = 0;
    this.chargeDir = new THREE.Vector3();
    this.hitFlash = 0;
    scene.add(this.group);
  }
  virusHit(amount) {
    if (this.freed || !this.active) return;
    this.virus -= amount;
    this.hitFlash = 0.15;
    Sfx.play('virusHit');
    spawnDmgNum(this.group.position.clone().add(_v.set(0, 4.5, 0)), '⚡', 'virus');
    FX.burst(this.group.position.clone().add(_v.set(0, 3, 0)), 0xb866ff, 14, 6, 1.6, 0.6, 4);
    setBossBar(this.virus / this.maxVirus);
    S.hitstop = Math.max(S.hitstop, 0.05);
    if (this.virus <= 0) this.free();
    else if (Math.random() < 0.3) say(this.group, ['BZZT... Lūkass?', 'MUST... GUARD... zzz', 'ERROR... hugs loading...'][Math.floor(Math.random() * 3)], 1.6, 6.2);
  }
  startFight() {
    if (this.active || this.freed) return;
    this.active = true;
    showBossBar('TĒTIS 🥿 (hypnotized)', true);
    setObjective('Free Tētis! Knock the virus out!');
    const c = this.group.position;
    startCine({
      dur: 2.2, hold: 0.8,
      from: camera.position.clone(),
      to: new THREE.Vector3(c.x + 10, c.y + 8, c.z + 14),
      look: new THREE.Vector3(c.x, c.y + 3, c.z),
      onDone: () => {
        say(this.group, 'INTRUDER... zzz... wait... Lūkass?! MUST... OBEY... VIRUS!', 3.5, 6.2);
        showBanner('TĒTIS has been hypnotized!\nFree him, Lūkass!', 3);
      },
    });
    Sfx.play('warning');
    Sfx.setTheme('boss');
  }
  free() {
    this.freed = true; this.active = false;
    hideBossBar();
    buzz([60, 60, 60, 60, 120]);
    Sfx.play('powerup');
    flash(0.9, '#aaffcc');
    this.group.userData.eyeMat.emissive.setHex(0x22ff66);
    this.group.userData.eyeMat.color.setHex(0x052210);
    FX.burst(this.group.position.clone().add(_v.set(0, 3, 0)), 0x66ffaa, 30, 8, 2, 1, 3);
    Sfx.setTheme('sky');
    const c = this.group.position;
    startCine({
      dur: 1.6, hold: 2.6,
      from: camera.position.clone(),
      to: new THREE.Vector3(c.x + 9, c.y + 7, c.z + 12),
      look: new THREE.Vector3(c.x, c.y + 3.5, c.z),
      onUpdate: (f) => { this.group.scale.y = 1 + Math.sin(f * 20) * 0.05; },
      onDone: () => {
        say(this.group, 'Paldies, Lūkass! That\'s my boy! 💪 Take this core — and a STRONGER SWORD!', 4.5, 6.4);
        // gift: 5th core spawns right here + sword upgrade
        S.perks.swordUp = true;
        player.mesh.userData.blade.scale.set(1.3, 1.3, 1.3);
        player.mesh.userData.bladeGlow.scale.setScalar(2.1);
        showBanner('⚔ SWORD UPGRADED! ⚔', 2.5);
        Sfx.play('fanfare');
        spawnNexusCore(this.group.position.clone().add(new THREE.Vector3(0, 1.5, 3)));
        setObjective(`Find the Nexus Cores!  ${L.coresGot} / 5`);
        setCheckpoint(player.pos);
      },
    });
  }
  update(dt) {
    const u = this.group.userData;
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (this.freed) {
      // happy idle: bob, wave, cheer sometimes
      u.armL.rotation.z = Math.sin(this.t * 2) * 0.4 + 0.3;
      this.group.position.y = this.homePos.y + Math.abs(Math.sin(this.t * 2)) * 0.15;
      return;
    }
    if (!this.active) {
      // dormant: slow menacing sway, red eye pulse
      u.eyeMat.emissiveIntensity = 2.5 + Math.sin(this.t * 2) * 1;
      if (flatDist(player.pos, this.group.position) < 16) this.startFight();
      return;
    }

    const sp = DIFF().enemySpeed;
    this.stateT -= dt;
    const toP = player.pos.clone().sub(this.group.position); toP.y = 0;
    const dist = toP.length();
    const dirP = toP.clone().normalize();

    // always face player except while charging
    if (this.state !== 'charge') {
      const want = Math.atan2(dirP.x, dirP.z);
      this.group.rotation.y = dampAngle(this.group.rotation.y, want, 4, dt);
    }

    switch (this.state) {
      case 'idle': {
        // waddle toward player
        if (dist > 5) {
          this.group.position.addScaledVector(dirP, 2.3 * sp * dt);
          this.group.rotation.z = Math.sin(this.t * 6) * 0.05;
          u.footL.position.y = 0.28 + Math.max(0, Math.sin(this.t * 6)) * 0.3;
          u.footR.position.y = 0.28 + Math.max(0, -Math.sin(this.t * 6)) * 0.3;
        }
        if (this.stateT <= 0) {
          const pick = this.attackCycle++ % 3;
          if (pick === 0) { this.state = 'slipper'; this.stateT = 2.2; this.slipperShots = 3; this.slipperT = 0.5; Sfx.play('warning'); say(this.group, 'ČĪBA ATTACK! 🥿', 1.5, 6.2); }
          else if (pick === 1) { this.state = 'chargeWind'; this.stateT = 0.95; Sfx.play('warning'); say(this.group, 'COME HERE! 🤗', 1.4, 6.2); }
          else { this.state = 'bellyWind'; this.stateT = 0.85; Sfx.play('warning'); }
        }
        break;
      }
      case 'slipper': {
        this.slipperT -= dt;
        u.launcher.rotation.x = -0.4 + Math.sin(this.t * 10) * 0.1;
        if (this.slipperT <= 0 && this.slipperShots > 0) {
          this.slipperShots--;
          this.slipperT = 0.55;
          const m = makeSlipper();
          const start = this.group.position.clone().add(_v.set(0, 5, 0));
          m.position.copy(start);
          // lob at player with arc
          const target = player.pos.clone();
          const flight = 1.1;
          const vel = target.sub(start).multiplyScalar(1 / flight);
          vel.y = vel.y / 1 + 0.5 * 14 * flight; // gravity comp (grav 14)
          spawnProjectile({ kind: 'slipper', mesh: m, vel, dmg: 8, grav: 14, spin: 6, life: 4, r: 0.9 });
          Sfx.play('boing');
        }
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1.4; }
        break;
      }
      case 'chargeWind': {
        // lean back, glow
        this.group.rotation.x = damp(this.group.rotation.x, -0.18, 6, dt);
        u.eyeMat.emissiveIntensity = 4 + Math.sin(S.time * 25) * 2;
        this.chargeDir.copy(dirP);
        if (this.stateT <= 0) { this.state = 'charge'; this.stateT = 1.0; Sfx.play('drill'); }
        break;
      }
      case 'charge': {
        this.group.rotation.x = damp(this.group.rotation.x, 0.22, 8, dt);
        this.group.position.addScaledVector(this.chargeDir, 15 * sp * dt);
        FX.spawn(this.group.position.clone().add(_v.set(0, 0.5, 0)), new THREE.Vector3(0, 1.5, 0), 0xccbbaa, 2, 0.4, 0);
        if (flatDist(player.pos, this.group.position) < 2.6) damagePlayer(12, this.group.position);
        // stay in arena
        if (flatDist(this.group.position, this.center) > this.radius - 2) this.stateT = 0;
        if (this.stateT <= 0) { this.state = 'skid'; this.stateT = 0.7; S.shake = Math.max(S.shake, 0.25); }
        break;
      }
      case 'skid': {
        this.group.rotation.x = damp(this.group.rotation.x, -0.1, 6, dt);
        this.group.position.addScaledVector(this.chargeDir, 3 * dt * (this.stateT / 0.7));
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1.6; this.group.rotation.x = 0; }
        break;
      }
      case 'bellyWind': {
        this.group.scale.y = damp(this.group.scale.y, 0.85, 8, dt);
        this.group.scale.x = damp(this.group.scale.x, 1.1, 8, dt);
        u.eyeMat.emissiveIntensity = 4;
        if (this.stateT <= 0) { this.state = 'bellyJump'; this.stateT = 0.75; this.jumpV = 12; Sfx.play('jump'); }
        break;
      }
      case 'bellyJump': {
        this.jumpV -= 32 * dt;
        this.group.position.y += this.jumpV * dt;
        this.group.scale.y = damp(this.group.scale.y, 1.15, 8, dt);
        this.group.scale.x = damp(this.group.scale.x, 0.95, 8, dt);
        if (this.group.position.y <= this.homePos.y && this.jumpV < 0) {
          this.group.position.y = this.homePos.y;
          this.state = 'bellySlam'; this.stateT = 0.9;
          this.group.scale.set(1.2, 0.75, 1.2);
          spawnShockwave(this.group.position.clone(), 13, 10, 0xffaa55, 11);
          FX.burst(this.group.position, 0xccbbaa, 20, 6, 2, 0.7, 5);
        }
        break;
      }
      case 'bellySlam': {
        this.group.scale.x = damp(this.group.scale.x, 1, 5, dt);
        this.group.scale.y = damp(this.group.scale.y, 1, 5, dt);
        this.group.scale.z = damp(this.group.scale.z, 1, 5, dt);
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1.7; }
        break;
      }
    }
    // eyes pulse red while hypnotized
    if (this.hitFlash > 0) u.eyeMat.emissiveIntensity = 6;
  }
  reset() {
    this.virus = this.maxVirus;
    this.active = false;
    this.state = 'idle'; this.stateT = 0;
    this.group.position.copy(this.homePos);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);
    hideBossBar();
  }
}

// ---------------- MAMMA-BOT ----------------
class MammaBot {
  constructor(patrolA, patrolB, arenaCenter, arenaRadius, bridgeStart) {
    this.group = makeMamma();
    this.patrolA = patrolA.clone(); this.patrolB = patrolB.clone();
    this.group.position.copy(patrolA);
    this.center = arenaCenter.clone(); this.radius = arenaRadius;
    this.bridgeStart = bridgeStart.clone();
    this.mode = 'patrol'; // patrol (beam avoid section) | fight | freed
    this.virus = 100; this.maxVirus = 100;
    this.active = true; this.freed = false;
    this.state = 'glide'; this.t = 0; this.stateT = 2;
    this.patrolT = 0;
    this.hitFlash = 0;
    this.homePos = arenaCenter.clone();
    scene.add(this.group);
  }
  virusHit(amount) {
    if (this.freed || this.mode !== 'fight') return;
    this.virus -= amount;
    this.hitFlash = 0.15;
    Sfx.play('virusHit');
    spawnDmgNum(this.group.position.clone().add(_v.set(0, 5, 0)), '⚡', 'virus');
    FX.burst(this.group.position.clone().add(_v.set(0, 3.5, 0)), 0xb866ff, 14, 6, 1.6, 0.6, 4);
    setBossBar(this.virus / this.maxVirus);
    S.hitstop = Math.max(S.hitstop, 0.05);
    if (this.virus <= 0) this.free();
  }
  startFight() {
    if (this.mode === 'fight' || this.freed) return;
    this.mode = 'fight';
    this.group.userData.beam.visible = false;
    this.group.position.copy(this.center).add(new THREE.Vector3(0, 0.6, -6));
    showBossBar('MAMMA 🧹 (hypnotized)', true);
    setObjective('Free Mamma! Knock the virus out!');
    const c = this.group.position;
    startCine({
      dur: 2.0, hold: 0.8,
      from: camera.position.clone(),
      to: new THREE.Vector3(c.x + 10, c.y + 8, c.z + 14),
      look: new THREE.Vector3(c.x, c.y + 3, c.z),
      onDone: () => {
        say(this.group, 'Lūkass!! Have you EATEN?! VIRUS SAYS... ATTACK! 🥦', 3.5, 6.6);
        showBanner('MAMMA has been hypnotized!\nFree her, Lūkass!', 3);
      },
    });
    Sfx.play('warning');
    Sfx.setTheme('boss');
  }
  free() {
    this.freed = true; this.mode = 'freed';
    hideBossBar();
    buzz([60, 60, 60, 60, 120]);
    Sfx.play('powerup');
    flash(0.9, '#ffddee');
    this.group.userData.eyeMat.emissive.setHex(0x22ff66);
    this.group.userData.eyeMat.color.setHex(0x052210);
    this.group.userData.beam.visible = false;
    FX.burst(this.group.position.clone().add(_v.set(0, 3.5, 0)), 0xffaacc, 30, 8, 2, 1, 3);
    Sfx.setTheme('lava');
    const c = this.group.position;
    startCine({
      dur: 1.6, hold: 2.8,
      from: camera.position.clone(),
      to: new THREE.Vector3(c.x + 9, c.y + 7, c.z + 12),
      look: new THREE.Vector3(c.x, c.y + 3.5, c.z),
      onDone: () => {
        say(this.group, 'Mans mīļais Lūkass! Be careful, dear! ❤ Here — eat your PANCAKES!', 4.5, 6.8);
        S.perks.hpBonus = 50;
        player.maxHp = DIFF().maxHp + 50;
        player.hp = player.maxHp;
        showBanner('🥞 MAMMA\'S PANCAKES!\nMAX HP +50!', 3);
        Sfx.play('fanfare');
        setObjective('Cross the bridge — defeat the GIGA-DRILL!');
        setCheckpoint(this.center.clone().add(new THREE.Vector3(0, 1, 4)));
        saveGame();
      },
    });
  }
  update(dt) {
    const u = this.group.userData;
    this.t += dt;
    if (this.hitFlash > 0) { this.hitFlash -= dt; u.eyeMat.emissiveIntensity = 6; }
    else u.eyeMat.emissiveIntensity = 2.5 + Math.sin(this.t * 2.5);
    u.swirl.rotation.y += dt * 1.5;
    this.group.position.y += Math.sin(this.t * 2.2) * 0.1 * dt;

    if (this.freed) {
      u.armL && (u.armL.rotation.z = Math.sin(this.t * 2) * 0.3);
      return;
    }
    const sp = DIFF().enemySpeed;

    if (this.mode === 'patrol') {
      // glide between patrolA and patrolB with vacuum beam
      this.patrolT += dt * 0.18 * sp;
      const f = (Math.sin(this.patrolT * Math.PI) + 1) / 2;
      const target = new THREE.Vector3().lerpVectors(this.patrolA, this.patrolB, f);
      this.group.position.x = target.x; this.group.position.z = target.z;
      this.group.position.y = target.y + Math.sin(this.t * 2) * 0.15;
      // face movement, beam sweeps
      const sweep = Math.sin(this.t * 0.7) * 0.9;
      this.group.rotation.y = Math.PI + sweep; // faces -Z-ish (toward player's approach) sweeping
      // beam cone: from nozzle, pointing forward-down
      const beam = u.beam;
      beam.visible = true;
      const fwd = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
      beam.position.copy(this.group.position).add(_v.set(0, 3, 0)).addScaledVector(fwd, 7);
      beam.rotation.z = 0;
      beam.lookAt(this.group.position.x, this.group.position.y + 3.4, this.group.position.z);
      beam.rotateX(-Math.PI / 2);
      u.beamMat.opacity = 0.18 + Math.sin(this.t * 6) * 0.05;

      // is player in beam? (angle measured horizontally — the beam is a floor-sweeping cone)
      const toP = player.pos.clone().sub(this.group.position); toP.y = 0;
      const dist = toP.length();
      // caught if you overlap her body — but hugging the bridge edge slips past,
      // and a boost-jump clears right over her head
      if (dist < 1.4 && player.pos.y - this.group.position.y < 2.4) {
        this._catches = (this._catches || 0) + 1;
        say(this.group, `${PLAYER_NAME}! Time to wash your hands! 🧼`, 3, 6.6);
        flash(0.7, '#cfe8ff');
        Sfx.play('teleport');
        player.pos.copy(this.bridgeStart);
        player.vel.set(0, 0, 0);
        player.lastSafe.copy(this.bridgeStart);
        if (this._catches >= 2) showHint('Wait for Mamma to glide AWAY — then run past, or JUMP over her! 🤫', 5);
        return;
      }
      if (dist < 15) {
        const ang = toP.clone().normalize().dot(fwd);
        if (ang > 0.78) {
          // occluded by pillar?
          let blocked = false;
          if (L.obstacles.length) {
            ray.set(this.group.position.clone().add(new THREE.Vector3(0, 3, 0)), toP.clone().normalize());
            ray.far = dist;
            blocked = ray.intersectObjects(L.obstacles, false).length > 0;
          }
          if (!blocked) {
            // pull player — strong, but running/boosting away CAN beat it
            const pull = this.group.position.clone().sub(player.pos).setY(0).normalize();
            player.vel.addScaledVector(pull, 38 * dt);
            if (Math.random() < 0.3) FX.spawn(player.pos.clone().add(_v.set(0, 1, 0)), pull.clone().multiplyScalar(-3), 0xffe08a, 1.5, 0.4, 0);
            if (!this._vacSfx || S.time - this._vacSfx > 0.5) { Sfx.play('vacuum'); this._vacSfx = S.time; }
            if (flatDist(player.pos, this.group.position) < 2.6) {
              // CAUGHT — teleport back, no damage
              say(this.group, `${PLAYER_NAME}! Time to wash your hands! 🧼`, 3, 6.6);
              flash(0.7, '#cfe8ff');
              Sfx.play('teleport');
              player.pos.copy(this.bridgeStart);
              player.vel.set(0, 0, 0);
              player.lastSafe.copy(this.bridgeStart);
            }
          }
        }
      }
      return;
    }

    // ---- FIGHT mode ----
    if (this.mode !== 'fight') return;
    this.stateT -= dt;
    const toP = player.pos.clone().sub(this.group.position); toP.y = 0;
    const dirP = toP.clone().normalize();
    const want = Math.atan2(dirP.x, dirP.z);
    this.group.rotation.y = dampAngle(this.group.rotation.y, want, 5, dt);
    u.beam.visible = false;

    switch (this.state) {
      case 'glide': {
        // circle strafe around player
        const tang = new THREE.Vector3(-dirP.z, 0, dirP.x);
        this.group.position.addScaledVector(tang, 3.5 * sp * dt * (Math.sin(this.t * 0.6) > 0 ? 1 : -1));
        const d = flatDist(this.group.position, player.pos);
        if (d > 10) this.group.position.addScaledVector(dirP, 2.5 * sp * dt);
        // stay in arena
        const fromC = this.group.position.clone().sub(this.center); fromC.y = 0;
        if (fromC.length() > this.radius - 2.5) this.group.position.addScaledVector(fromC.normalize(), -3 * dt);
        if (this.stateT <= 0) {
          const pick = (this._cycle = (this._cycle || 0) + 1) % 3;
          if (pick === 0) { this.state = 'bubble'; this.stateT = 1.6; this.shots = 3; this.shotT = 0.3; say(this.group, 'Bath time! 🫧', 1.5, 6.6); }
          else if (pick === 1) { this.state = 'broccoli'; this.stateT = 1.8; this.shots = 5; this.shotT = 0.4; say(this.group, 'Eat your vegetables! 🥦', 1.5, 6.6); Sfx.play('warning'); }
          else { this.state = 'vacWind'; this.stateT = 1.0; Sfx.play('warning'); say(this.group, 'Come to Mamma! 🌀', 1.5, 6.6); }
        }
        break;
      }
      case 'bubble': {
        this.shotT -= dt;
        if (this.shotT <= 0 && this.shots > 0) {
          this.shots--; this.shotT = 0.45;
          const m = makeBubble();
          m.position.copy(this.group.position).add(_v.set(0, 3.5, 0));
          const aim = player.pos.clone().add(_v.set(0, 1, 0)).sub(m.position).normalize();
          spawnProjectile({ kind: 'bubble', mesh: m, vel: aim.multiplyScalar(5), dmg: 0, life: 6, homing: 1.2, r: 0.9 });
          Sfx.play('bubble');
        }
        if (this.stateT <= 0) { this.state = 'glide'; this.stateT = 1.8; }
        break;
      }
      case 'broccoli': {
        this.shotT -= dt;
        if (this.shotT <= 0 && this.shots > 0) {
          this.shots--; this.shotT = 0.3;
          const m = makeBroccoli();
          m.position.copy(this.group.position).add(_v.set(0, 3, 0));
          const aim = player.pos.clone().add(_v.set(0, 0.8, 0)).sub(m.position).normalize();
          // slight fan spread
          aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.25);
          spawnProjectile({ kind: 'broccoli', mesh: m, vel: aim.multiplyScalar(9 * sp), dmg: 7, life: 5, spin: 8, r: 0.7 });
          Sfx.play('laser');
        }
        if (this.stateT <= 0) { this.state = 'glide'; this.stateT = 2.0; }
        break;
      }
      case 'vacWind': {
        u.vacArm.rotation.z = Math.sin(S.time * 20) * 0.15;
        u.eyeMat.emissiveIntensity = 5;
        if (this.stateT <= 0) { this.state = 'vacuum'; this.stateT = 2.4; Sfx.play('vacuum'); }
        break;
      }
      case 'vacuum': {
        u.beam.visible = true;
        const fwd = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
        u.beam.position.copy(this.group.position).add(_v.set(0, 3, 0)).addScaledVector(fwd, 7);
        u.beam.lookAt(this.group.position.x, this.group.position.y + 3.4, this.group.position.z);
        u.beam.rotateX(-Math.PI / 2);
        // pull player (boost against it!)
        const pull = this.group.position.clone().sub(player.pos).setY(0).normalize();
        player.vel.addScaledVector(pull, 30 * dt);
        if (Math.random() < 0.4) FX.spawn(player.pos.clone().add(_v.set(0, 1, 0)), pull.clone().multiplyScalar(-3), 0xffe08a, 1.5, 0.4, 0);
        if (flatDist(player.pos, this.group.position) < 2.8) { damagePlayer(8, this.group.position); this.stateT = 0; }
        if (this.stateT <= 0) { this.state = 'glide'; this.stateT = 2.2; u.beam.visible = false; }
        break;
      }
    }
  }
  reset() {
    this.virus = this.maxVirus;
    if (this.mode === 'fight') {
      this.group.position.copy(this.center).add(new THREE.Vector3(0, 0.6, -6));
      this.state = 'glide'; this.stateT = 2;
      showBossBar('MAMMA 🧹 (hypnotized)', true);
      setBossBar(1);
    }
  }
}

// ---------------- GIGA-DRILL BOSS ----------------
class GigaDrill {
  constructor(pos, arenaCenter, arenaRadius) {
    this.group = makeGigaDrill();
    this.group.position.copy(pos);
    this.homePos = pos.clone();
    this.center = arenaCenter.clone(); this.radius = arenaRadius;
    this.maxHp = 900; this.hp = 900;
    this.active = false; this.dead = false;
    this.state = 'idle'; this.t = 0; this.stateT = 2;
    this.weakOpen = 0;
    this.crouch = 0;
    this.attacksDone = 0;
    scene.add(this.group);
  }
  phase() { return this.hp > this.maxHp * 2 / 3 ? 1 : this.hp > this.maxHp / 3 ? 2 : 3; }
  weakWorldPos() {
    return this.group.userData.weak.getWorldPosition(new THREE.Vector3());
  }
  startFight() {
    if (this.active || this.dead) return;
    this.active = true;
    showBossBar('⛏ GIGA-DRILL ⛏', false);
    setObjective('Defeat the GIGA-DRILL! Strike the glowing core!');
    Sfx.setTheme('boss');
    const c = this.group.position;
    startCine({
      dur: 2.6, hold: 1,
      from: camera.position.clone(),
      to: new THREE.Vector3(c.x + 10, c.y + 9, c.z + 14),
      look: new THREE.Vector3(c.x, c.y + 4, c.z),
      onUpdate: (f, dt2) => { this.group.userData.drill.rotation.z += dt2 * 20; },
      onDone: () => {
        showBanner('⛏ GIGA-DRILL ⛏\nThe virus core-thief!', 2.6);
        Sfx.play('drill');
        S.shake = 0.6;
        if (L.family) {
          say(L.family.tetis, 'Go, Lūkass, go! 💪', 3, 6.2);
        }
      },
    });
  }
  hurt(dmg) {
    if (this.dead || this.weakOpen <= 0) return;
    this.hp -= dmg;
    Sfx.play('hit');
    spawnDmgNum(this.weakWorldPos(), dmg);
    FX.burst(this.weakWorldPos(), 0x66e0ff, 16, 7, 1.8, 0.6, 4);
    S.hitstop = Math.max(S.hitstop, 0.07);
    S.shake = Math.max(S.shake, 0.3);
    buzz(30);
    setBossBar(this.hp / this.maxHp);
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true; this.active = false;
    S.stats.kills++;
    hideBossBar();
    Sfx.setTheme(null);
    Sfx.play('explosion');
    onVictory();
  }
  update(dt) {
    const u = this.group.userData;
    this.t += dt;
    u.drill.rotation.z += dt * (this.state === 'drillCharge' ? 30 : 4);
    // leg stomp idle
    u.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.t * 2 + i) * 0.08; });
    if (this.dead) return;

    if (!this.active) {
      if (flatDist(player.pos, this.group.position) < 24) this.startFight();
      return;
    }
    const sp = DIFF().enemySpeed;
    this.stateT -= dt;
    const toP = player.pos.clone().sub(this.group.position); toP.y = 0;
    const dirP = toP.clone().normalize();
    if (this.state !== 'drillCharge') {
      const want = Math.atan2(dirP.x, dirP.z);
      this.group.rotation.y = dampAngle(this.group.rotation.y, want, 1.6, dt);
    }

    // weak point handling
    if (this.weakOpen > 0) {
      this.weakOpen -= dt;
      this.crouch = damp(this.crouch, 3.4, 5, dt);
      u.weakMat.emissiveIntensity = 3.5 + Math.sin(S.time * 10) * 1.5;
      u.weakHalo.scale.setScalar(3.4 + Math.sin(S.time * 8));
      u.doorL.visible = u.doorR.visible = false;
      u.eyeMat.emissiveIntensity = 0.6;
      if (this.weakOpen <= 0) { this.state = 'idle'; this.stateT = 1.2; Sfx.play('warning'); }
      this.group.position.y = this.homePos.y - this.crouch;
      return; // vulnerable, not attacking
    } else {
      this.crouch = damp(this.crouch, 0, 5, dt);
      this.group.position.y = this.homePos.y - this.crouch;
      u.doorL.visible = u.doorR.visible = true;
      u.weakMat.emissiveIntensity = 0.4;
      u.weakHalo.scale.setScalar(1.2);
      u.eyeMat.emissiveIntensity = 3.2;
    }

    switch (this.state) {
      case 'idle': {
        if (this.stateT <= 0) {
          const ph = this.phase();
          this.attacksDone++;
          // every 2 attacks → open weak point
          if (this.attacksDone % 2 === 0) {
            this.weakOpen = 4.5;
            Sfx.play('portal');
            if (!this._weakHintDone) { this._weakHintDone = true; showHint('⚡ STRIKE THE GLOWING CORE, LŪKASS! ⚡', 4); }
            say(this.group, '⚠ CORE OVERHEATING ⚠', 2, 8.5);
            break;
          }
          if (ph === 1) { this.state = 'laser'; this.stateT = 3; this.shots = 3; this.shotT = 0.4; Sfx.play('warning'); }
          else if (ph === 2) {
            if (Math.random() < 0.5 && L.enemies.filter(e => !e.dead).length < 2) { this.state = 'summon'; this.stateT = 1.2; Sfx.play('warning'); }
            else { this.state = 'drillWind'; this.stateT = 1.1; Sfx.play('warning'); }
          } else {
            const r = Math.random();
            if (r < 0.4) { this.state = 'slam'; this.stateT = 1.0; this.slams = 3; Sfx.play('warning'); }
            else if (r < 0.7) { this.state = 'drillWind'; this.stateT = 0.9; Sfx.play('warning'); }
            else { this.state = 'laser'; this.stateT = 2.4; this.shots = 5; this.shotT = 0.25; Sfx.play('warning'); }
          }
        }
        break;
      }
      case 'laser': {
        this.shotT -= dt;
        u.eyeMat.emissiveIntensity = 5 + Math.sin(S.time * 20) * 2;
        if (this.shotT <= 0 && this.shots > 0) {
          this.shots--; this.shotT = this.phase() === 3 ? 0.35 : 0.6;
          const eye = u.eyes[this.shots % 3].getWorldPosition(new THREE.Vector3());
          const m = makeLaserBall(0xff3355);
          m.position.copy(eye);
          const aim = player.pos.clone().add(_v.set(0, 0.8, 0)).sub(eye).normalize();
          spawnProjectile({ kind: 'laser', mesh: m, vel: aim.multiplyScalar(10 * sp), dmg: 10, life: 5, r: 0.7 });
          Sfx.play('laser');
        }
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 1.4; }
        break;
      }
      case 'summon': {
        if (this.stateT <= 0) {
          for (let i = 0; i < 2; i++) {
            const a = Math.random() * Math.PI * 2;
            const p = this.center.clone().add(new THREE.Vector3(Math.cos(a) * 8, 4, Math.sin(a) * 8));
            const dr = new Drone(p, 4);
            dr.state = 'chase';
            L.enemies.push(dr);
            FX.burst(p, 0xff5566, 12, 5, 1.5, 0.6, 3);
          }
          Sfx.play('explosion');
          this.state = 'idle'; this.stateT = 2.2;
        }
        break;
      }
      case 'drillWind': {
        this.chargeDir = dirP.clone();
        this.group.position.y = this.homePos.y + Math.sin(S.time * 30) * 0.1;
        if (this.stateT <= 0) { this.state = 'drillCharge'; this.stateT = 1.3; Sfx.play('drill'); S.shake = Math.max(S.shake, 0.3); }
        break;
      }
      case 'drillCharge': {
        this.group.position.addScaledVector(this.chargeDir, 16 * sp * dt);
        FX.spawn(this.group.position.clone().add(_v.set(0, 1, 0)), new THREE.Vector3((Math.random() - .5) * 4, 3, (Math.random() - .5) * 4), 0xffaa44, 2.2, 0.5, 2);
        if (flatDist(player.pos, this.group.position) < 4.5) damagePlayer(14, this.group.position);
        const fromC = this.group.position.clone().sub(this.center); fromC.y = 0;
        if (fromC.length() > this.radius - 4) this.stateT = 0;
        if (this.stateT <= 0) {
          this.state = 'idle'; this.stateT = 1.6;
          S.shake = Math.max(S.shake, 0.4);
          Sfx.play('stomp');
        }
        break;
      }
      case 'slam': {
        if (this.stateT <= 0) {
          this.slams--;
          spawnShockwave(this.group.position.clone().setY(this.homePos.y - 3.4), 22, 12, 0xff6633, 13);
          FX.burst(this.group.position.clone(), 0xff8855, 18, 7, 2.2, 0.8, 5);
          this.stateT = 1.15;
          if (this.slams <= 0) { this.state = 'idle'; this.stateT = 1.5; }
        }
        break;
      }
    }
    // gentle drift toward center-player midpoint so he doesn't wall-hug
    if (this.state === 'idle') {
      const goal = this.center.clone().lerp(player.pos, 0.35);
      const dir = goal.sub(this.group.position).setY(0);
      if (dir.length() > 6) this.group.position.addScaledVector(dir.normalize(), 2 * sp * dt);
    }
  }
  reset() {
    this.hp = this.maxHp;
    this.active = false;
    this.state = 'idle'; this.stateT = 2; this.weakOpen = 0; this.attacksDone = 0;
    this.group.position.copy(this.homePos);
    hideBossBar();
  }
}

// ---------------- Nexus Cores & Portal ----------------
function spawnNexusCore(pos) {
  const c = makeCore();
  c.position.copy(pos); c.position.y += 1.4;
  scene.add(c);
  L.cores.push({ mesh: c, t: Math.random() * 9, got: false });
}
function updateCores(dt) {
  for (const c of L.cores) {
    if (c.got) continue;
    c.t += dt;
    const u = c.mesh.userData;
    u.crystal.rotation.y += dt * 1.4;
    c.mesh.position.y += Math.sin(c.t * 2) * 0.25 * dt;
    u.light.intensity = 7 + Math.sin(c.t * 3) * 3;
    u.halo.scale.setScalar(2.4 + Math.sin(c.t * 3) * 0.5);
    if (player.pos.distanceTo(c.mesh.position) < 2.6) collectCore(c);
  }
}
function collectCore(c) {
  c.got = true;
  L.coresGot++;
  buzz([25, 40, 25]);
  Sfx.play('collect');
  FX.burst(c.mesh.position, 0xffc832, 26, 7, 2, 0.9, 2);
  flash(0.25, '#ffdf80');
  scene.remove(c.mesh);
  dom.cores.classList.remove('bounce'); dom.cores.offsetHeight; dom.cores.classList.add('bounce');
  dom.coreCount.textContent = `${L.coresGot} / 5`;
  setCheckpoint(player.pos);
  Sfx.play('checkpoint');
  if (L.coresGot >= 5) activatePortal();
  else {
    setObjective(`Find the Nexus Cores!  ${L.coresGot} / 5`);
    const cheers = [`Nice one, ${PLAYER_NAME}!`, `Great job, ${PLAYER_NAME}!`, `${5 - L.coresGot} to go, ${PLAYER_NAME}!`, 'Sanctuary power rising!'];
    showHint('⬡ ' + cheers[Math.min(3, L.coresGot - 1)], 2.5);
  }
}
function activatePortal() {
  if (!L.portal) return;
  L.portal.visible = true;
  L.portalActive = true;
  setObjective('The WARP GATE is open! Step through it!');
  Sfx.play('portal');
  S.shake = 0.5;
  const p = L.portal.position;
  startCine({
    dur: 2.6, hold: 0.6,
    from: camera.position.clone(),
    to: new THREE.Vector3(p.x + 7, p.y + 4, p.z + 8),
    look: p.clone(),
    onDone: () => showBanner('🌀 THE WARP GATE IS OPEN! 🌀', 2.5),
  });
}
function updatePortal(dt) {
  if (!L.portal || !L.portal.visible) return;
  const u = L.portal.userData;
  u.ring1.rotation.z += dt * 0.8;
  u.ring2.rotation.z -= dt * 1.2;
  u.discMat.emissiveIntensity = 1.4 + Math.sin(S.time * 4) * 0.5;
  u.light.intensity = 9 + Math.sin(S.time * 5) * 3;
  if (Math.random() < 0.3) {
    const a = Math.random() * Math.PI * 2;
    FX.spawn(
      L.portal.position.clone().add(new THREE.Vector3(Math.cos(a) * 2, (Math.random() - .5) * 3, Math.sin(a) * 2)),
      new THREE.Vector3(-Math.cos(a) * 1.5, 1, -Math.sin(a) * 1.5), 0x66aaff, 1.6, 0.7, 0);
  }
  if (L.portalActive && flatDist(player.pos, L.portal.position) < 2.2
      && Math.abs(player.pos.y - (L.portal.position.y - 2.2)) < 3.5) warpToLevel2();
}
function warpToLevel2() {
  if (S.state !== 'playing') return;
  S.state = 'warp';
  Sfx.play('portal');
  flash(1.4, '#ffffff');
  setTimeout(() => {
    S.levelNum = 2;
    saveGame();
    buildLevel2();
    S.state = 'playing';
    cam.yaw = Math.PI;
    cam.pos.copy(player.pos).add(new THREE.Vector3(0, 5, 8));
    cam.look.copy(player.pos);
    flash(1, '#ffffff');
  }, 700);
}

// ---------------- Checkpoints / defeat / victory ----------------
function setCheckpoint(pos) {
  L.checkpoint.copy(pos);
  player.lastSafe.copy(pos);
}
function onDefeat() {
  if (player.dead) return;
  player.dead = true;
  S.state = 'defeat';
  Sfx.play('explosion');
  FX.burst(player.pos, 0x66ccff, 30, 8, 2, 1, 4);
  flash(0.6, '#88bbff');
  setTimeout(() => {
    dom.defeat.classList.remove('hidden');
    const subs = [
      `Spark needs a quick reboot… You've got this, ${PLAYER_NAME}!`,
      `So close! The Sanctuary believes in you, ${PLAYER_NAME}!`,
      `Rust-Bots got lucky. Show them who's boss!`,
    ];
    $('defeat-sub').textContent = subs[Math.floor(Math.random() * subs.length)];
  }, 900);
}
function retryFromCheckpoint() {
  dom.defeat.classList.add('hidden');
  player.dead = false;
  player.hp = player.maxHp;
  player.energy = player.maxEnergy;
  player.pos.copy(L.checkpoint).y += 0.5;
  player.vel.set(0, 0, 0);
  player.lastSafe.copy(L.checkpoint);
  player.invuln = 2;
  player.trapped = 0;
  if (player.trappedBubble) { scene.remove(player.trappedBubble); player.trappedBubble = null; }
  // clear projectiles & shockwaves
  for (const pr of L.projectiles) scene.remove(pr.mesh);
  L.projectiles.length = 0;
  for (const sw of L.shockwaves) scene.remove(sw.mesh);
  L.shockwaves.length = 0;
  // reset active fights
  if (L.miniboss && L.miniboss.active && !L.miniboss.freed) L.miniboss.reset();
  if (L.miniboss && L.miniboss.mode === 'fight' && !L.miniboss.freed) L.miniboss.reset();
  if (L.boss && L.boss.active && !L.boss.dead) L.boss.reset();
  S.state = 'playing';
  Sfx.setTheme(S.levelNum === 1 ? 'sky' : 'lava');
  cam.pos.copy(player.pos).add(new THREE.Vector3(0, 5, 8));
}
function onVictory() {
  S.state = 'victory';
  hideBossBar();
  hideHint();
  buzz([120, 80, 120, 80, 250]);
  Sfx.play('fanfare');
  saveGame(true);
  const bossPos = L.boss.group.position.clone();
  // explosion cascade
  let n = 0;
  const iv = setInterval(() => {
    n++;
    const p = bossPos.clone().add(new THREE.Vector3((Math.random() - .5) * 8, Math.random() * 6, (Math.random() - .5) * 8));
    FX.burst(p, [0xff8844, 0xffee88, 0x66e0ff][n % 3], 24, 9, 2.4, 1, 3);
    Sfx.play('explosion');
    S.shake = 0.5;
    if (n > 6) {
      clearInterval(iv);
      scene.remove(L.boss.group);
      if (L.family) {
        say(L.family.mamma, `Mans varonis! ${PLAYER_NAME} did it!! ❤`, 4, 6.8);
      }
    }
  }, 350);
  setTimeout(() => {
    const t = Math.floor((performance.now() - S.stats.startTime) / 1000);
    const mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
    dom.victoryStats.textContent =
      `⭐ PILOT: ${PLAYER_NAME} ⭐\n⏱ Time: ${mm}:${ss}\n🤖 Bots defeated: ${S.stats.kills}\n👨‍👩‍👦 Family freed: Tētis & Mamma ❤\n💎 The Sky Sanctuary shines again!`;
    dom.victory.classList.remove('hidden');
  }, 4200);
}
let fireworkT = 0;
function updateVictory(dt) {
  // slow orbit camera + fireworks
  const c = player.pos;
  const a = S.time * 0.25;
  camera.position.set(c.x + Math.cos(a) * 12, c.y + 5 + Math.sin(S.time * 0.5) * 1.5, c.z + Math.sin(a) * 12);
  camera.lookAt(c.x, c.y + 2, c.z);
  fireworkT -= dt;
  if (fireworkT <= 0) {
    fireworkT = 0.5 + Math.random() * 0.5;
    const p = player.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 24, 8 + Math.random() * 8, (Math.random() - .5) * 24));
    FX.burst(p, [0xff5577, 0xffc832, 0x29e6ff, 0x66ff88, 0xb866ff][Math.floor(Math.random() * 5)], 30, 9, 2, 1.4, 3);
    Sfx.play('pop');
  }
}

// ---------------- Tutorial hints ----------------
const tut = {
  step: -1, done: false,
  start() {
    this.step = 0; this.done = false;
    showHint(IS_TOUCH ? `Touch the LEFT side and drag to move, ${PLAYER_NAME}!` : `Move with WASD, ${PLAYER_NAME}!`, 99);
  },
  onMove() { if (this.step === 0) { this.step = 1; showHint(IS_TOUCH ? 'Hold 🚀 to BOOST-JUMP!' : 'Hold SPACE to BOOST-JUMP!', 99); } },
  onJump() { if (this.step === 1) { this.step = 2; showHint(IS_TOUCH ? 'Tap ⚔ to swing your sword!' : 'CLICK or press J to swing your sword!', 99); } },
  onAttack() {
    if (this.step === 2) {
      this.step = 3; this.done = true;
      showHint(IS_TOUCH
        ? `Swipe the RIGHT side to look around! Follow the GOLDEN ARROW! ⬡`
        : `Great, ${PLAYER_NAME}! Follow the GOLDEN ARROW to the Nexus Cores! ⬡`, 6);
    }
  },
  onShield() {},
};

// ---------------- Objective arrow ----------------
let arrow = null;
function updateArrow(dt) {
  if (!arrow) return;
  let target = null;
  if (S.levelNum === 1) {
    if (L.portalActive) target = L.portal.position;
    else if (L.miniboss && L.miniboss.active && !L.miniboss.freed) target = L.miniboss.group.position;
    else {
      let best = 1e9;
      for (const c of L.cores) if (!c.got) {
        const d = player.pos.distanceTo(c.mesh.position);
        if (d < best) { best = d; target = c.mesh.position; }
      }
      if (!target && L.miniboss && !L.miniboss.freed) target = L.miniboss.group.position;
    }
  } else {
    if (L.miniboss && !L.miniboss.freed) target = L.miniboss.mode === 'fight' ? L.miniboss.group.position : L.arenaMid;
    else if (L.boss && !L.boss.dead) target = L.boss.group.position;
  }
  if (!target || (S.levelNum === 1 && !tut.done && tut.step >= 0)) { arrow.visible = false; return; }
  arrow.visible = true;
  arrow.position.copy(player.pos);
  arrow.position.y += 3.1 + Math.sin(S.time * 3) * 0.12;
  const dir = target.clone().sub(player.pos);
  arrow.rotation.y = Math.atan2(dir.x, dir.z);
  arrow.userData.mat.emissiveIntensity = 1.6 + Math.sin(S.time * 4) * 0.6;
}

// ---------------- LEVEL BUILDING ----------------
function freshLevel() {
  if (scene) {
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose?.();
    });
  }
  scene = new THREE.Scene();
  scene.environment = ENV_TEX;
  scene.environmentIntensity = 0.5;
  FX = new Particles();
  scene.add(FX.points);
  return {
    walkables: [], camBlockers: [], obstacles: [],
    enemies: [], cores: [], pickups: [], projectiles: [], shockwaves: [],
    updatables: [], clouds: [], coresGot: 0,
    portal: null, portalActive: false,
    miniboss: null, boss: null, family: null,
    killY: -40, lavaY: undefined,
    checkpoint: new THREE.Vector3(),
    spawn: new THREE.Vector3(),
  };
}

function addLights(kind) {
  if (kind === 'sky') {
    const hemi = new THREE.HemisphereLight(0xbdd9ff, 0x4a6a3a, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sun.position.set(40, 60, 25);
    if (Q.shadow) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
      sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
      sun.shadow.camera.far = 220;
      sun.shadow.bias = -0.0004;
    }
    scene.add(sun);
    scene.add(sun.target);
    L.sun = sun;
  } else {
    const hemi = new THREE.HemisphereLight(0x663322, 0xff4400, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb080, 1.6);
    sun.position.set(-30, 50, 30);
    if (Q.shadow) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
      sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
      sun.shadow.camera.far = 220;
      sun.shadow.bias = -0.0004;
    }
    scene.add(sun);
    scene.add(sun.target);
    L.sun = sun;
    const lavaGlow = new THREE.PointLight(0xff5522, 3, 120, 1.2);
    lavaGlow.position.set(0, 6, -60);
    scene.add(lavaGlow);
  }
}

function buildLevel1() {
  L = freshLevel();
  S.levelNum = 1;
  scene.fog = new THREE.FogExp2(0x9db9e8, 0.0075);
  scene.add(makeSkyDome(0x3f7fdc, 0xcfe3ff));
  addLights('sky');

  // islands: [x, y, z, radius]
  const islands = [
    [0, 0, 0, 10],       // start
    [0, -2, -24, 7],
    [16, 0, -40, 7],
    [2, 2, -56, 6.5],
    [-18, 4, -64, 7],
    [-24, 2, -92, 14],   // Tētis arena
  ];
  const isMeshes = [];
  for (const [x, y, z, r] of islands) {
    const { group, top } = makeIsland(r);
    group.position.set(x, y, z);
    scene.add(group);
    top.updateMatrixWorld();
    L.walkables.push(top);
    L.camBlockers.push(top);
    isMeshes.push({ x, y, z, r });
  }
  // stepping stones between islands
  const stones = [
    [0, -1.5, -13, 3], [9, -1.4, -33, 3], [10, 0.8, -49, 2.8], [-9, 2.8, -61, 2.8], [-23, 3, -78, 3.2],
  ];
  for (const [x, y, z, r] of stones) {
    const { group, top } = makeIsland(r);
    group.position.set(x, y, z);
    scene.add(group);
    L.walkables.push(top);
  }

  // decorative drifting mini islands + distant spires
  if (Q.deco > 0.4) {
    for (let i = 0; i < 8 * Q.deco; i++) {
      const { group } = makeIsland(1.5 + Math.random() * 2);
      group.position.set((Math.random() - 0.5) * 160, -10 - Math.random() * 20, -Math.random() * 160 + 30);
      group.userData.driftSeed = Math.random() * 10;
      scene.add(group);
      L.updatables.push({ update: (dt) => { group.position.y += Math.sin(S.time * 0.5 + group.userData.driftSeed) * 0.3 * dt; } });
    }
    for (let i = 0; i < 6 * Q.deco; i++) {
      const sp = makeRockSpire(20 + Math.random() * 30);
      sp.position.set((Math.random() - 0.5) * 400, -50, -180 - Math.random() * 200);
      scene.add(sp);
    }
  }

  // clouds below
  for (let i = 0; i < Q.clouds; i++) {
    const cl = makeCloud();
    cl.position.set((Math.random() - 0.5) * 180, -16 - Math.random() * 18, -Math.random() * 140 + 20);
    scene.add(cl);
    L.clouds.push(cl);
  }

  // Nexus cores on islands 1..4
  spawnNexusCore(new THREE.Vector3(0, -1.3, -24));
  spawnNexusCore(new THREE.Vector3(16, 0.7, -40));
  spawnNexusCore(new THREE.Vector3(2, 2.7, -56));
  spawnNexusCore(new THREE.Vector3(-18, 4.7, -64));

  // drones
  const dronePts = [
    [0, 1.5, -27], [14, 3.5, -37], [19, 3.2, -43], [0, 5.5, -53], [5, 5, -59],
    [-16, 7.5, -61], [-21, 7, -67], [-15, 7.6, -66],
  ];
  for (const [x, y, z] of dronePts) L.enemies.push(new Drone(new THREE.Vector3(x, y, z)));

  // Tētis-Bot on arena island
  const arenaC = new THREE.Vector3(-24, 2.7, -92);
  L.miniboss = new TetisBot(arenaC.clone().add(new THREE.Vector3(0, 0, -4)), arenaC, 13);

  // portal (hidden until 5 cores)
  const portal = makePortal();
  portal.position.copy(arenaC).add(new THREE.Vector3(6, 2.4, 5));
  portal.visible = false;
  scene.add(portal);
  L.portal = portal;

  L.killY = -35;
  L.spawn.set(0, 1.5, 3);
  L.checkpoint.copy(L.spawn);

  setObjective('Find the Nexus Cores!  0 / 5');
  dom.coreCount.textContent = '0 / 5';
  Sfx.setTheme('sky');

  arrow = makeObjectiveArrow();
  scene.add(arrow);

  setupPlayer(L.spawn);
}

function buildLevel2() {
  L = freshLevel();
  S.levelNum = 2;
  scene.fog = new THREE.FogExp2(0x38160a, 0.011);
  scene.add(makeSkyDome(0x1b0d08, 0x7a2504));
  addLights('lava');

  // lava sea
  const lava = makeLava(400);
  lava.position.y = -2;
  scene.add(lava);
  L.lava = lava;
  L.lavaY = -0.4;
  L.killY = -1.5;

  // platforms & bridges (bridge tops at y≈4)
  const H = 4;
  const start = makePlatform(8, true);
  start.group.position.set(0, H, 0);
  scene.add(start.group);
  L.walkables.push(start.top); L.camBlockers.push(start.top);

  const bridgeA = makeBridge(34, 3.6);
  bridgeA.group.position.set(0, H, -24);
  scene.add(bridgeA.group);
  L.walkables.push(bridgeA.top); L.camBlockers.push(bridgeA.top);
  // cover pillars on bridge A
  for (const z of [-16, -24, -32]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 3.4, 7), bridgeA.top.material);
    p.position.set((z === -24 ? -1 : 1) * 1.0, H + 2, z);
    p.castShadow = true;
    scene.add(p);
    L.obstacles.push(p); L.camBlockers.push(p);
  }

  const mid = makePlatform(13, true);
  mid.group.position.set(0, H, -56);
  scene.add(mid.group);
  L.walkables.push(mid.top); L.camBlockers.push(mid.top);
  L.arenaMid = new THREE.Vector3(0, H + 0.7, -56);

  const bridgeB = makeBridge(22, 4);
  bridgeB.group.position.set(0, H, -80);
  scene.add(bridgeB.group);
  L.walkables.push(bridgeB.top); L.camBlockers.push(bridgeB.top);

  const bossArena = makePlatform(20, true);
  bossArena.group.position.set(0, H, -112);
  scene.add(bossArena.group);
  L.walkables.push(bossArena.top); L.camBlockers.push(bossArena.top);

  // family cheer platform beside boss arena
  const fam = makePlatform(5, true);
  fam.group.position.set(26, H + 2, -108);
  scene.add(fam.group);

  // distant obsidian spires
  if (Q.deco > 0.4) {
    for (let i = 0; i < 10 * Q.deco; i++) {
      const sp = makeRockSpire(15 + Math.random() * 35);
      sp.material = mid.top.material;
      sp.position.set((Math.random() - 0.5) * 300, -2, -Math.random() * 250 + 40);
      if (Math.abs(sp.position.x) < 26 && sp.position.z < -30 && sp.position.z > -130) sp.position.x += Math.sign(sp.position.x || 1) * 40;
      scene.add(sp);
    }
  }

  // MAMMA-BOT patrols bridge A
  const arenaC = new THREE.Vector3(0, H + 0.7, -56);
  L.miniboss = new MammaBot(
    new THREE.Vector3(0, H + 0.6, -14),
    new THREE.Vector3(0, H + 0.6, -38),
    arenaC, 12,
    new THREE.Vector3(0, H + 1.2, -4),
  );
  // fight triggers when player reaches mid platform
  L.updatables.push({
    update: () => {
      if (L.miniboss.mode === 'patrol' && flatDist(player.pos, arenaC) < 11) {
        L.miniboss.startFight();
        setCheckpoint(new THREE.Vector3(0, H + 1.2, -46));
      }
    },
  });

  // GIGA-DRILL boss
  L.boss = new GigaDrill(new THREE.Vector3(0, H + 0.7, -118), new THREE.Vector3(0, H + 0.7, -112), 18);

  // freed family cheering on the side platform
  const tetis = makeTetis();
  tetis.userData.eyeMat.emissive.setHex(0x22ff66);
  tetis.userData.eyeMat.color.setHex(0x052210);
  tetis.position.set(24.5, H + 2.7, -106.5);
  tetis.rotation.y = -Math.PI / 2.4;
  scene.add(tetis);
  const mamma = makeMamma();
  mamma.userData.eyeMat.emissive.setHex(0x22ff66);
  mamma.userData.eyeMat.color.setHex(0x052210);
  mamma.position.set(27.5, H + 2.7, -110);
  mamma.rotation.y = -Math.PI / 2;
  scene.add(mamma);
  L.family = { tetis, mamma, cheerT: 14, pancakeT: 22 };
  L.updatables.push({
    update: (dt) => {
      const f = L.family;
      // gentle cheer bob
      f.tetis.position.y = H + 2.7 + Math.abs(Math.sin(S.time * 2.2)) * 0.2;
      f.tetis.userData.armL.rotation.z = Math.sin(S.time * 4) * 0.5 + 0.4;
      f.tetis.userData.armR.rotation.z = -Math.sin(S.time * 4) * 0.5 - 0.4;
      f.mamma.position.y = H + 2.7 + Math.abs(Math.sin(S.time * 2.2 + 1)) * 0.18;
      if (!L.boss.active || L.boss.dead) return;
      f.cheerT -= dt;
      if (f.cheerT <= 0) {
        f.cheerT = 12 + Math.random() * 6;
        const lines = [`Go, ${PLAYER_NAME}, go! 💪`, `You can do it, dēliņ!`, `Watch the drill, ${PLAYER_NAME}!`, `Mūsu varonis! ⭐`];
        say(Math.random() < 0.5 ? f.tetis : f.mamma, lines[Math.floor(Math.random() * lines.length)], 2.5, 6.4);
      }
      f.pancakeT -= dt;
      if (f.pancakeT <= 0) {
        f.pancakeT = 20 + Math.random() * 8;
        say(f.mamma, 'Pancake power! 🥞', 2, 6.8);
        const from = f.mamma.position.clone().add(_v.set(0, 4, 0));
        const to = new THREE.Vector3((Math.random() - .5) * 14, H + 1, -112 + (Math.random() - .5) * 14);
        const vel = to.sub(from).multiplyScalar(0.55); vel.y = 9;
        spawnPickup('pancake', from, vel);
      }
    },
  });

  // embers ambient
  L.updatables.push({
    update: (dt) => {
      if (Math.random() < 0.35) {
        FX.spawn(
          new THREE.Vector3(player.pos.x + (Math.random() - .5) * 50, -1, player.pos.z + (Math.random() - .5) * 50),
          new THREE.Vector3((Math.random() - .5) * 0.6, 2.5 + Math.random() * 2, (Math.random() - .5) * 0.6),
          0xff7733, 1.6, 2.4, -0.4);
      }
      L.lava.userData.mat.emissiveIntensity = 1.0 + Math.sin(S.time * 0.8) * 0.25;
    },
  });

  L.spawn.set(0, H + 1.2, 3);
  L.checkpoint.copy(L.spawn);

  setObjective('Cross the lava bridges! Watch out for Mamma!');
  dom.coreCount.textContent = '5 / 5';
  Sfx.setTheme('lava');

  arrow = makeObjectiveArrow();
  scene.add(arrow);

  setupPlayer(L.spawn);
  showBanner('LEVEL 2\n🌋 THE LAVA CORE 🌋', 3);
  setTimeout(() => showHint('Sneak past Mamma\'s vacuum beam! Hide behind pillars!', 5), 3200);
}

// ---------------- Save / Load ----------------
function saveGame(completed = false) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    level: completed ? 1 : S.levelNum,
    difficulty: S.difficulty,
    perks: completed ? { swordUp: false, hpBonus: 0 } : S.perks,
    completed,
  }));
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}

// ---------------- Screens & flow ----------------
function setDifficulty(d) {
  S.difficulty = d;
  localStorage.setItem('cs_diff', d);
  dom.diffExplorer.classList.toggle('selected', d === 'explorer');
  dom.diffHero.classList.toggle('selected', d === 'hero');
  Sfx.play('click');
}
dom.diffExplorer.addEventListener('click', () => { Sfx.unlock(); setDifficulty('explorer'); });
dom.diffHero.addEventListener('click', () => { Sfx.unlock(); setDifficulty('hero'); });

function requestFullscreenIfMobile() {
  if (!IS_TOUCH) return;
  const el = document.documentElement;
  (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el).catch?.(() => {});
  screen.orientation?.lock?.('landscape').catch(() => {});
}

function startGame(fromSave) {
  Sfx.unlock();
  requestFullscreenIfMobile();
  dom.title.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  S.stats = { startTime: performance.now(), kills: 0 };
  const sv = fromSave ? loadSave() : null;
  S.perks = sv && !sv.completed ? (sv.perks || { swordUp: false, hpBonus: 0 }) : { swordUp: false, hpBonus: 0 };
  if (sv && !sv.completed && sv.level === 2) {
    buildLevel2();
  } else {
    buildLevel1();
    showBanner(`LEVEL 1\n☁ THE SKY ISLANDS ☁`, 3);
    tut.start();
  }
  S.state = 'playing';
  cam.yaw = Math.PI;
  cam.pos.copy(player.pos).add(new THREE.Vector3(0, 5, 8));
  Sfx.play('powerup');
}

dom.btnNew.addEventListener('click', () => startGame(false));
dom.btnContinue.addEventListener('click', () => startGame(true));
dom.btnRetry.addEventListener('click', () => { Sfx.unlock(); Sfx.play('click'); retryFromCheckpoint(); });
dom.btnAgain.addEventListener('click', () => location.reload());
dom.btnResume.addEventListener('click', () => togglePause());
dom.btnQuit.addEventListener('click', () => location.reload());
dom.btnPause.addEventListener('click', () => togglePause());
dom.btnMute.addEventListener('click', () => {
  Sfx.unlock();
  const m = Sfx.toggleMute();
  dom.btnMute.textContent = m ? '🔇' : '🔊';
});
if (Sfx.muted) dom.btnMute.textContent = '🔇';

function togglePause() {
  if (S.state === 'playing') {
    S.state = 'paused';
    dom.pause.classList.remove('hidden');
    Sfx.suspend();
  } else if (S.state === 'paused') {
    S.state = 'playing';
    dom.pause.classList.add('hidden');
    Sfx.resume();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.state === 'playing') togglePause();
});
// iOS can leave audio 'interrupted' after calls/app-switching — recover on any tap
addEventListener('pointerdown', () => { if (S.state !== 'paused') Sfx.resume(); });

// Continue button visibility
{
  const sv = loadSave();
  if (sv && !sv.completed && sv.level >= 2) {
    dom.btnContinue.classList.remove('hidden');
    dom.btnContinue.textContent = '↻ CONTINUE — LEVEL 2';
  }
  if (sv?.difficulty) setDifficulty(sv.difficulty);
  else setDifficulty(S.difficulty);
}

// ---------------- Title scene (cinematic backdrop) ----------------
function buildTitleScene() {
  L = freshLevel();
  scene.fog = new THREE.FogExp2(0x9db9e8, 0.008);
  scene.add(makeSkyDome(0x3f7fdc, 0xcfe3ff));
  addLights('sky');
  const { group, top } = makeIsland(10);
  scene.add(group);
  L.walkables.push(top);
  for (let i = 0; i < Q.clouds; i++) {
    const cl = makeCloud();
    cl.position.set((Math.random() - 0.5) * 120, -14 - Math.random() * 15, (Math.random() - 0.5) * 120);
    scene.add(cl);
    L.clouds.push(cl);
  }
  for (let i = 0; i < 5; i++) {
    const { group: mi } = makeIsland(2 + Math.random() * 2);
    mi.position.set((Math.random() - 0.5) * 90, -8 - Math.random() * 14, (Math.random() - 0.5) * 90);
    scene.add(mi);
  }
  // spark + a core on display
  player.mesh = makeSpark();
  player.pos.set(0, 1.3, 0);
  player.mesh.position.copy(player.pos);
  scene.add(player.mesh);
  const core = makeCore();
  core.position.set(3, 2.6, -2);
  scene.add(core);
  L.cores.push({ mesh: core, t: 0, got: false });
}
function updateTitle(dt) {
  const a = S.time * 0.12;
  camera.position.set(Math.cos(a) * 16, 6 + Math.sin(S.time * 0.3) * 1.2, Math.sin(a) * 16);
  camera.lookAt(0, 2, 0);
  const u = player.mesh.userData;
  u.inner.position.y = 0.55 + Math.sin(S.time * 2.2) * 0.09;
  u.coreMat.emissiveIntensity = 2 + Math.sin(S.time * 5) * 0.8;
  for (const c of L.cores) {
    c.t += dt;
    c.mesh.userData.crystal.rotation.y += dt * 1.4;
    c.mesh.userData.halo.scale.setScalar(2.4 + Math.sin(c.t * 3) * 0.5);
  }
}

// ---------------- HUD update ----------------
function updateHUD() {
  dom.healthBar.style.width = (player.hp / player.maxHp * 100) + '%';
  dom.energyBar.style.width = (player.energy / player.maxEnergy * 100) + '%';
  const vig = dom.vignette;
  if (player.hp < player.maxHp * 0.3) vig.style.opacity = 0.5 + Math.sin(S.time * 4) * 0.2;
  else if (player.lastHurt > 0.6) vig.style.opacity = 0;
}

// ---------------- ambient ----------------
function updateAmbient(dt) {
  for (const cl of L.clouds) {
    cl.position.x += dt * 1.2;
    if (cl.position.x > 110) cl.position.x = -110;
  }
  if (L.sun) {
    L.sun.position.set(player.pos.x + 40, player.pos.y + 60, player.pos.z + 25);
    L.sun.target.position.copy(player.pos);
  }
}

// ---------------- FPS / dynamic resolution ----------------
let fpsAcc = 0, fpsN = 0, fpsCheckT = 0;
function updateDynamicRes(dt) {
  fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++;
  fpsCheckT += dt;
  if (fpsCheckT >= 2) {
    const avg = fpsAcc / fpsN;
    fpsAcc = 0; fpsN = 0; fpsCheckT = 0;
    if (avg < 45 && renderScale > 0.6) {
      renderScale = Math.max(0.6, renderScale - 0.1);
      renderer.setSize(innerWidth * renderScale, innerHeight * renderScale, false);
    } else if (avg > 56 && renderScale < 1) {
      renderScale = Math.min(1, renderScale + 0.1);
      renderer.setSize(innerWidth * renderScale, innerHeight * renderScale, false);
    }
  }
}

// ---------------- MAIN LOOP ----------------
const FIXED = 1 / 60;
let acc = 0, lastT = performance.now();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  let rawDt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (S.state === 'paused') return;

  // hitstop: freeze simulation briefly, keep rendering
  if (S.hitstop > 0) {
    S.hitstop -= rawDt;
    renderer.render(scene, camera);
    return;
  }

  acc += rawDt;
  let steps = 0;
  while (acc >= FIXED && steps < 4) {
    tick(FIXED);
    acc -= FIXED;
    steps++;
  }

  // flash overlay decay (visual, per-frame)
  if (flashV > 0) {
    flashV = Math.max(0, flashV - rawDt * 2.2);
    dom.flash.style.background = flashColor;
    dom.flash.style.opacity = Math.min(1, flashV);
  }
  if (bannerTimer > 0) { bannerTimer -= rawDt; if (bannerTimer <= 0) dom.banner.classList.add('hidden'); }
  if (hintTimer > 0 && hintTimer < 90) { hintTimer -= rawDt; if (hintTimer <= 0) hideHint(); }

  updateDynamicRes(rawDt);
  renderer.render(scene, camera);
}

function tick(dt) {
  S.time += dt;

  if (S.state === 'title') { updateTitle(dt); FX.update(dt); updateAmbient(dt); return; }
  if (S.state === 'victory') { updateVictory(dt); FX.update(dt); updateDmgNums(dt); updateSpeech(dt); updateAmbient(dt); if (L.family) L.updatables.forEach(u2 => u2.update(dt)); return; }
  if (S.state === 'warp') { FX.update(dt); return; }
  if (S.state === 'defeat') { FX.update(dt); updateDmgNums(dt); return; }
  if (S.state === 'cine') {
    updateCine(dt);
    FX.update(dt);
    updateSpeech(dt);
    updateAmbient(dt);
    updateCores(dt);
    updatePortal(dt);
    if (L.miniboss && L.miniboss.freed) L.miniboss.update(dt);
    return;
  }
  if (S.state !== 'playing') return;

  updatePlayer(dt);
  for (const e of L.enemies) e.update(dt);
  if (L.miniboss) L.miniboss.update(dt);
  if (L.boss) L.boss.update(dt);
  for (const u2 of L.updatables) u2.update(dt);
  updateProjectiles(dt);
  updateShockwaves(dt);
  updatePickups(dt);
  updateCores(dt);
  updatePortal(dt);
  updateArrow(dt);
  FX.update(dt);
  updateAmbient(dt);
  updateCamera(dt);
  updateHUD();
  updateSpeech(dt);
  updateDmgNums(dt);
}

// ---------------- boot ----------------
buildTitleScene();
frame();

// dev/test hook (harmless in production)
window.CS = {
  get S() { return S; }, get L() { return L; }, player,
  tp(x, y, z) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.lastSafe.set(x, y, z); },
  giveCores() { while (L.cores.some(c => !c.got)) { const c = L.cores.find(c2 => !c2.got); collectCore(c); } },
  step(n = 1) { for (let i = 0; i < n; i++) tick(FIXED); renderer.render(scene, camera); },
};
