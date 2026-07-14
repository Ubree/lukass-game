// ============ models.js — procedural 3D model factories ============
// Everything is built from Three.js primitives. No downloaded assets.
import * as THREE from 'three';

// ---------- shared glow texture (fake bloom sprites) ----------
let _glowTex = null;
export function glowTex() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

export function makeHalo(color, size) {
  const m = new THREE.SpriteMaterial({
    map: glowTex(), color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

// ---------- shared materials ----------
export const MAT = {
  grass:    new THREE.MeshStandardMaterial({ color: 0x62c554, roughness: 0.95, flatShading: true }),
  rock:     new THREE.MeshStandardMaterial({ color: 0x8d8073, roughness: 1.0, flatShading: true }),
  obsidian: new THREE.MeshStandardMaterial({ color: 0x221d2e, roughness: 0.9, metalness: 0.15, flatShading: true }),
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x49525e, roughness: 0.35, metalness: 0.85 }),
  darkMetal:new THREE.MeshStandardMaterial({ color: 0x2b323c, roughness: 0.4, metalness: 0.8 }),
  gold:     new THREE.MeshStandardMaterial({ color: 0xd9a836, roughness: 0.25, metalness: 0.95 }),
  chrome:   new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.15, metalness: 1.0 }),
  yellow:   new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.3, metalness: 0.55 }),
  white:    new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.35, metalness: 0.4 }),
  roseGold: new THREE.MeshStandardMaterial({ color: 0xe8b4a0, roughness: 0.3, metalness: 0.75 }),
  brown:    new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.55, metalness: 0.5 }),
  cloud:    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92, flatShading: true }),
};

function emissiveMat(color, intensity = 2, base = 0x111111) {
  return new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

// Pseudo-random offset derived from vertex POSITION (not index) so vertices
// duplicated for normals/caps move identically — no cracks in the mesh.
function hash3(x, y, z, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.3) * 43758.5453;
  return s - Math.floor(s);
}
function jitterGeometry(geo, amount, yOnly = false) {
  const pos = geo.attributes.position;
  const seed = Math.random() * 100;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (!yOnly) {
      pos.setX(i, x + (hash3(x, y, z, seed + 1) - 0.5) * amount);
      pos.setZ(i, z + (hash3(x, y, z, seed + 2) - 0.5) * amount);
    }
    pos.setY(i, y + (hash3(x, y, z, seed + 3) - 0.5) * amount);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ============ SPARK — the player droid ============
export function makeSpark() {
  const root = new THREE.Group();
  const inner = new THREE.Group(); // bob / bank / squash target
  root.add(inner);
  const u = root.userData;
  u.inner = inner;

  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), MAT.yellow);
  head.position.y = 0.72;
  head.castShadow = true;
  inner.add(head);
  u.head = head;

  // visor band (front-facing emissive stripe)
  const visorMat = emissiveMat(0x29e6ff, 2.6, 0x08222a);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.505, 24, 10, -0.7, 1.4, Math.PI / 2.6, 0.5), visorMat);
  visor.position.copy(head.position);
  inner.add(visor);
  u.visorMat = visorMat;

  // antenna
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), MAT.gunmetal);
  ant.position.set(0, 1.3, 0);
  inner.add(ant);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), emissiveMat(0xff4d6d, 2));
  antTip.position.set(0, 1.46, 0);
  inner.add(antTip);
  u.antTip = antTip;

  // chest capsule
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.3, 6, 16), MAT.gunmetal);
  chest.position.y = 0.05;
  chest.castShadow = true;
  inner.add(chest);

  // pulsing core light in chest
  const coreMat = emissiveMat(0x29e6ff, 2.5, 0x06222a);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), coreMat);
  core.position.set(0, 0.12, 0.28);
  inner.add(core);
  u.coreMat = coreMat;
  const coreHalo = makeHalo(0x29e6ff, 0.7);
  coreHalo.position.copy(core.position);
  inner.add(coreHalo);

  // thruster
  const thr = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 12), MAT.darkMetal);
  thr.rotation.x = Math.PI;
  thr.position.y = -0.42;
  inner.add(thr);
  const flame = makeHalo(0x4db8ff, 0.9);
  flame.position.y = -0.72;
  inner.add(flame);
  u.flame = flame;

  // left hand
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), MAT.chrome);
  handL.position.set(-0.58, 0.15, 0);
  handL.castShadow = true;
  inner.add(handL);
  u.handL = handL;

  // right arm with sword — pivot at shoulder
  const swordArm = new THREE.Group();
  swordArm.position.set(0.58, 0.35, 0);
  inner.add(swordArm);
  u.swordArm = swordArm;

  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), MAT.chrome);
  handR.position.set(0, -0.2, 0);
  swordArm.add(handR);

  const sword = new THREE.Group();
  sword.position.set(0, -0.2, 0.1);
  sword.rotation.x = Math.PI / 2.4; // blade angled forward-up
  swordArm.add(sword);
  u.sword = sword;

  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 8), MAT.gunmetal);
  sword.add(hilt);
  const bladeMat = emissiveMat(0x35c6ff, 3.2, 0x0a2c3a);
  bladeMat.transparent = true; bladeMat.opacity = 0.95;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 1.5, 8), bladeMat);
  blade.position.y = 0.85;
  sword.add(blade);
  u.blade = blade;
  u.bladeMat = bladeMat;
  const bladeGlow = makeHalo(0x35c6ff, 1.5);
  bladeGlow.position.y = 0.9;
  sword.add(bladeGlow);
  u.bladeGlow = bladeGlow;

  // shield bubble
  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x3399ff, emissive: 0x2288ff, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.2,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), shieldMat);
  shield.position.y = 0.35;
  shield.visible = false;
  inner.add(shield);
  u.shield = shield;
  u.shieldMat = shieldMat;

  return root;
}

