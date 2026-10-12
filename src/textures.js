/**
 * Procedurally generated textures (no external image assets are needed).
 */
import * as THREE from 'three';

function canvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/** Deterministic pseudo random generator so textures look the same every load. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finish(c, { repeat = false, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Hard-wood board texture covering the whole board top, with a carved border band of
 * triangles (a motif common on East African carvings) and a central dividing line.
 * `aspect` = board width / depth.
 */
export function boardTexture(aspect) {
  const h = 512;
  const w = Math.min(4096, Math.round(h * aspect));
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const r = rng(7);

  g.fillStyle = '#7a4a24';
  g.fillRect(0, 0, w, h);
  // Long grain running along the board.
  for (let i = 0; i < 260; i++) {
    const y = r() * h;
    const amp = 2 + r() * 8;
    const freq = 0.002 + r() * 0.01;
    const phase = r() * 10;
    g.strokeStyle = r() < 0.5 ? `rgba(40,20,8,${0.08 + r() * 0.18})` : `rgba(170,110,60,${0.05 + r() * 0.12})`;
    g.lineWidth = 0.6 + r() * 2.4;
    g.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const yy = y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1) * amp * 0.3;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  // A few knots.
  for (let k = 0; k < 4; k++) {
    const x = r() * w;
    const y = r() * h;
    for (let ring = 10; ring > 0; ring--) {
      g.strokeStyle = `rgba(45,22,8,${0.05 + ring * 0.01})`;
      g.beginPath();
      g.ellipse(x, y, ring * 4.5, ring * 1.6, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // Carved border band with triangles.
  const inset = h * 0.035;
  const band = h * 0.03;
  g.strokeStyle = 'rgba(30,14,5,0.65)';
  g.lineWidth = 2;
  g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  g.strokeRect(inset + band, inset + band, w - (inset + band) * 2, h - (inset + band) * 2);
  g.fillStyle = 'rgba(30,14,5,0.45)';
  const tri = band;
  const drawRow = (y, flip) => {
    for (let x = inset + band; x < w - inset - band - tri; x += tri * 1.4) {
      g.beginPath();
      g.moveTo(x, flip ? y + band : y);
      g.lineTo(x + tri * 0.7, flip ? y : y + band);
      g.lineTo(x + tri * 1.4, flip ? y + band : y);
      g.closePath();
      g.fill();
    }
  };
  drawRow(inset, false);
  drawRow(h - inset - band, true);
  // Centre line separating the two players' territories.
  g.strokeStyle = 'rgba(30,14,5,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(inset + band, h / 2);
  g.lineTo(w - inset - band, h / 2);
  g.stroke();
  return finish(c);
}

export function woodGrainTexture(seed = 3, base = '#6b3f1d') {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) {
    const y = r() * 512;
    g.strokeStyle = `rgba(30,15,5,${0.06 + r() * 0.2})`;
    g.lineWidth = 0.5 + r() * 2;
    g.beginPath();
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 3);
    g.stroke();
  }
  return finish(c, { repeat: true });
}

/**
 * Woven reed mat with dyed stripes. `palette` holds the natural reed shades and
 * `stripes` the two dyed bands (wide band, thin band).
 */
export function matTexture({
  palette = ['#d8b77a', '#cfae6f', '#e0c288', '#c9a465'],
  stripes = ['#8e3b22', '#3d2b1f'],
  seed = 11,
} = {}) {
  const size = 512;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = rng(seed);
  const strip = 16;
  for (let y = 0; y < size; y += strip) {
    for (let x = 0; x < size; x += strip) {
      const over = ((x / strip) + (y / strip)) % 2 === 0;
      let color = palette[Math.floor(r() * palette.length)];
      const stripeRow = Math.floor(y / strip) % 16;
      if (stripeRow === 3 || stripeRow === 4) color = stripes[0];
      if (stripeRow === 11) color = stripes[1];
      g.fillStyle = color;
      g.fillRect(x, y, strip, strip);
      const grad = over
        ? g.createLinearGradient(x, y, x + strip, y)
        : g.createLinearGradient(x, y, x, y + strip);
      grad.addColorStop(0, 'rgba(0,0,0,0.22)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      grad.addColorStop(1, 'rgba(0,0,0,0.22)');
      g.fillStyle = grad;
      g.fillRect(x, y, strip, strip);
    }
  }
  return finish(c, { repeat: true });
}

/** Red laterite earth. */
export function earthTexture() {
  const size = 512;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = rng(5);
  g.fillStyle = '#9a5634';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const shade = r();
    g.fillStyle =
      shade < 0.5
        ? `rgba(70,32,15,${0.05 + r() * 0.15})`
        : `rgba(200,130,85,${0.04 + r() * 0.12})`;
    const s = 1 + r() * 4;
    g.fillRect(r() * size, r() * size, s, s);
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(60,30,15,${0.04 + r() * 0.05})`;
    g.beginPath();
    g.ellipse(r() * size, r() * size, 20 + r() * 60, 10 + r() * 30, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c, { repeat: true });
}

/**
 * Vertical sky gradient used as the scene background. `stops` is a list of
 * [position 0..1 from the top, css colour]; the default is a warm late afternoon.
 */
export function skyTexture(
  stops = [
    [0, '#2c3e57'],
    [0.45, '#c9875a'],
    [0.62, '#e8b27a'],
    [1, '#7a4a30'],
  ],
) {
  const c = canvas(16, 512);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  for (const [pos, color] of stops) grad.addColorStop(pos, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  return finish(c);
}

/** Speckled ground: a base colour with light/dark grains and a few soft blotches. */
function speckle(g, size, r, { base, dark, light, grains = 9000, blotch, blotches = 30 }) {
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < grains; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(${dark},${0.05 + r() * 0.15})` : `rgba(${light},${0.04 + r() * 0.12})`;
    const s = 1 + r() * 3;
    g.fillRect(r() * size, r() * size, s, s);
  }
  for (let i = 0; i < blotches; i++) {
    g.fillStyle = `rgba(${blotch},${0.04 + r() * 0.05})`;
    g.beginPath();
    g.ellipse(r() * size, r() * size, 20 + r() * 60, 10 + r() * 30, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
}

/** Pale coral sand with faint wind ripples. */
export function sandTexture() {
  const size = 512;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = rng(21);
  speckle(g, size, r, { base: '#e2c68f', dark: '150,115,70', light: '255,248,230', blotch: '190,160,110' });
  g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const y = r() * size;
    g.strokeStyle = `rgba(170,140,95,${0.06 + r() * 0.08})`;
    g.beginPath();
    for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4);
    g.stroke();
  }
  return finish(c, { repeat: true });
}

/**
 * Radial sea texture for a large disc: shallow turquoise near the shore (inner radius
 * `shore` as a fraction of the disc radius) fading to deep Indian Ocean blue, with surf.
 */
export function seaTexture(shore = 0.2) {
  const size = 1024;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, '#e2c68f');
  grad.addColorStop(shore * 0.98, '#e2c68f');
  grad.addColorStop(shore * 1.02, '#9fe3d6');
  grad.addColorStop(shore * 1.35, '#3cc2c4');
  grad.addColorStop(shore * 2.2, '#1890a8');
  grad.addColorStop(1, '#0d5f86');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const r = rng(31);
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = `rgba(255,255,255,${0.55 - k * 0.15})`;
    g.lineWidth = 3 - k;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.02) {
      const rad = h * shore * (1.02 + k * 0.05) + Math.sin(a * 23 + k) * 1.5;
      g.lineTo(h + Math.cos(a) * rad, h + Math.sin(a) * rad);
    }
    g.stroke();
  }
  for (let i = 0; i < 1600; i++) {
    const a = r() * Math.PI * 2;
    const rad = h * (shore * 1.1 + r() * (1 - shore * 1.1));
    g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`;
    g.fillRect(h + Math.cos(a) * rad, h + Math.sin(a) * rad, 2 + r() * 6, 1);
  }
  return finish(c);
}

/** Worn concrete paving slabs, as in a city market. */
export function pavingTexture() {
  const size = 512;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = rng(41);
  speckle(g, size, r, { base: '#8d8780', dark: '50,45,40', light: '200,195,185', blotch: '60,55,50', blotches: 40 });
  const tile = size / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.06})`;
      g.fillRect(x * tile, y * tile, tile, tile);
    }
  }
  g.strokeStyle = 'rgba(40,36,32,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(0, i * tile);
    g.lineTo(size, i * tile);
    g.moveTo(i * tile, 0);
    g.lineTo(i * tile, size);
    g.stroke();
  }
  return finish(c, { repeat: true });
}

