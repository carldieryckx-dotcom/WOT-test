import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// Labels are painted onto canvases, so wait (briefly) for the display font.
await Promise.race([
  Promise.all([document.fonts.load('100px Bangers'), document.fonts.load('600 40px Inter')]),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => {});

// Typeface for the standing 3D letters: the same comic display face (Bangers) as the painted labels
const letterFont = await new TTFLoader()
  .loadAsync('fonts/Bangers-Regular.ttf')
  .then((json) => new Font(json))
  .catch(() => null);

/* ------------------------------------------------------------------ *
 *  Content: the stops of Marketingland, in the "proper" order
 * ------------------------------------------------------------------ */
const PHASES = {
  diagnosis: { label: 'Diagnosis', color: '#2f86c0' },
  strategy: { label: 'Strategy', color: '#7b4fc4' },
  execution: { label: 'Execution', color: '#e07a1f' },
  brand: { label: 'Brand', color: '#c99a10' },
};

const STOPS = [
  {
    id: 'orientation', name: 'Market Orientation', phase: 'diagnosis', pos: [-8, -59],
    desc: 'The hilltop where proper marketers start. Before anything else, accept that the market — not your product, your opinion or your boss — decides what matters.',
    points: [
      'Start from the customer’s problem, not from what you happen to sell.',
      'Assume you are not the customer: your own taste is a poor guide.',
      'Commit to learning before deciding.',
    ],
  },
  {
    id: 'research', name: 'Market Research', phase: 'diagnosis', pos: [18, -57],
    desc: 'Three districts of evidence. Combine them to understand who buys, why they buy and how many of them there are.',
    points: [
      '<b>Ethnography</b> — watch people in their real context; see what they do, not what they say.',
      '<b>Qualitative research</b> — interviews and groups to uncover motivations, language and needs.',
      '<b>Quantitative research</b> — surveys and data to size, validate and prioritise what you found.',
    ],
  },
  {
    id: 'segmentation', name: 'Market Segmentation', phase: 'strategy', pos: [-28, -37],
    desc: 'Cross the bridge into Strategy. Split the market into groups of people whose needs and behaviour genuinely differ.',
    points: [
      'Segment on needs and behaviour, not just demographics.',
      'Good segments are measurable, substantial, reachable and distinct.',
      'Use the research you gathered in Diagnosis — not guesses.',
    ],
  },
  {
    id: 'targeting', name: 'Targeting', phase: 'strategy', pos: [-11, -15],
    desc: 'Choose which segments you will serve — and, just as importantly, which you will ignore.',
    points: [
      'Weigh segment attractiveness against your ability to win there.',
      'Focus beats spreading thin: fewer targets, served better.',
      'Define a primary target clearly enough that everyone can picture them.',
    ],
  },
  {
    id: 'positioning', name: 'Positioning', phase: 'strategy', pos: [20, -13],
    desc: 'Decide the place you want to own in your target’s mind. The road here loops past three neighbourhoods — the 3 Cs.',
    points: [
      '<b>Customer</b> — what does the target value and struggle with?',
      '<b>Company</b> — what can you credibly deliver better than anyone?',
      '<b>Competition</b> — where are rivals strong, and where is the open ground?',
    ],
  },
  {
    id: 'price', name: 'Price', phase: 'execution', pos: [-34, 12],
    desc: 'Over the red bridge into Execution: the 4 Ps. Price expresses your positioning and captures the value you create.',
    points: [
      'Price from perceived customer value, not just cost-plus.',
      'Your price signals quality and position — make it consistent.',
      'Consider discounts, bundles and price architecture deliberately.',
    ],
  },
  {
    id: 'place', name: 'Place', phase: 'execution', pos: [-39, 33],
    desc: 'Be where your target customers shop, browse and decide.',
    points: [
      'Choose channels based on how the target actually buys.',
      'Availability and convenience often beat clever advertising.',
      'Online, retail, direct, partners: each changes margins and control.',
    ],
  },
  {
    id: 'product', name: 'Product', phase: 'execution', pos: [-1, 31],
    desc: 'Build what the strategy calls for — start small, learn, then add value.',
    points: [
      '<b>MVP</b> — Minimum Viable Product: the smallest thing that tests your proposition with real customers.',
      '<b>MVA</b> — Minimum Viable Audience: the smallest group you need to win to prove it works.',
      'Iterate using feedback from your target segment.',
    ],
  },
  {
    id: 'promotion', name: 'Promotion', phase: 'execution', pos: [34, 33],
    desc: 'The bright, noisy theme park of ads, social and campaigns. Most marketers start here — which is why so much of it doesn’t work.',
    points: [
      'Promotion is the last P, not the first step.',
      'Message, media and creative should all follow from the positioning.',
      'Measure effect on the target segment, not just reach and likes.',
    ],
  },
  {
    id: 'brand', name: 'Brand Beach', phase: 'brand', pos: [-10, 60],
    desc: 'Where many businesses start: logos, colours and taglines. A brand is the result of consistent diagnosis, strategy and execution — not a shortcut around them.',
    points: [
      'Brand is what customers think and feel, built over time.',
      'A logo is an asset, not a strategy.',
      'Arrive here by the road, not by parachute.',
    ],
  },
];

/* ------------------------------------------------------------------ *
 *  Basic setup
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#cdeafc', 220, 520);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 1500);
const OVERVIEW = { pos: new THREE.Vector3(-8, 78, 92), target: new THREE.Vector3(-6, 0, 2) };
camera.position.set(0, 230, 260);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.38;
controls.minDistance = 12;
controls.maxDistance = 260;
controls.target.copy(OVERVIEW.target);

/* Sky */
{
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color('#5fb0ea') }, bottom: { value: new THREE.Color('#e6f6ff') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.6+0.1,0.,1.); gl_FragColor = vec4(mix(bottom, top, h),1.); }',
  });
  scene.add(new THREE.Mesh(geo, mat));
}

/* Lights */
scene.add(new THREE.HemisphereLight('#e4f4ff', '#4f8a33', 1.15));
const sunLight = new THREE.DirectionalLight('#fff1d6', 2.3);
sunLight.position.set(70, 110, -60);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 400 });
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight);

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */
const FONT = 'Bangers, Impact, "Arial Black", sans-serif';
const rand = mulberry32(7);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