// ============ RUST-DRONE (enemy) ============
export function makeDrone() {
  const g = new THREE.Group();
  const u = g.userData;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), MAT.darkMetal);
  body.castShadow = true;
  g.add(body);
  u.body = body;

  // rust patches
  const patch = new THREE.Mesh(new THREE.SphereGeometry(0.56, 10, 8, 0, 2, 0.6, 1), MAT.brown);
  g.add(patch);

  const eyeMat = emissiveMat(0xff2222, 3, 0x220505);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), eyeMat);
  eye.position.set(0, 0.05, 0.48);
  g.add(eye);
  u.eye = eye; u.eyeMat = eyeMat;
  const eyeHalo = makeHalo(0xff3333, 0.55);
  eyeHalo.position.copy(eye.position);
  g.add(eyeHalo);
  u.eyeHalo = eyeHalo;

  const ringMat = new THREE.MeshStandardMaterial({ color: 0x6b7684, roughness: 0.3, metalness: 0.9 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.045, 8, 32), ringMat);
  ring1.rotation.x = Math.PI / 2;
  g.add(ring1);
  u.ring1 = ring1;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 8, 32), ringMat);
  ring2.rotation.x = Math.PI / 2.4;
  g.add(ring2);
  u.ring2 = ring2;
  return g;
}

// ============ NEXUS CORE ============
export function makeCore() {
  const g = new THREE.Group();
  const u = g.userData;
  const mat = emissiveMat(0xffc832, 2.4, 0x332200);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), mat);
  crystal.scale.y = 1.5;
  g.add(crystal);
  u.crystal = crystal; u.mat = mat;
  const halo = makeHalo(0xffc832, 2.6);
  g.add(halo);
  u.halo = halo;
  const light = new THREE.PointLight(0xffb830, 8, 14, 1.8);
  g.add(light);
  u.light = light;
  return g;
}

// ============ PORTAL ============
export function makePortal() {
  const g = new THREE.Group();
  const u = g.userData;
  const rMat1 = emissiveMat(0x29e6ff, 2.5, 0x073040);
  const rMat2 = emissiveMat(0xb866ff, 2.5, 0x2a0a40);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.14, 12, 48), rMat1);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.1, 12, 48), rMat2);
  g.add(ring1, ring2);
  u.ring1 = ring1; u.ring2 = ring2;

  const discMat = new THREE.MeshStandardMaterial({
    color: 0x0a1030, emissive: 0x3355ff, emissiveIntensity: 1.5,
    transparent: true, opacity: 0.75, side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.8, 40), discMat);
  g.add(disc);
  u.disc = disc; u.discMat = discMat;

  const halo = makeHalo(0x66aaff, 6);
  g.add(halo);
  const light = new THREE.PointLight(0x55aaff, 10, 22, 1.8);
  g.add(light);
  u.light = light;

  // base pedestal
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 0.5, 8), MAT.gunmetal);
  base.position.y = -2.6;
  g.add(base);
  return g;
}