/** Bold capulana print: border bands, sun medallions and leaf shapes. */
export function capulanaTexture() {
  const size = 512;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#f2a516';
  g.fillRect(0, 0, size, size);
  // Stripes along the top and bottom edges of each tile form continuous bands when repeated.
  const bands = [
    ['#1c3f94', 0, 34],
    ['#ffffff', 34, 8],
    ['#c8242b', 42, 14],
    ['#1c3f94', size - 34, 34],
    ['#ffffff', size - 42, 8],
    ['#c8242b', size - 56, 14],
  ];
  for (const [color, y, h] of bands) {
    g.fillStyle = color;
    g.fillRect(0, y, size, h);
  }
  g.fillStyle = '#ffffff';
  for (let x = 8; x < size; x += 32) {
    g.beginPath();
    g.arc(x, 17, 6, 0, Math.PI * 2);
    g.arc(x + 16, size - 17, 6, 0, Math.PI * 2);
    g.fill();
  }
  const medallion = (cx, cy, rad) => {
    const rings = ['#c8242b', '#1c3f94', '#f7d23e', '#127a4a', '#ffffff'];
    rings.forEach((color, i) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(cx, cy, rad * (1 - i * 0.19), 0, Math.PI * 2);
      g.fill();
    });
    g.strokeStyle = '#1c3f94';
    g.lineWidth = 4;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * rad * 1.05, cy + Math.sin(a) * rad * 1.05);
      g.lineTo(cx + Math.cos(a) * rad * 1.3, cy + Math.sin(a) * rad * 1.3);
      g.stroke();
    }
  };
  medallion(size * 0.25, size * 0.5, 70);
  medallion(size * 0.75, size * 0.5, 70);
  g.fillStyle = '#127a4a';
  for (const [x, y, rot] of [
    [size * 0.5, size * 0.3, 0.6],
    [size * 0.5, size * 0.7, -0.6],
    [0, size * 0.3, -0.6],
    [size, size * 0.3, -0.6],
    [0, size * 0.7, 0.6],
    [size, size * 0.7, 0.6],
  ]) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.beginPath();
    g.ellipse(0, 0, 44, 15, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  return finish(c, { repeat: true });
}