function textCanvas(text, opts = {}) {
  const {
    size = 160, color = '#1f5d1a', stroke = null, strokeWidth = 0, bg = null, border = null,
    padX = 30, padY = 20, radius = 24, font = FONT, lineHeight = 1.0,
  } = opts;
  const lines = String(text).split('\n');
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${size}px ${font}`;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2 + strokeWidth * 2);
  const h = Math.ceil(lines.length * size * lineHeight + padY * 2 + strokeWidth * 2);
  c.width = w; c.height = h;
  ctx.font = `${size}px ${font}`;
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, w, h, radius); ctx.fill();
    if (border) {
      ctx.lineWidth = Math.max(6, size * 0.08);
      ctx.strokeStyle = border;
      roundRect(ctx, ctx.lineWidth * 1.5, ctx.lineWidth * 1.5, w - ctx.lineWidth * 3, h - ctx.lineWidth * 3, radius * 0.7); ctx.stroke();
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const y = padY + strokeWidth + size * lineHeight * (i + 0.5) + size * 0.04;
    if (stroke) { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(line, w / 2, y); }
    ctx.fillStyle = color;
    ctx.fillText(line, w / 2, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { tex, aspect: w / h, canvas: c };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Wobbly island outline (shape coordinates are x, -z) */
function blobPoints(cx, cz, rx, rz, seed, n = 90, wobble = 0.1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = 1 + wobble * (0.55 * Math.sin(3 * t + seed) + 0.3 * Math.sin(5 * t + seed * 2.1) + 0.15 * Math.sin(8 * t + seed * 3.7));
    pts.push(new THREE.Vector2(cx + Math.cos(t) * rx * r, -(cz + Math.sin(t) * rz * r)));
  }
  return pts;
}

/* ------------------------------------------------------------------ *
 *  Water
 * ------------------------------------------------------------------ */
const waterTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5db4e3';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  const r = mulberry32(3);
  for (let i = 0; i < 26; i++) {
    const x = r() * 256, y = r() * 256, l = 14 + r() * 26;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + l / 2, y - 5, x + l, y); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 70);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(1400, 1400),
  new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.35, metalness: 0.05 }),
);
water.rotation.x = -Math.PI / 2;
water.receiveShadow = true;
scene.add(water);

/* ------------------------------------------------------------------ *
 *  Islands
 * ------------------------------------------------------------------ */
const islandMeshes = [];
const sideMat = new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 1 });
function island({ cx, cz, rx, rz, top, seed, color = '#5fbf3a', side = sideMat, wobble = 0.1, bevel = 0.7, shallow = true }) {
  const pts = blobPoints(cx, cz, rx, rz, seed, 100, wobble);
  const shape = new THREE.Shape(pts);
  const depth = top + 3;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 4,
  });
  geo.rotateX(-Math.PI / 2);
  const topMat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const mesh = shadowed(new THREE.Mesh(geo, [topMat, side]), true, true);
  mesh.position.y = top - depth - bevel;
  scene.add(mesh);
  mesh.updateMatrixWorld();
  islandMeshes.push(mesh);

  if (shallow) {
    const ring = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(blobPoints(cx, cz, rx + 3.2, rz + 3.2, seed, 100, wobble))),
      new THREE.MeshBasicMaterial({ color: '#9ad9f3', transparent: true, opacity: 0.75, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    scene.add(ring);
  }
  return mesh;
}

// Diagnosis (north)
island({ cx: 12, cz: -55, rx: 33, rz: 14, top: 4.5, seed: 1.2 });
// Market Orientation hill
island({ cx: -8, cz: -59, rx: 10.5, rz: 6.8, top: 7.5, seed: 4.1, color: '#2f6a22', side: new THREE.MeshStandardMaterial({ color: '#244d18' }), bevel: 1.6, shallow: false });
// Segmentation
island({ cx: -27, cz: -35, rx: 16, rz: 10, top: 3.6, seed: 2.7 });
// Targeting + Positioning
island({ cx: 10, cz: -12, rx: 33, rz: 14, top: 3.0, seed: 5.3 });
// Price lobe
island({ cx: -36, cz: 14, rx: 14.5, rz: 16, top: 2.6, seed: 0.4 });
// Execution main island
island({ cx: -2, cz: 34, rx: 50, rz: 17, top: 2.1, seed: 3.3, wobble: 0.08 });
// Brand Beach
island({ cx: -10, cz: 60, rx: 23, rz: 8.5, top: 1.0, seed: 6.6, color: '#f0d58a', side: new THREE.MeshStandardMaterial({ color: '#c9a55a' }), bevel: 0.9 });

const raycaster = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
function groundHit(x, z) {
  raycaster.set(new THREE.Vector3(x, 80, z), DOWN);
  const hits = raycaster.intersectObjects(islandMeshes, false);
  return hits.length ? hits[0].point.y : null;
}
const groundY = (x, z) => groundHit(x, z) ?? 0;

const ROUTE = [
  [-3, -60.5], [1, -57], [8, -55], [20, -55], [32, -55.5], [38.5, -52], [31, -50], [18, -50], [6, -49.5], [-4, -47.5],
  [-13, -44], [-20, -39], [-17, -31], [-10, -25.5], [-2, -23], [8, -15], [18, -16.5], [28, -15], [31, -10], [24, -8.5],
  [10, -9], [-3, -8.5], [-13, -5], [-21, 0], [-28, 5], [-33, 12], [-34, 21], [-29, 30], [-19, 33], [-7, 33], [5, 31.5],
  [15, 33], [21, 40], [18, 47.5], [9, 52.5], [1, 57],
];
const ROAD_SAMPLES = 900;
const roadCurve = new THREE.CatmullRomCurve3(ROUTE.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const roadPts = roadCurve.getSpacedPoints(ROAD_SAMPLES);
const roadLen = roadCurve.getLength();
const ROAD_HALF = 0.95;

/* Keep things off the road: distance to the road centre line, and a nudge to clear it */
function roadDist(x, z) {
  let best = Infinity, bp = null;
  for (let i = 0; i < roadPts.length; i += 2) {
    const p = roadPts[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) { best = d; bp = p; }
  }
  return { d: Math.sqrt(best), p: bp };
}
const obstacles = [];
function clearSpot(x, z, r, margin = 0.7, name = '') {
  const need = r + ROAD_HALF + margin;
  for (let it = 0; it < 60; it++) {
    const { d, p } = roadDist(x, z);
    if (d >= need) break;
    const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz) || 1;
    x += (dx / l) * (need - d + 0.1);
    z += (dz / l) * (need - d + 0.1);
  }
  obstacles.push({ x, z, r, name });
  return [x, z];
}

/* ------------------------------------------------------------------ *
 *  Labels painted on the ground / water
 * ------------------------------------------------------------------ */
function flatLabel(text, x, z, width, { rot = 0, y = null, color = '#1d5317', opacity = 1, stroke = null, strokeWidth = 0, size = 180 } = {}) {
  const { tex, aspect } = textCanvas(text, { size, color, stroke, strokeWidth, padX: 10, padY: 10 });
  const mat = new THREE.MeshLambertMaterial({
    map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rot;
  mesh.position.set(x, (y ?? groundY(x, z)) + 0.05, z);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}

const letterPostMat = new THREE.MeshStandardMaterial({ color: '#4a4a52', roughness: 0.8 });
const letterSpots = [];
// Letter colours taken from the map: dark green on the land, ochre on the hill, brown on the beach
const LETTER_GREEN = '#1f5a17';
function hollywood(text, cx, cz, { width, maxHeight = 3, rotY = 0, color = LETTER_GREEN, water = false, tilt = -0.12, seed = 1 }) {
  const res = letterFont.data.resolution;
  const adv = (ch) => (letterFont.data.glyphs[ch] || letterFont.data.glyphs['O']).ha / res;
  const gap = 0.14;
  const natural = [...text].reduce((sum, ch) => sum + adv(ch) + gap, 0) - gap;
  const size = Math.min(maxHeight, width / natural);
  const faceMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.35 });
  const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45), roughness: 0.8 });
  const mat = [faceMat, sideMat];
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  group.rotation.y = rotY;
  scene.add(group);
  group.updateMatrixWorld();
  const r = mulberry32(seed);
  let x = (-natural * size) / 2;
  for (const ch of text) {
    const a = adv(ch) * size;
    if (ch !== ' ') {
      const geo = new TextGeometry(ch, { font: letterFont, size, height: size * 0.22, curveSegments: 5, bevelEnabled: false });
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -size * 0.08);
      const lx = x + a / 2;
      const wp = new THREE.Vector3(lx, 0, 0).applyMatrix4(group.matrixWorld);
      const gy = water ? -size * 0.08 : groundY(wp.x, wp.z) + size * 0.14;
      const m = shadowed(new THREE.Mesh(geo, mat));
      m.position.set(lx, gy + (r() - 0.5) * size * 0.08, 0);
      m.rotation.set(tilt + (r() - 0.5) * 0.08, (r() - 0.5) * 0.06, (r() - 0.5) * 0.08);
      group.add(m);
      if (!water) {
        // little scaffold posts behind each letter, like the real thing
        for (const px of [-a * 0.22, a * 0.22]) {
          const ph = size * 0.55;
          const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(size * 0.025, size * 0.025, ph, 5), letterPostMat));
          post.position.set(lx + px, gy - size * 0.14 + ph / 2, -size * 0.16);
          group.add(post);
        }
      }
      letterSpots.push({ x: wp.x, z: wp.z, r: a / 2, text, drop: water ? 0 : Math.abs(groundY(wp.x, wp.z) - groundY(cx, cz)) });
    }
    x += a + gap * size;
  }
  return group;
}

// The three phases stay painted on the water
flatLabel('DIAGNOSIS', 14, -76, 40, { rot: 0.08, y: 0.12, color: '#2f7fb4', opacity: 0.9 });
flatLabel('STRATEGY', 15, -33.5, 34, { rot: -0.12, y: 0.12, color: '#2f7fb4', opacity: 0.9 });
flatLabel('EXECUTION', 13, 9.5, 40, { rot: -0.1, y: 0.12, color: '#2f7fb4', opacity: 0.9 });

if (letterFont) {
  // Area names stand upright on the land
  hollywood('MARKET ORIENTATION', -9.5, -55.2, { width: 16, maxHeight: 2.4, rotY: 0.05, seed: 1, color: '#e1cf62' });
  hollywood('MARKET RESEARCH', 20, -45.5, { width: 24, maxHeight: 3, rotY: -0.06, seed: 2 });
  hollywood('MARKET SEGMENTATION', -29.5, -30.3, { width: 19.5, maxHeight: 3, rotY: 0.06, seed: 3 });
  hollywood('TARGETING', -12, -11.5, { width: 11, maxHeight: 2.8, rotY: 0.05, seed: 4 });
  hollywood('POSITIONING', 14, -2, { width: 24, maxHeight: 3.4, rotY: -0.05, seed: 5 });
  hollywood('PRICE', -41, 17.5, { width: 8.5, maxHeight: 2.8, rotY: 0.25, seed: 6 });
  hollywood('PLACE', -42, 28.5, { width: 9, maxHeight: 2.8, rotY: 0.2, seed: 7 });
  hollywood('PRODUCT', -3, 42, { width: 18, maxHeight: 3.4, rotY: 0.03, seed: 8 });
  hollywood('PROMOTION', 29, 43.3, { width: 13, maxHeight: 3, rotY: -0.18, seed: 9 });
  hollywood('BRAND BEACH', -10, 64.5, { width: 24, maxHeight: 3.2, rotY: -0.05, seed: 10, color: '#8a5a20' });
} else {
  // Fallback if the typeface could not load: painted labels
  flatLabel('MARKET ORIENTATION', -8, -57, 17, { rot: 0.12, color: '#e1cf62' });
  flatLabel('MARKET RESEARCH', 20, -45.5, 22, { rot: -0.1 });
  flatLabel('MARKET\nSEGMENTATION', -30, -31.5, 15, { rot: 0.1 });
  flatLabel('TARGETING', -12, -18, 13, { rot: -0.3 });
  flatLabel('POSITIONING', 14, -2.8, 24, { rot: -0.12 });
  flatLabel('PRICE', -42, 15, 10, { rot: 0.35 });
  flatLabel('PLACE', -41, 28, 11, { rot: 0.3 });
  flatLabel('PRODUCT', -3, 42, 17, { rot: 0.05 });
  flatLabel('PROMOTION', 31, 45, 19, { rot: 0.32 });
  flatLabel('BRAND BEACH', -10, 63, 27, { rot: -0.08, color: '#8a5a20' });
}

/* ------------------------------------------------------------------ *
 *  Buildings, signs and props
 * ------------------------------------------------------------------ */
function windowTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const r = mulberry32(kind * 13 + 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  if (kind === 2) {
    // glass tower stripes
    for (let x = 0; x < 64; x += 8) { ctx.fillStyle = 'rgba(20,40,90,0.35)'; ctx.fillRect(x, 0, 3, 64); }
    for (let y = 0; y < 64; y += 16) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(0, y, 64, 2); }
  } else {
    for (let y = 6; y < 64; y += 16) {
      for (let x = 6; x < 64; x += 16) {
        ctx.fillStyle = r() < 0.18 ? '#fff4b0' : kind === 1 ? '#3a3550' : '#2e3550';
        ctx.fillRect(x, y, 9, 10);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
const WIN = [windowTexture(0), windowTexture(1), windowTexture(2)];

function building(x, z, { w = 4, d = 4, h = 8, color = '#8d88ab', kind = 0, roof = null, roofColor = '#b8312f', rotY = 0 } = {}) {
  [x, z] = clearSpot(x, z, Math.hypot(w, d) / 2, 0.7, 'building');
  const y0 = groundY(x, z);
  const g = new THREE.Group();
  const tex = WIN[kind].clone();
  tex.repeat.set(Math.max(1, Math.round(Math.max(w, d) / 2)), Math.max(1, Math.round(h / 2)));
  tex.needsUpdate = true;
  const sideM = new THREE.MeshStandardMaterial({ color, map: tex, roughness: kind === 2 ? 0.25 : 0.8, metalness: kind === 2 ? 0.35 : 0 });
  const topM = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.9 });
  const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideM, sideM, topM, topM, sideM, sideM]));
  box.position.y = h / 2;
  g.add(box);
  if (roof === 'gable') {
    const r = shadowed(new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, h * 0.35 + 1, 4), new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7 })));
    r.rotation.y = Math.PI / 4;
    r.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
    r.position.y = h + (h * 0.35 + 1) / 2;
    g.add(r);
  } else if (roof === 'flat') {
    const r = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1, d * 0.4), topM));
    r.position.y = h + 0.5;
    g.add(r);
  } else if (roof === 'red') {
    const r = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.6, d + 0.3), new THREE.MeshStandardMaterial({ color: roofColor })));
    r.position.y = h + 0.3;
    g.add(r);
  } else if (roof === 'spire') {
    const r = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0, Math.min(w, d) * 0.45, h * 0.25, 4), topM));
    r.rotation.y = Math.PI / 4;
    r.position.y = h + h * 0.125;
    g.add(r);
  }
  g.position.set(x, y0, z);
  g.rotation.y = rotY;
  scene.add(g);
  return g;
}

function roundTower(x, z, { r = 2.5, h = 7, color = '#9c9cb8' } = {}) {
  [x, z] = clearSpot(x, z, r, 0.7, 'tower');
  const y0 = groundY(x, z);
  const tex = WIN[0].clone();
  tex.repeat.set(6, Math.round(h / 2));
  tex.needsUpdate = true;
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), new THREE.MeshStandardMaterial({ color, map: tex })));
  m.position.set(x, y0 + h / 2, z);
  scene.add(m);
  const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, 0.8, 24), new THREE.MeshStandardMaterial({ color: '#5d5d78' })));
  cap.position.set(x, y0 + h + 0.4, z);
  scene.add(cap);
}

const postMat = new THREE.MeshStandardMaterial({ color: '#6b6f75', metalness: 0.4, roughness: 0.5 });
function sign(text, x, z, { width = 5, rotY = 0, height = 2.2 } = {}) {
  [x, z] = clearSpot(x, z, width * 0.4, 0.3, 'sign');
  const y0 = groundY(x, z);
  const { tex, aspect } = textCanvas(text, { size: 90, color: '#ffffff', bg: '#16704a', border: '#ffffff', padX: 34, padY: 22, radius: 18 });
  const h = width / aspect;
  const g = new THREE.Group();
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const back = new THREE.MeshStandardMaterial({ color: '#16704a' });
  const panel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(width, h, 0.18), [back, back, back, back, front, back]));
  panel.position.y = height + h / 2;
  g.add(panel);
  for (const sx of [-width * 0.35, width * 0.35]) {
    const p = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, height + h * 0.5, 6), postMat));
    p.position.set(sx, (height + h * 0.5) / 2, -0.12);
    g.add(p);
  }
  g.position.set(x, y0, z);
  g.rotation.y = rotY;
  scene.add(g);
  return g;
}

const leafMat = new THREE.MeshStandardMaterial({ color: '#2f7d2a', roughness: 0.9 });
const darkLeafMat = new THREE.MeshStandardMaterial({ color: '#1f5a1f', roughness: 0.9 });
const trunkMat = new THREE.MeshStandardMaterial({ color: '#6e4a26' });
function pine(x, z, s = 1, dark = false) {
  [x, z] = clearSpot(x, z, 0.8 * s, 0.3, 'plant');
  const y0 = groundY(x, z);
  const g = new THREE.Group();
  const trunk = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.8 * s, 6), trunkMat));
  trunk.position.y = 0.4 * s;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const c = shadowed(new THREE.Mesh(new THREE.ConeGeometry((0.9 - i * 0.22) * s, 1.3 * s, 8), dark ? darkLeafMat : leafMat));
    c.position.y = (1.1 + i * 0.6) * s;
    g.add(c);
  }
  g.position.set(x, y0, z);
  scene.add(g);
}
function bush(x, z, s = 1) {
  [x, z] = clearSpot(x, z, 0.8 * s, 0.3, 'plant');
  const y0 = groundY(x, z);
  const m = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 * s, 1), new THREE.MeshStandardMaterial({ color: '#4caf34', flatShading: true })));
  m.position.set(x, y0 + 0.5 * s, z);
  m.scale.y = 0.75;
  scene.add(m);
}
const palmLeafMat = new THREE.MeshStandardMaterial({ color: '#2e8b3a', side: THREE.DoubleSide, flatShading: true });
function palm(x, z, s = 1, lean = 0.2) {
  [x, z] = clearSpot(x, z, 0.8 * s, 0.3, 'plant');
  const y0 = groundY(x, z);
  const g = new THREE.Group();
  const h = 3.2 * s;
  const trunk = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, h, 6), new THREE.MeshStandardMaterial({ color: '#8b6436' })));
  trunk.position.y = h / 2;
  g.add(trunk);
  const top = new THREE.Group();
  top.position.y = h;
  for (let i = 0; i < 7; i++) {
    const leaf = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.35 * s, 2.0 * s, 3), palmLeafMat));
    leaf.rotation.z = Math.PI / 2 + 0.35;
    leaf.position.x = 0.9 * s;
    const holder = new THREE.Group();
    holder.rotation.y = (i / 7) * Math.PI * 2;
    holder.add(leaf);
    top.add(holder);
  }
  g.add(top);
  g.rotation.z = lean;
  g.rotation.y = rand() * Math.PI * 2;
  g.position.set(x, y0, z);
  scene.add(g);
}

/* --- Diagnosis --- */
// Forest on the Market Orientation hill
for (let i = 0; i < 26; i++) {
  const a = rand() * Math.PI * 2, r = Math.sqrt(rand());
  const x = -8 + Math.cos(a) * 8.5 * r, z = -60.5 + Math.sin(a) * 4.5 * r;
  if (z > -57.5) continue; // keep the letters on the hill clear
  pine(x, z, 0.9 + rand() * 0.5, true);
}
building(4, -63, { w: 5, d: 4, h: 6, color: '#8e8aa8', roof: 'flat' });
building(9, -64, { w: 3.5, d: 3.5, h: 4.5, color: '#a19077' });
building(19, -64, { w: 5, d: 4.5, h: 8, color: '#7f7a9e', roof: 'flat' });
building(24, -65, { w: 3.5, d: 3.5, h: 5.5, color: '#9a95b5' });
building(33, -62, { w: 5, d: 5, h: 9, color: '#86819f', roof: 'flat' });
building(38.5, -59, { w: 3.5, d: 4, h: 6, color: '#7c7696' });
building(28, -66, { w: 3, d: 3, h: 10, color: '#8f8aa9', roof: 'spire' });
sign('Ethnography', 6, -58.4, { width: 5.5 });
sign('Qualitative\nresearch', 21, -58.8, { width: 4.8 });
sign('Quantitative\nresearch', 34, -57, { width: 5 });
bush(41, -55); bush(-2, -49); pine(42, -60, 1.1);

/* --- Strategy --- */
building(-34, -40, { w: 4.5, d: 4, h: 7, color: '#857f9c', roof: 'flat' });
building(-29, -42, { w: 4, d: 3.5, h: 9, color: '#a28d70' });
building(-36, -35, { w: 3, d: 3, h: 5, color: '#7c7798' });
bush(-20, -42); bush(-40, -36, 0.8);

building(-4, -17, { w: 5, d: 4, h: 11, color: '#807b9c', roof: 'flat' });
building(1.5, -13, { w: 3, d: 3, h: 7, color: '#958fb0' });
bush(-20, -16); bush(-6, -6);

building(4, -21, { w: 4.5, d: 4, h: 7, color: '#b39b7c', roof: 'red' });
sign('Customer', 7, -17.5, { width: 4.8 });
building(32, -22, { w: 4.5, d: 3.5, h: 5, color: '#c9b49a', roof: 'gable' });
building(37, -21, { w: 3.5, d: 3.5, h: 6, color: '#bca88f', roof: 'gable' });
sign('Company', 34, -17.5, { width: 4.6 });
building(37, -7, { w: 4, d: 3.5, h: 4.5, color: '#9590ad', roof: 'flat' });
building(41, -9, { w: 3, d: 3, h: 4, color: '#c2ab90', roof: 'gable' });
sign('Competition', 36, -3.5, { width: 5.2 });
bush(22, -21); bush(12, -24, 0.9); pine(26, -24, 1.1);

/* --- Execution --- */
// Price: tall towers and a lattice tower
building(-45, 6, { w: 4, d: 4, h: 13, color: '#5d86c8', kind: 2, roof: 'flat' });
building(-40, 1.5, { w: 4.5, d: 4, h: 9, color: '#7c95c0', kind: 2 });
building(-46, 13, { w: 4, d: 3.5, h: 7, color: '#6f7fa8', kind: 2 });
building(-27, 22, { w: 4.5, d: 4, h: 14, color: '#827c9d', roof: 'spire' });
{
  // Lattice tower (a nod to the map's Paris-style tower)
  const [x, z] = clearSpot(-27, 11, 2.4, 0.7, 'lattice');
  const y0 = groundY(x, z);
  const mat = new THREE.MeshStandardMaterial({ color: '#a0522d', roughness: 0.6, metalness: 0.2 });
  const g = new THREE.Group();
  const H = 15;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, H, 6), mat);
    const base = new THREE.Vector3(sx * 2.2, 0, sz * 2.2);
    const tip = new THREE.Vector3(sx * 0.15, H, sz * 0.15);
    leg.position.copy(base).add(tip).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(base).normalize());
    g.add(shadowed(leg));
  }
  for (const [y, s] of [[4, 1.6], [8.5, 0.95]]) {
    const p = shadowed(new THREE.Mesh(new THREE.BoxGeometry(s * 2.2, 0.35, s * 2.2), mat));
    p.position.y = y;
    g.add(p);
  }
  const spire = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.15, 3, 6), mat));
  spire.position.y = H + 1.4;
  g.add(spire);
  g.position.set(x, y0, z);
  scene.add(g);
}
// Place: little market stalls
const awningColors = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6'];
for (let i = 0; i < 6; i++) {
  const [x, z] = clearSpot(-47 + (i % 3) * 4, 34 + Math.floor(i / 3) * 4, 1.7, 0.5, 'stall');
  const y0 = groundY(x, z);
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 1.8), new THREE.MeshStandardMaterial({ color: '#d9c4a0' })));
  base.position.set(x, y0 + 0.6, z);
  const awn = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 2.2), new THREE.MeshStandardMaterial({ color: awningColors[i % 5] })));
  awn.position.set(x, y0 + 2.1, z + 0.2);
  awn.rotation.x = 0.2;
  scene.add(base, awn);
  for (const sx of [-1.3, 1.3]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 5), postMat);
    p.position.set(x + sx, y0 + 1, z + 1);
    scene.add(p);
  }
}
building(-33, 40, { w: 5, d: 4, h: 4, color: '#c7a884', roof: 'gable', roofColor: '#7b3b2a' });
// Product: MVP + MVA
roundTower(-11, 24, { r: 2.8, h: 7.5 });
building(-8, 21.5, { w: 4, d: 3.5, h: 9, color: '#5f86c4', kind: 2, roof: 'flat' });
sign('MVP', -12.5, 28.5, { width: 3.6 });
building(6, 23, { w: 3.8, d: 3.8, h: 10, color: '#5c5a74', roof: 'flat' });
building(10.5, 24, { w: 3.6, d: 3.6, h: 11, color: '#5f8ad0', kind: 2 });
sign('MVA', 9, 28, { width: 3.6 });
bush(-20, 26); bush(14, 42); bush(-30, 46); palm(-18, 44, 0.9);

// Promotion: glass skyscrapers, ferris wheel, roller coaster
building(30, 25, { w: 5, d: 5, h: 22, color: '#4e7fd0', kind: 2, roof: 'spire' });
building(36, 24.5, { w: 4, d: 4, h: 17, color: '#7a9fe0', kind: 2 });
building(33.5, 30, { w: 4, d: 3.5, h: 12, color: '#867c86', roof: 'flat' });
building(39.5, 30, { w: 3.5, d: 3.5, h: 9, color: '#77738e' });
{
  const label = textCanvas('PROMOTION', { size: 70, color: '#ff4fb5', padX: 8, padY: 6 });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.2 * label.aspect * 0.6, 1.2 * 0.6 * 1), new THREE.MeshBasicMaterial({ map: label.tex, transparent: true }));
  neon.scale.set(1, 1, 1);
  neon.rotation.z = Math.PI / 2;
  neon.position.set(33.5, groundY(33.5, 30) + 6, 31.8);
  scene.add(neon);
}
const ferris = new THREE.Group();
{
  const [x, z] = clearSpot(44, 37, 3, 0.7, 'ferris');
  const y0 = groundY(x, z);
  const R = 6;
  const steel = new THREE.MeshStandardMaterial({ color: '#d8d8e0', metalness: 0.5, roughness: 0.4 });
  const wheel = new THREE.Group();
  wheel.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 6, 48), steel)));
  const cabins = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, R, 4), steel);
    spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
    spoke.rotation.z = a - Math.PI / 2;
    wheel.add(spoke);
    const cabin = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: awningColors[i % 5] })));
    cabin.position.set(Math.cos(a) * R, Math.sin(a) * R - 0.5, 0);
    wheel.add(cabin);
    cabins.push(cabin);
  }
  wheel.userData.cabins = cabins;
  wheel.position.y = R + 1;
  ferris.add(wheel);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, R + 1.6, 6), steel);
    leg.position.set(sx * 1.6, (R + 1) / 2, 0.4);
    leg.rotation.z = sx * 0.25;
    ferris.add(shadowed(leg));
  }
  ferris.position.set(x, y0, z);
  ferris.rotation.y = -0.5;
  ferris.userData.wheel = wheel;
  scene.add(ferris);
}
let coasterCurve;
{
  const [cx, cz] = clearSpot(27, 33, 8.2, 0.6, 'coaster');
  const y0 = groundY(cx, cz);
  const pts = [
    [-6, 1.5, -2], [-2, 3, -4], [3, 6, -3], [6, 4, 0], [5, 1.5, 3], [1, 2.5, 4],
    [-1, 6, 3], [-0.5, 8, 1.5], [0.5, 6, 0], [-1, 3.5, 1.5], [-5, 2, 3], [-8, 3, 1],
  ].map(([x, y, z]) => new THREE.Vector3(cx + x, y0 + y, cz + z));
  coasterCurve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const track = shadowed(new THREE.Mesh(new THREE.TubeGeometry(coasterCurve, 300, 0.22, 8, true), new THREE.MeshStandardMaterial({ color: '#d42e3a', roughness: 0.4 })));
  scene.add(track);
  for (let i = 0; i < 24; i++) {
    const p = coasterCurve.getPointAt(i / 24);
    const h = p.y - y0;
    if (h < 0.6) continue;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 5), postMat);
    s.position.set(p.x, y0 + h / 2, p.z);
    scene.add(s);
  }
}
const coasterCar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: '#ffd23f' })));
scene.add(coasterCar);

/* --- Brand Beach --- */
const beachPeople = [];
{
  const umbrellaColors = ['#e74c3c', '#27ae60', '#2980b9', '#f39c12'];
  const spots = [[-26, 59], [-17, 56.5], [-7, 56], [7, 60], [-28, 62.5], [3, 61.5]];
  spots.forEach(([sx, sz], i) => {
    const [x, z] = clearSpot(sx, sz, 2, 0.3, 'umbrella');
    const y0 = groundY(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), postMat);
    pole.position.set(x, y0 + 1.2, z);
    const canopy = shadowed(new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.6, 10), new THREE.MeshStandardMaterial({ color: umbrellaColors[i % 4] })));
    canopy.position.set(x, y0 + 2.4, z);
    canopy.rotation.z = 0.15;
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 1.8), new THREE.MeshStandardMaterial({ color: umbrellaColors[(i + 1) % 4] }));
    towel.position.set(x + 1.3, y0 + 0.03, z + 0.6);
    towel.rotation.y = 0.4;
    scene.add(pole, canopy, towel);
  });
  const skin = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69'];
  for (let i = 0; i < 14; i++) {
    const [x, z] = clearSpot(-28 + rand() * 36, 54.5 + rand() * 7, 0.4, 0.3, 'person');
    const y0 = groundY(x, z);
    if (y0 < 0.5) continue;
    const p = new THREE.Group();
    const body = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 3, 6), new THREE.MeshStandardMaterial({ color: awningColors[i % 5] })));
    body.position.y = 0.55;
    const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: skin[i % 4] })));
    head.position.y = 1.1;
    p.add(body, head);
    p.position.set(x, y0, z);
    p.userData = { phase: rand() * 6, base: y0 };
    scene.add(p);
    beachPeople.push(p);
  }
  palm(-30, 60, 1.1, 0.25); palm(10, 56, 1, -0.2); palm(14, 61, 0.9, -0.3); palm(-26, 64, 0.8, 0.15);
  palm(19, 49, 1, -0.2); palm(-16, 45.5, 0.9, 0.2);
  // beach ball
  const ball = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshStandardMaterial({ color: '#ff6b6b' })));
  ball.position.set(-9, groundY(-9, 59) + 0.35, 59);
  scene.add(ball);
}
// Windsurfer + swimmer
const windsurfer = new THREE.Group();
{
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 2.4), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
  const sail = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 3), new THREE.MeshStandardMaterial({ color: '#e74c3c', side: THREE.DoubleSide }));
  sail.scale.z = 0.12;
  sail.position.y = 1.8;
  windsurfer.add(board, shadowed(sail));
  scene.add(windsurfer);
}

/* ------------------------------------------------------------------ *
 *  The road
 * ------------------------------------------------------------------ */
{
  // Heights from terrain, then fill water gaps with bridges
  const raw = roadPts.map((p) => groundHit(p.x, p.z));
  const ys = raw.slice();
  const gaps = [];
  let i = 0;
  while (i < ys.length) {
    if (ys[i] === null) {
      const a = i;
      while (i < ys.length && ys[i] === null) i++;
      const b = i - 1;
      const ya = a > 0 ? ys[a - 1] : 0.5;
      const yb = b < ys.length - 1 ? ys[b + 1] : 0.5;
      for (let k = a; k <= b; k++) {
        const t = (k - a + 1) / (b - a + 2);
        ys[k] = ya + (yb - ya) * t + Math.sin(Math.PI * t) * 1.6;
      }
      gaps.push([a, b]);
    } else i++;
  }
  // Smooth steps between terraces into ramps
  const sm = ys.map((_, k) => {
    let s = 0, n = 0;
    for (let j = -10; j <= 10; j++) { const v = ys[k + j]; if (v !== undefined) { s += v; n++; } }
    return s / n;
  });
  roadPts.forEach((p, k) => { p.y = Math.max(sm[k], raw[k] ?? -Infinity, ys[k] * (raw[k] === null ? 1 : 0)) + 0.14; });

  // Road ribbon
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7b7e84'; ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#5f6267'; ctx.fillRect(0, 0, 4, 128); ctx.fillRect(60, 0, 4, 128);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(29, 10, 6, 56);
  const roadTex = new THREE.CanvasTexture(c);
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.colorSpace = THREE.SRGBColorSpace;
  roadTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const W = 0.95;
  const pos = [], uv = [], idx = [];
  let dist = 0;
  for (let k = 0; k < roadPts.length; k++) {
    const p = roadPts[k];
    const q = roadPts[Math.min(k + 1, roadPts.length - 1)];
    const o = roadPts[Math.max(k - 1, 0)];
    const dx = q.x - o.x, dz = q.z - o.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    if (k > 0) dist += p.distanceTo(roadPts[k - 1]);
    pos.push(p.x + nx * W, p.y, p.z + nz * W, p.x - nx * W, p.y, p.z - nz * W);
    uv.push(0, dist / 3.2, 1, dist / 3.2);
    if (k < roadPts.length - 1) {
      const b = k * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
  road.receiveShadow = true;
  scene.add(road);

  // Bridges over the water gaps
  const red = new THREE.MeshStandardMaterial({ color: '#a8282e', roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2d2f45', roughness: 0.8 });
  gaps.forEach(([a, b]) => {
    const A = Math.max(0, a - 3), B = Math.min(roadPts.length - 1, b + 3);
    // deck underside
    for (let k = A; k < B; k++) {
      const p = roadPts[k], q = roadPts[k + 1];
      const seg = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.35, p.distanceTo(q) + 0.05), dark);
      seg.position.copy(p).add(q).multiplyScalar(0.5);
      seg.position.y -= 0.22;
      seg.lookAt(q.x, q.y - 0.22, q.z);
      scene.add(shadowed(seg));
    }
    const mid = roadPts[Math.round((a + b) / 2)];
    const isRed = Math.hypot(mid.x + 17, mid.z + 3) < 10; // the suspension bridge to Price
    if (!isRed) {
      for (let k = a; k <= b; k += 8) {
        const p = roadPts[k];
        const pier = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, p.y + 1, 8), dark));
        pier.position.set(p.x, (p.y - 1) / 2, p.z);
        scene.add(pier);
      }
      return;
    }
    // Suspension bridge: two red towers + cables
    const towers = [a + Math.round((b - a) * 0.2), a + Math.round((b - a) * 0.8)].map((k) => {
      const p = roadPts[k];
      const t = roadPts[Math.min(k + 1, roadPts.length - 1)].clone().sub(p).setY(0).normalize();
      const n = new THREE.Vector3(-t.z, 0, t.x);
      const H = 9;
      const tops = [];
      for (const s of [-1.35, 1.35]) {
        const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.4, H + p.y, 0.4), red));
        leg.position.set(p.x + n.x * s, (H + p.y) / 2 - 0.5, p.z + n.z * s);
        scene.add(leg);
        tops.push(new THREE.Vector3(p.x + n.x * s, H + p.y - 0.6, p.z + n.z * s));
      }
      for (const y of [p.y + 3.5, p.y + H - 1]) {
        const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 2.7), red));
        bar.position.set(p.x, y, p.z);
        bar.lookAt(p.x + n.x, y, p.z + n.z);
        scene.add(bar);
      }
      return { k, n, tops };
    });
    for (const side of [0, 1]) {
      const s = side ? 1.35 : -1.35;
      const pts = [];
      const kA = Math.max(0, a - 6), kB = Math.min(roadPts.length - 1, b + 6);
      const t0 = towers[0], t1 = towers[1];
      for (let k = kA; k <= kB; k++) {
        const p = roadPts[k];
        let y;
        if (k <= t0.k) y = p.y + 0.8 + (t0.tops[side].y - p.y - 0.8) * ((k - kA) / Math.max(1, t0.k - kA)) ** 1.5;
        else if (k >= t1.k) y = p.y + 0.8 + (t1.tops[side].y - p.y - 0.8) * ((kB - k) / Math.max(1, kB - t1.k)) ** 1.5;
        else { const u = (k - t0.k) / (t1.k - t0.k); y = t0.tops[side].y + (p.y + 1.2 - t0.tops[side].y) * Math.sin(Math.PI * u); }
        pts.push(new THREE.Vector3(p.x + t0.n.x * s, y, p.z + t0.n.z * s));
      }
      const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.07, 5), red);
      scene.add(cable);
      for (let k = t0.k + 3; k < t1.k; k += 3) {
        const p = roadPts[k];
        const top = pts[k - kA];
        const h = top.y - p.y;
        const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 3), red);
        hanger.position.set(top.x, p.y + h / 2, top.z);
        scene.add(hanger);
      }
    }
  });
}

/* ------------------------------------------------------------------ *
 *  Sun, clouds, sharks
 * ------------------------------------------------------------------ */
const sunGroup = new THREE.Group();
{
  const core = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 16), new THREE.MeshBasicMaterial({ color: '#ffd42a', fog: false }));
  sunGroup.add(core);
  const rayMat = new THREE.MeshBasicMaterial({ color: '#ff9f1c', fog: false });
  for (let i = 0; i < 16; i++) {
    const ray = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 4), rayMat);
    const a = (i / 16) * Math.PI * 2;
    ray.position.set(Math.cos(a) * 12, Math.sin(a) * 12, 0);
    ray.rotation.z = a - Math.PI / 2;
    sunGroup.add(ray);
  }
  sunGroup.position.set(85, 70, -110);
  scene.add(sunGroup);
}

const clouds = [];
{
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(rand() * 4);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + rand() * 2.5, 1), mat);
      s.position.set(j * 2.6 - n * 1.3, rand() * 1.5, rand() * 2.5);
      g.add(s);
    }
    g.position.set(-150 + rand() * 300, 55 + rand() * 20, -140 + rand() * 90);
    g.userData.speed = 1.2 + rand() * 1.5;
    scene.add(g);
    clouds.push(g);
  }
}

const sharks = [];
{
  const finMat = new THREE.MeshStandardMaterial({ color: '#59697a', flatShading: true });
  [[-6, 9, 4.5], [48, 4, 5], [-58, -22, 6], [52, -38, 5]].forEach(([x, z, r], i) => {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 3), finMat);
    fin.scale.z = 0.35;
    scene.add(fin);
    sharks.push({ fin, x, z, r, phase: i * 1.7, speed: 0.35 + i * 0.05 });
  });
}

/* ------------------------------------------------------------------ *
 *  "Start here" banners and numbered pins
 * ------------------------------------------------------------------ */
const banners = [];
function banner(text, x, z, height, color) {
  const { tex, aspect } = textCanvas(text + '\n▼', { size: 64, color: '#fff', bg: color, padX: 34, padY: 18, radius: 30, font: 'Inter, sans-serif', lineHeight: 1.1 });
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
  const w = 19;
  spr.scale.set(w, w / aspect, 1);
  const base = groundY(x, z) + height;
  spr.position.set(x, base, z);
  spr.userData.base = base;
  scene.add(spr);
  banners.push(spr);
}
banner('Proper marketers start here', -8, -60, 17, '#1f8a4c');
banner('Most marketers start here', 38, 30, 31, '#d9772b');
banner('Many businesses start here', -14, 58, 12, '#c0392b');

const pins = [];
STOPS.forEach((s, i) => {
  const color = PHASES[s.phase].color;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(i + 1), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  spr.renderOrder = 10;
  const gy = groundY(s.pos[0], s.pos[1]);
  const base = gy + (s.id === 'promotion' ? 25 : s.id === 'orientation' ? 9 : 13);
  spr.position.set(s.pos[0], base, s.pos[1]);
  spr.scale.set(3.4, 3.4, 1);
  spr.userData = { stop: i, base };
  scene.add(spr);
  pins.push(spr);
  s.ground = new THREE.Vector3(s.pos[0], gy, s.pos[1]);
});

/* ------------------------------------------------------------------ *
 *  Car for drive mode
 * ------------------------------------------------------------------ */
const car = new THREE.Group();
{
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 2.1), new THREE.MeshStandardMaterial({ color: '#ffcc00', roughness: 0.4 })));
  body.position.y = 0.45;
  const cabin = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 1.1), new THREE.MeshStandardMaterial({ color: '#2b6ca3', roughness: 0.2 })));
  cabin.position.set(0, 0.88, -0.1);
  car.add(body, cabin);
  const wheelM = new THREE.MeshStandardMaterial({ color: '#222' });
  for (const [x, z] of [[-0.55, 0.7], [0.55, 0.7], [-0.55, -0.7], [0.55, -0.7]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), wheelM);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.22, z);
    car.add(w);
  }
  car.visible = false;
  scene.add(car);
}

/* ------------------------------------------------------------------ *
 *  UI
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const legendBody = $('legend-body');
{
  let lastPhase = null;
  STOPS.forEach((s, i) => {
    if (s.phase !== lastPhase) {
      const t = document.createElement('div');
      t.className = 'phase-title';
      t.style.color = PHASES[s.phase].color;
      t.textContent = PHASES[s.phase].label;
      legendBody.appendChild(t);
      lastPhase = s.phase;
    }
    const b = document.createElement('button');
    b.className = 'stop-btn';
    b.dataset.stop = i;
    b.innerHTML = `<span class="stop-num" style="background:${PHASES[s.phase].color}">${i + 1}</span>${s.name}`;
    b.addEventListener('click', () => { stopTour(); selectStop(i); });
    legendBody.appendChild(b);
  });
}
$('legend-toggle').addEventListener('click', () => {
  const l = $('legend');
  l.classList.toggle('collapsed');
  $('legend-toggle').setAttribute('aria-expanded', String(!l.classList.contains('collapsed')));
});
if (window.innerWidth < 760) $('legend').classList.add('collapsed');

let current = -1;
function showInfo(i) {
  const s = STOPS[i];
  const ph = PHASES[s.phase];
  $('info').hidden = false;
  $('info-phase').textContent = s.phase === 'brand' ? 'The destination' : `${ph.label}`;
  $('info-phase').style.color = ph.color;
  $('info-title').textContent = s.name;
  $('info-desc').textContent = s.desc;
  $('info-points').innerHTML = s.points.map((p) => `<li>${p}</li>`).join('');
  $('info-count').textContent = `Stop ${i + 1} of ${STOPS.length}`;
  document.querySelectorAll('.stop-btn').forEach((b) => b.classList.toggle('current', Number(b.dataset.stop) === i));
}
function selectStop(i, { fly = true } = {}) {
  current = i;
  showInfo(i);
  if (fly) {
    const s = STOPS[i];
    const target = s.ground.clone().add(new THREE.Vector3(0, 2, 0));
    const offset = s.id === 'promotion' ? new THREE.Vector3(-8, 30, 46) : new THREE.Vector3(0, 26, 36);
    flyTo(target.clone().add(offset), target);
  }
}
$('info-close').addEventListener('click', () => { stopTour(); $('info').hidden = true; current = -1; document.querySelectorAll('.stop-btn').forEach((b) => b.classList.remove('current')); });
$('info-next').addEventListener('click', () => { stopTour(); selectStop((current + 1) % STOPS.length); });
$('info-prev').addEventListener('click', () => { stopTour(); selectStop((current - 1 + STOPS.length) % STOPS.length); });
$('btn-overview').addEventListener('click', () => { stopTour(); exitDrive(); flyTo(OVERVIEW.pos, OVERVIEW.target); });

/* Guided tour */
let tourTimer = null;
function startTour() {
  exitDrive();
  $('btn-tour').classList.add('active');
  $('btn-tour').textContent = '■ Stop tour';
  selectStop(0);
  tourTimer = setInterval(() => {
    if (current >= STOPS.length - 1) { stopTour(); flyTo(OVERVIEW.pos, OVERVIEW.target); return; }
    selectStop(current + 1);
  }, 8000);
}
function stopTour() {
  if (!tourTimer) return;
  clearInterval(tourTimer);
  tourTimer = null;
  $('btn-tour').classList.remove('active');
  $('btn-tour').textContent = '▶ Proper route tour';
}
$('btn-tour').addEventListener('click', () => (tourTimer ? stopTour() : startTour()));

/* Drive mode */
const drive = { on: false, s: 0, paused: false, speed: 1, lastStop: -1 };
function startDrive() {
  stopTour();
  drive.on = true; drive.s = 0; drive.paused = false; drive.lastStop = -1;
  car.visible = true;
  controls.enabled = false;
  fly = null;
  $('drive-hud').hidden = false;
  $('info').hidden = true;
  $('btn-drive').classList.add('active');
  $('drive-pause').textContent = 'Pause';
  const { p, dir } = roadAt(0);
  camera.position.copy(p).addScaledVector(dir.clone().setY(0).normalize(), -11).add(new THREE.Vector3(0, 6.5, 0));
  controls.target.copy(p);
}
function exitDrive() {
  if (!drive.on) return;
  drive.on = false;
  car.visible = false;
  controls.enabled = true;
  $('drive-hud').hidden = true;
  $('btn-drive').classList.remove('active');
  controls.target.copy(car.position);
}
$('btn-drive').addEventListener('click', () => (drive.on ? (exitDrive(), flyTo(OVERVIEW.pos, OVERVIEW.target)) : startDrive()));
$('drive-exit').addEventListener('click', () => { exitDrive(); flyTo(OVERVIEW.pos, OVERVIEW.target); });
$('drive-pause').addEventListener('click', () => { drive.paused = !drive.paused; $('drive-pause').textContent = drive.paused ? 'Resume' : 'Pause'; });
$('drive-speed').addEventListener('click', () => { drive.speed = drive.speed === 1 ? 2 : drive.speed === 2 ? 4 : 1; $('drive-speed').textContent = `Speed ×${drive.speed}`; });

/* Camera flights */
let fly = null;
function flyTo(pos, target, dur = 1.6) {
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur };
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* Picking */
const pointer = new THREE.Vector2();
const tooltip = $('tooltip');
let downAt = null;
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const pinHit = raycaster.intersectObjects(pins, false)[0];
  if (pinHit) return pinHit.object.userData.stop;
  const hit = raycaster.intersectObjects(islandMeshes, false)[0];
  if (!hit) return null;
  let best = null, bestD = 13;
  STOPS.forEach((s, i) => {
    const d = Math.hypot(hit.point.x - s.pos[0], hit.point.z - s.pos[1]);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
canvas.addEventListener('pointermove', (ev) => {
  if (drive.on || ev.buttons) { tooltip.hidden = true; return; }
  const i = pick(ev);
  if (i === null) { tooltip.hidden = true; canvas.style.cursor = ''; return; }
  tooltip.hidden = false;
  tooltip.textContent = `${i + 1}. ${STOPS[i].name}`;
  tooltip.style.left = ev.clientX + 'px';
  tooltip.style.top = ev.clientY + 'px';
  canvas.style.cursor = 'pointer';
});
canvas.addEventListener('pointerleave', () => { tooltip.hidden = true; });
canvas.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
canvas.addEventListener('pointerup', (ev) => {
  if (!downAt || drive.on) return;
  const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
  downAt = null;
  if (moved > 6) return;
  const i = pick(ev);
  if (i !== null) { stopTour(); selectStop(i); }
});
controls.addEventListener('start', () => { fly = null; });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { stopTour(); exitDrive(); }
  if (drive.on) return;
  if (e.key === 'ArrowRight') { stopTour(); selectStop((current + 1) % STOPS.length); }
  if (e.key === 'ArrowLeft') { stopTour(); selectStop((current - 1 + STOPS.length) % STOPS.length); }
});

/* ------------------------------------------------------------------ *
 *  Animation loop
 * ------------------------------------------------------------------ */
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
const camGoal = new THREE.Vector3();
function nearestStop(p, maxD) {
  let best = -1, bestD = maxD;
  STOPS.forEach((s, i) => { const d = Math.hypot(p.x - s.pos[0], p.z - s.pos[1]); if (d < bestD) { bestD = d; best = i; } });
  return best;
}
function roadAt(s) {
  const f = Math.min(Math.max(s, 0), 0.99999) * (roadPts.length - 1);
  const k = Math.floor(f), u = f - k;
  const a = roadPts[k], b = roadPts[k + 1];
  return { p: a.clone().lerp(b, u), dir: b.clone().sub(a).normalize() };
}

function animate() {
  const realDt = clock.getDelta();
  const dt = Math.min(realDt, 0.05);
  const t = clock.elapsedTime;

  waterTex.offset.set(t * 0.004, t * 0.002);
  sunGroup.lookAt(camera.position);
  sunGroup.rotateZ(t * 0.08);

  const wheel = ferris.userData.wheel;
  wheel.rotation.z = t * 0.25;
  wheel.userData.cabins.forEach((c) => { c.rotation.z = -wheel.rotation.z; });

  const cu = (t * 0.07) % 1;
  coasterCar.position.copy(coasterCurve.getPointAt(cu));
  coasterCar.lookAt(tmpV.copy(coasterCurve.getPointAt((cu + 0.005) % 1)));

  clouds.forEach((c) => { c.position.x += c.userData.speed * dt; if (c.position.x > 170) c.position.x = -170; });
  sharks.forEach((s) => {
    const a = t * s.speed + s.phase;
    s.fin.position.set(s.x + Math.cos(a) * s.r, 0.5 + Math.sin(t * 3 + s.phase) * 0.08, s.z + Math.sin(a) * s.r);
    s.fin.rotation.y = -a;
  });
  windsurfer.position.set(-40 + Math.sin(t * 0.15) * 8, 0.1 + Math.sin(t * 2) * 0.05, 58 + Math.cos(t * 0.15) * 3);
  windsurfer.rotation.y = Math.cos(t * 0.15) > 0 ? 0.6 : -2.5;
  windsurfer.rotation.z = Math.sin(t * 1.5) * 0.05;
  beachPeople.forEach((p) => { p.position.y = p.userData.base + Math.max(0, Math.sin(t * 3 + p.userData.phase)) * 0.25; });
  banners.forEach((b, i) => { b.position.y = b.userData.base + Math.sin(t * 1.5 + i) * 0.5; });
  pins.forEach((p, i) => {
    p.position.y = p.userData.base + Math.sin(t * 2 + i) * 0.3;
    const sc = p.userData.stop === current ? 4.4 : 3.4;
    p.scale.setScalar(THREE.MathUtils.lerp(p.scale.x, sc, 0.15));
    // fade pins that are right in front of the camera so they don't block the view
    p.material.opacity = p.userData.stop === current ? 1 : THREE.MathUtils.clamp((p.position.distanceTo(camera.position) - 22) / 18, 0.15, 1);
  });

  if (drive.on) {
    if (!drive.paused) drive.s += (dt * 6 * drive.speed) / roadLen;
    if (drive.s >= 1) drive.s = 0;
    const { p, dir } = roadAt(drive.s);
    car.position.copy(p);
    car.lookAt(tmpV.copy(p).add(dir));
    camGoal.copy(p).addScaledVector(dir.clone().setY(0).normalize(), -11).add(new THREE.Vector3(0, 6.5, 0));
    camera.position.lerp(camGoal, 1 - Math.exp(-dt * 4));
    controls.target.lerp(tmpV.copy(p).addScaledVector(dir, 6), 1 - Math.exp(-dt * 6));
    camera.lookAt(controls.target);
    const ns = nearestStop(p, 12);
    if (ns >= 0 && ns !== drive.lastStop) {
      drive.lastStop = ns;
      $('drive-now').textContent = `Now in: ${STOPS[ns].name}`;
      $('drive-now').style.color = PHASES[STOPS[ns].phase].color;
    }
  } else if (fly) {
    fly.t += Math.min(realDt, 0.25) / fly.dur;
    const e = ease(Math.min(fly.t, 1));
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    // lift the camera mid-flight for a nicer arc
    camera.position.y += Math.sin(Math.PI * e) * 12;
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (fly.t >= 1) fly = null;
    controls.update();
  } else {
    controls.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Layout self-check: warn (console only) if anything ended up on the road or in the sea
obstacles.forEach((o) => { if (groundHit(o.x, o.z) === null) console.warn('off-island', o.name, o.x.toFixed(1), o.z.toFixed(1)); });
letterSpots.forEach((l) => {
  if (l.drop > 0.4) console.warn('letter off the edge', l.text, l.x.toFixed(1), l.z.toFixed(1));
  if (roadDist(l.x, l.z).d < l.r + ROAD_HALF + 0.2) console.warn('letter on road', l.text, l.x.toFixed(1), l.z.toFixed(1));
  obstacles.forEach((o) => { if (o.name !== 'person' && Math.hypot(o.x - l.x, o.z - l.z) < o.r + l.r) console.warn('letter hits', o.name, l.text, o.x.toFixed(1), o.z.toFixed(1)); });
});

animate();
$('loader').classList.add('done');
flyTo(OVERVIEW.pos, OVERVIEW.target, 2.8);