// ============ ISLANDS & TERRAIN ============
export function makeIsland(radius) {
  const g = new THREE.Group();
  // walkable grass top
  const topGeo = new THREE.CylinderGeometry(radius, radius * 0.88, 1.4, 22, 2);
  jitterGeometry(topGeo, radius * 0.09);
  const top = new THREE.Mesh(topGeo, MAT.grass);
  top.receiveShadow = true;
  top.castShadow = true;
  g.add(top);

  // rocky underside
  const underGeo = new THREE.ConeGeometry(radius * 0.9, radius * 1.7, 9, 3);
  jitterGeometry(underGeo, radius * 0.13);
  const under = new THREE.Mesh(underGeo, MAT.rock);
  under.rotation.x = Math.PI;
  under.position.y = -radius * 0.85 - 0.5;
  under.castShadow = true;
  g.add(under);

  // decorations: crystals + grass tufts + rocks
  const deco = Math.floor(radius * 1.2);
  for (let i = 0; i < deco; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius * 0.75;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const kind = Math.random();
    if (kind < 0.3) {
      const cr = new THREE.Mesh(new THREE.ConeGeometry(0.16 + Math.random() * 0.14, 0.6 + Math.random() * 0.7, 5),
        emissiveMat(Math.random() < 0.5 ? 0x29e6ff : 0xb866ff, 1.2, 0x102030));
      cr.position.set(x, 0.85, z);
      cr.rotation.z = (Math.random() - 0.5) * 0.4;
      g.add(cr);
    } else if (kind < 0.7) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4),
        new THREE.MeshStandardMaterial({ color: 0x7ee06a, roughness: 1, flatShading: true }));
      tuft.position.set(x, 0.85, z);
      g.add(tuft);
    } else {
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.25, 0), MAT.rock);
      rk.position.set(x, 0.78, z);
      rk.rotation.set(Math.random(), Math.random(), Math.random());
      rk.castShadow = true;
      g.add(rk);
    }
  }
  return { group: g, top };
}

export function makeBridge(length, width = 3) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(width, 0.8, length, 2, 1, Math.max(2, Math.floor(length / 3)));
  jitterGeometry(geo, 0.12);
  const top = new THREE.Mesh(geo, MAT.obsidian);
  top.receiveShadow = true; top.castShadow = true;
  g.add(top);
  // glowing crack strips
  const strips = Math.floor(length / 4);
  for (let i = 0; i < strips; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 1.4 + Math.random()),
      emissiveMat(0xff6a1a, 1.8, 0x301004));
    s.position.set((Math.random() - 0.5) * width * 0.7, 0.42, -length / 2 + (i + 0.5) * (length / strips));
    s.rotation.y = (Math.random() - 0.5) * 0.8;
    g.add(s);
  }
  return { group: g, top };
}

export function makePlatform(radius, lava = false) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius, radius * 0.9, 1.2, 24, 2);
  jitterGeometry(geo, radius * 0.06);
  const top = new THREE.Mesh(geo, lava ? MAT.obsidian : MAT.grass);
  top.receiveShadow = true; top.castShadow = true;
  g.add(top);
  if (lava) {
    // glowing rim cracks
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 1.6), emissiveMat(0xff6a1a, 1.6, 0x301004));
      s.position.set(Math.cos(a) * radius * 0.7, 0.62, Math.sin(a) * radius * 0.7);
      s.rotation.y = a + Math.PI / 2 + (Math.random() - 0.5);
      g.add(s);
    }
    // obsidian pillars around edge
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 2.5 + Math.random() * 2, 6), MAT.obsidian);
      p.position.set(Math.cos(a) * radius * 0.85, 1.5, Math.sin(a) * radius * 0.85);
      p.castShadow = true;
      g.add(p);
    }
  }
  return { group: g, top };
}

export function makeLava(size) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x881500, emissive: 0xff4400, emissiveIntensity: 1.1, roughness: 0.7,
  });
  const geo = new THREE.PlaneGeometry(size, size, 32, 32);
  jitterGeometry(geo, 1.2, true);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.userData.mat = mat;
  return m;
}