/** Dry golden savanna grass. */
export function grassTexture() {
  const size = 512;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = rng(51);
  speckle(g, size, r, { base: '#caa04c', dark: '120,90,35', light: '235,200,120', blotch: '120,90,40', grains: 4000 });
  for (let i = 0; i < 5000; i++) {
    const x = r() * size;
    const y = r() * size;
    const len = 4 + r() * 10;
    const a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    g.strokeStyle = r() < 0.6 ? `rgba(225,185,100,${0.25 + r() * 0.3})` : `rgba(110,80,35,${0.2 + r() * 0.3})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  return finish(c, { repeat: true });
}

/** Vertical stripes for market stall awnings. */
export function awningTexture(colors = ['#c8242b', '#f4ead8']) {
  const c = canvas(128, 16);
  const g = c.getContext('2d');
  const w = 128 / (colors.length * 2);
  for (let i = 0; i < colors.length * 2; i++) {
    g.fillStyle = colors[i % colors.length];
    g.fillRect(i * w, 0, w, 16);
  }
  return finish(c);
}

/** Wooden crate slats. */
export function crateTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const r = rng(61);
  g.fillStyle = '#b58a55';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '90,60,30' : '220,180,120'},${0.15 + r() * 0.15})`;
    g.fillRect(0, i * 32 + 2, 128, 28);
    g.fillStyle = 'rgba(40,25,10,0.7)';
    g.fillRect(0, i * 32, 128, 3);
  }
  g.strokeStyle = 'rgba(40,25,10,0.6)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 122);
  return finish(c);
}

const labelCache = new Map();
/** Small rounded "pill" texture showing a number; cached per value. */
export function countTexture(value) {
  if (labelCache.has(value)) return labelCache.get(value);
  const c = canvas(128, 80);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(28,16,8,0.78)';
  const rr = 30;
  g.beginPath();
  g.roundRect(8, 10, 112, 60, rr);
  g.fill();
  g.strokeStyle = 'rgba(242,193,78,0.8)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = value === 0 ? 'rgba(244,233,216,0.45)' : '#f4e9d8';
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(value), 64, 42);
  const tex = finish(c);
  labelCache.set(value, tex);
  return tex;
}