// ============ SKY ============
export function makeSkyDome(topColor, bottomColor) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(topColor) },
      bottom: { value: new THREE.Color(bottomColor) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), mat);
  return dome;
}

export function makeCloud() {
  const g = new THREE.Group();
  const n = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const r = 2 + Math.random() * 3.5;
    const p = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), MAT.cloud);
    p.position.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 6);
    p.scale.y = 0.55;
    g.add(p);
  }
  return g;
}

export function makeRockSpire(h) {
  const geo = new THREE.ConeGeometry(h * 0.22, h, 7, 3);
  jitterGeometry(geo, h * 0.06);
  const m = new THREE.Mesh(geo, MAT.rock);
  return m;
}

// ============ TĒTIS-BOT ============
export function makeTetis() {
  const g = new THREE.Group();
  const u = g.userData;

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.45, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 1.2, 8, 20), bodyMat);
  body.scale.set(1.15, 1, 1);
  body.position.y = 2.2;
  body.castShadow = true;
  g.add(body);
  u.body = body;

  // blue chest plate
  const plate = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 0.7, 6, 16), new THREE.MeshStandardMaterial({ color: 0x3a5a8a, roughness: 0.35, metalness: 0.8 }));
  plate.scale.set(1, 0.9, 0.6);
  plate.position.set(0, 2.1, 0.75);
  g.add(plate);

  // head
  const head = new THREE.Group();
  head.position.y = 4.35;
  g.add(head);
  u.head = head;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.25, 1.4), MAT.gunmetal);
  skull.castShadow = true;
  head.add(skull);

  // eyes (red hypnotized → green freed)
  const eyeMat = emissiveMat(0xff2222, 3, 0x220505);
  u.eyeMat = eyeMat;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), eyeMat);
  eyeL.position.set(-0.38, 0.12, 0.72);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.38;
  head.add(eyeL, eyeR);

  // thick eyebrows
  const browMat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.7 });
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), browMat);
  browL.position.set(-0.38, 0.42, 0.72);
  browL.rotation.z = 0.2;
  const browR = browL.clone();
  browR.position.x = 0.38; browR.rotation.z = -0.2;
  head.add(browL, browR);

  // mustache bar
  const mus = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.18, 0.15), browMat);
  mus.position.set(0, -0.25, 0.72);
  head.add(mus);

  // arms
  const armMat = bodyMat;
  const armL = new THREE.Group(); armL.position.set(-1.85, 2.9, 0); g.add(armL);
  const armR = new THREE.Group(); armR.position.set(1.85, 2.9, 0); g.add(armR);
  u.armL = armL; u.armR = armR;
  for (const [arm, side] of [[armL, -1], [armR, 1]]) {
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.3, 6, 12), armMat);
    seg.position.y = -0.8;
    seg.castShadow = true;
    arm.add(seg);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), MAT.gunmetal);
    hand.position.y = -1.75;
    arm.add(hand);
    arm.userData.hand = hand;
  }

  // coffee mug in left hand
  const mug = new THREE.Group();
  const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xd8484f, roughness: 0.4 }));
  mug.add(mugBody);
  const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 14), new THREE.MeshStandardMaterial({ color: 0xd8484f, roughness: 0.4 }));
  mugHandle.position.x = 0.3;
  mug.add(mugHandle);
  mug.position.set(0, -1.75, 0.5);
  armL.add(mug);

  // shoulder slipper launcher
  const launcher = new THREE.Group();
  launcher.position.set(1.2, 3.9, 0);
  g.add(launcher);
  u.launcher = launcher;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.5, 10), MAT.darkMetal);
  tube.rotation.x = -Math.PI / 3;
  tube.position.y = 0.3;
  launcher.add(tube);

  // big stompy feet
  const footMat = new THREE.MeshStandardMaterial({ color: 0x33404f, roughness: 0.5, metalness: 0.7 });
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 1.5), footMat);
  footL.position.set(-0.75, 0.28, 0.15);
  footL.castShadow = true;
  const footR = footL.clone(); footR.position.x = 0.75;
  g.add(footL, footR);
  u.footL = footL; u.footR = footR;

  return g;
}

// ============ MAMMA-BOT ============
export function makeMamma() {
  const g = new THREE.Group();
  const u = g.userData;

  // hover-skirt cone
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.2, 20, 1, true), MAT.roseGold);
  skirt.position.y = 1.5;
  skirt.castShadow = true;
  g.add(skirt);
  u.skirt = skirt;
  const skirtGlow = makeHalo(0xff9a7a, 2.2);
  skirtGlow.position.y = 0.35;
  g.add(skirtGlow);

  // body
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 1.0, 8, 18), MAT.white);
  body.position.y = 3.2;
  body.castShadow = true;
  g.add(body);
  u.body = body;

  // head
  const head = new THREE.Group();
  head.position.y = 4.7;
  g.add(head);
  u.head = head;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 16), MAT.white);
  skull.castShadow = true;
  head.add(skull);

  const eyeMat = emissiveMat(0xff2222, 3, 0x220505);
  u.eyeMat = eyeMat;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), eyeMat);
  eyeL.position.set(-0.26, 0.1, 0.62);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.26;
  head.add(eyeL, eyeR);

  // eyelash plates
  const lashMat = new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.6 });
  const lashL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), lashMat);
  lashL.position.set(-0.26, 0.28, 0.66); lashL.rotation.z = 0.25;
  const lashR = lashL.clone(); lashR.position.x = 0.26; lashR.rotation.z = -0.25;
  head.add(lashL, lashR);

  // antenna "hair" swirl
  const swirl = new THREE.Mesh(new THREE.TorusKnotGeometry(0.22, 0.06, 40, 8, 2, 3), MAT.roseGold);
  swirl.position.y = 0.85;
  head.add(swirl);
  u.swirl = swirl;

  // vacuum-cannon arm (right)
  const vac = new THREE.Group();
  vac.position.set(1.0, 3.4, 0);
  g.add(vac);
  u.vacArm = vac;
  const vacBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.3, 10), MAT.roseGold);
  vacBody.rotation.z = -Math.PI / 2.4;
  vacBody.position.set(0.5, -0.2, 0);
  vac.add(vacBody);
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 12, 1, true), MAT.gunmetal);
  nozzle.rotation.z = -Math.PI / 2 - Math.PI / 12;
  nozzle.position.set(1.25, -0.5, 0);
  vac.add(nozzle);
  u.nozzle = nozzle;

  // vacuum beam cone (visible during attack) — long translucent cone along -Y of cone geo
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe08a, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.4, 14, 20, 1, true), beamMat);
  beam.visible = false;
  g.add(beam);
  u.beam = beam; u.beamMat = beamMat;

  // basket (left)
  const basket = new THREE.Group();
  basket.position.set(-1.1, 3.1, 0);
  g.add(basket);
  u.basket = basket;
  const bMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.42, 10, 1, true), MAT.brown);
  basket.add(bMesh);
  // broccoli peeking out
  for (let i = 0; i < 3; i++) {
    const br = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2f7a2a, roughness: 1, flatShading: true }));
    br.position.set((i - 1) * 0.18, 0.22, 0);
    basket.add(br);
  }
  return g;
}

// ============ GIGA-DRILL BOSS ============
export function makeGigaDrill() {
  const g = new THREE.Group();
  const u = g.userData;

  // main capsule body (horizontal)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 3.2, 10, 20), MAT.darkMetal);
  body.rotation.z = Math.PI / 2;
  body.rotation.y = Math.PI / 2;
  body.position.y = 4.2;
  body.castShadow = true;
  g.add(body);
  u.body = body;

  // armor plates
  for (let i = -1; i <= 1; i++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 0.5, 12), MAT.gunmetal);
    plate.rotation.x = Math.PI / 2;
    plate.position.set(0, 4.2, i * 1.4);
    g.add(plate);
  }

  // spinning gold drill at front (+Z)
  const drill = new THREE.Group();
  drill.position.set(0, 4.2, 3.6);
  g.add(drill);
  u.drill = drill;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.4, 20), MAT.gold);
  cone.rotation.x = Math.PI / 2;
  cone.position.z = 1.7;
  cone.castShadow = true;
  drill.add(cone);
  // spiral ridges
  for (let i = 0; i < 3; i++) {
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(1.1 - i * 0.33, 0.09, 8, 24), MAT.brown);
    ridge.position.z = 0.8 + i * 0.85;
    drill.add(ridge);
  }

  // red eye cluster
  const eyeMat = emissiveMat(0xff2222, 3.2, 0x220505);
  u.eyeMat = eyeMat;
  u.eyes = [];
  const eyePos = [[-0.8, 5.4, 2.2], [0.8, 5.4, 2.2], [0, 5.9, 2.0]];
  for (const p of eyePos) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), eyeMat);
    e.position.set(...p);
    g.add(e);
    u.eyes.push(e);
    const h = makeHalo(0xff3333, 0.9);
    h.position.set(...p);
    g.add(h);
  }

  // legs — 6 articulated spider legs
  u.legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const zOff = ((i % 3) - 1) * 2.1;
    const hip = new THREE.Group();
    hip.position.set(side * 1.9, 4.4, zOff);
    g.add(hip);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 3.2, 8), MAT.gunmetal);
    upper.rotation.z = side * (Math.PI / 3);
    upper.position.set(side * 1.35, -0.3, 0);
    upper.castShadow = true;
    hip.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 3.4, 8), MAT.darkMetal);
    lower.rotation.z = side * (-Math.PI / 10);
    lower.position.set(side * 2.9, -1.9, 0);
    lower.castShadow = true;
    hip.add(lower);
    const foot = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 8), MAT.gold);
    foot.rotation.x = Math.PI;
    foot.position.set(side * 3.2, -3.6, 0);
    hip.add(foot);
    u.legs.push(hip);
  }

  // WEAK POINT — energy core on the back top
  const wkMat = emissiveMat(0x29e6ff, 3.2, 0x073040);
  const weak = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), wkMat);
  weak.position.set(0, 6.4, -1.2);
  g.add(weak);
  u.weak = weak; u.weakMat = wkMat;
  const weakHalo = makeHalo(0x29e6ff, 3.4);
  weakHalo.position.copy(weak.position);
  g.add(weakHalo);
  u.weakHalo = weakHalo;
  // shell doors
  const doorMat = MAT.gunmetal;
  const doorL = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8, 0, Math.PI), doorMat);
  doorL.position.copy(weak.position);
  doorL.rotation.y = Math.PI / 2;
  const doorR = doorL.clone();
  doorR.rotation.y = -Math.PI / 2;
  g.add(doorL, doorR);
  u.doorL = doorL; u.doorR = doorR;

  return g;
}

// ============ PROJECTILES & PICKUPS ============
export function makeLaserBall(color = 0xff3355) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), emissiveMat(color, 3, 0x220510));
  g.add(m);
  const h = makeHalo(color, 1.1);
  g.add(h);
  g.userData.mesh = m;
  return g;
}

export function makeSlipper() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.9 });
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 1.2), mat);
  g.add(sole);
  const toe = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xc46a3f, roughness: 0.9 }));
  toe.position.set(0, 0.09, 0.35);
  toe.scale.set(0.9, 0.8, 1.3);
  g.add(toe);
  return g;
}

export function makeBroccoli() {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x9ac96a, roughness: 1 }));
  g.add(stem);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x2f7a2a, roughness: 1, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.06, 7, 5), headMat);
    b.position.set((Math.random() - 0.5) * 0.2, 0.3 + Math.random() * 0.1, (Math.random() - 0.5) * 0.2);
    g.add(b);
  }
  return g;
}

export function makeBubble() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xbfe8ff, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.3,
    emissive: 0x88ccff, emissiveIntensity: 0.4, side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 14), mat);
  m.userData.mat = mat;
  return m;
}

export function makePancake() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9962f, roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.42 - i * 0.03, 0.44 - i * 0.03, 0.1, 14), mat);
    p.position.y = i * 0.11;
    g.add(p);
  }
  const butter = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xffe9a0, roughness: 0.5 }));
  butter.position.y = 0.38;
  g.add(butter);
  const halo = makeHalo(0xffd97a, 1.4);
  halo.position.y = 0.2;
  g.add(halo);
  return g;
}

export function makeHealthOrb() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), emissiveMat(0x4dff88, 2.4, 0x0a2a12));
  g.add(m);
  const h = makeHalo(0x4dff88, 1.2);
  g.add(h);
  return g;
}

export function makeObjectiveArrow() {
  const g = new THREE.Group();
  const mat = emissiveMat(0xffc832, 2, 0x332200);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10), mat);
  cone.rotation.x = Math.PI / 2; // point along +Z
  g.add(cone);
  g.userData.mat = mat;
  return g;
}
