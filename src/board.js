/**
 * Board geometry: the carved four-row wooden board, its bins, highlight rings,
 * seed-count labels and the calabashes for captured seeds. The mat or cloth under the
 * board belongs to the scenario and lives in scene.js.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NORTH, SOUTH, binAt, columnOf, rowOf } from './gameLogic.js';
import { boardTexture, countTexture, woodGrainTexture } from './textures.js';

export const PIT_RADIUS = 0.38;
export const SPACING = 1.0;
export const ROW_Z = [1.78, 0.66, -0.66, -1.78];
export const BOARD_DEPTH = 5.0;
export const BOARD_TOP = 0.42;
const BEVEL = 0.04;
const RIM_RADIUS = PIT_RADIUS - BEVEL;
const BOWL_DEPTH = 0.2;
const LABEL_OFFSET = [0.53, -0.53, 0.53, -0.53];

const RING_STYLE = {
  hover: { color: 0xfff1c1, opacity: 0.95, pulse: false },
  extra: { color: 0xe4572e, opacity: 0.9, pulse: true },
  hint: { color: 0x5ad1ff, opacity: 0.95, pulse: true },
  invalid: { color: 0xff3b30, opacity: 1, pulse: false },
  capture: { color: 0xff7a45, opacity: 0.9, pulse: false },
  preview: { color: 0x6ec6ff, opacity: 0.85, pulse: false },
  focus: { color: 0xffffff, opacity: 0.9, pulse: true },
  legal: { color: 0xf2c14e, opacity: 0.55, pulse: true },
  last: { color: 0x7fd1ae, opacity: 0.7, pulse: false },
};
const PRIORITY = ['invalid', 'hover', 'focus', 'extra', 'hint', 'capture', 'preview', 'legal', 'last'];

const key = (player, bin) => player * 1000 + bin;

export class Layout {
  constructor(columns) {
    this.columns = columns;
    this.width = columns * SPACING + 0.9;
    this.depth = BOARD_DEPTH;
    this.top = BOARD_TOP;
    this.rimY = BOARD_TOP - BEVEL;
  }

  pitCenter(player, bin, target = new THREE.Vector3()) {
    const col = columnOf(this.columns, player, bin);
    const row = rowOf(this.columns, player, bin);
    return target.set((col - (this.columns - 1) / 2) * SPACING, this.top, ROW_Z[row]);
  }

  /** Height of the bowl's inner surface at radial distance r from the bin centre. */
  bowlSurfaceY(r) {
    const k = Math.min(0.98, r / RIM_RADIUS);
    return this.rimY - BOWL_DEPTH * Math.sqrt(1 - k * k);
  }

  pitAtPoint(point) {
    const col = Math.round(point.x / SPACING + (this.columns - 1) / 2);
    if (col < 0 || col >= this.columns) return null;
    let row = 0;
    let best = Infinity;
    ROW_Z.forEach((z, i) => {
      const d = Math.abs(point.z - z);
      if (d < best) {
        best = d;
        row = i;
      }
    });
    const cx = (col - (this.columns - 1) / 2) * SPACING;
    if (Math.hypot(point.x - cx, point.z - ROW_Z[row]) > PIT_RADIUS + 0.14) return null;
    const player = row <= 1 ? SOUTH : NORTH;
    const attacking = row === 1 || row === 2;
    return { player, bin: binAt(this.columns, player, attacking, col) };
  }

  calabashPosition(player) {
    const x = this.width / 2 + 1.35;
    return player === SOUTH ? new THREE.Vector3(x, 0, 1.45) : new THREE.Vector3(-x, 0, -1.45);
  }
}

function roundedRect(shape, w, h, r) {
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
}

function calabashGeometry() {
  const pts = [];
  const steps = 18;
  // Outer wall, from the bottom centre up to the rim, then back down the inside.
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * 0.9, 0.5 - Math.cos(a) * 0.45));
  }
  pts.push(new THREE.Vector2(0.86, 0.52));
  for (let i = steps; i >= 0; i--) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * 0.84, 0.52 - Math.cos(a) * 0.4));
  }
  return new THREE.LatheGeometry(pts, 48);
}

export class Board {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.layout = null;
    this.rings = new Map();
    this.labels = new Map();
    this.layers = new Map();
    this.flashes = new Map();
    this.countsVisible = true;
    this.disposables = [];
  }

  build(columns) {
    this.clear();
    const layout = new Layout(columns);
    this.layout = layout;
    const { width, depth } = layout;

    // --- Board body ---------------------------------------------------------
    const shape = new THREE.Shape();
    roundedRect(shape, width, depth, 0.45);
    const center = new THREE.Vector3();
    for (const player of [SOUTH, NORTH]) {
      for (let bin = 0; bin < columns * 2; bin++) {
        layout.pitCenter(player, bin, center);
        const hole = new THREE.Path();
        // Shape y maps to world -z after rotating the extrusion flat.
        hole.absarc(center.x, -center.z, PIT_RADIUS, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
    }
    const bodyGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.26,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 3,
      curveSegments: 20,
    });
    bodyGeo.rotateX(-Math.PI / 2);
    bodyGeo.computeBoundingBox();
    bodyGeo.translate(0, BOARD_TOP - bodyGeo.boundingBox.max.y, 0);

    const topTex = boardTexture(width / depth);
    topTex.repeat.set(1 / width, 1 / depth);
    topTex.offset.set(0.5, 0.5);
    const sideTex = woodGrainTexture(3);
    sideTex.repeat.set(0.35, 0.35);
    const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.55, metalness: 0.02 });
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, color: 0xb98a63, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, [topMat, sideMat]);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // --- Bowls (merged into one draw call) -----------------------------------
    const profile = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * (Math.PI / 2);
      profile.push(new THREE.Vector2(Math.sin(a) * RIM_RADIUS, -Math.cos(a) * BOWL_DEPTH));
    }
    const bowlTemplate = new THREE.LatheGeometry(profile, 28);
    const bowlGeos = [];
    for (const player of [SOUTH, NORTH]) {
      for (let bin = 0; bin < columns * 2; bin++) {
        layout.pitCenter(player, bin, center);
        const g = bowlTemplate.clone();
        g.translate(center.x, layout.rimY, center.z);
        bowlGeos.push(g);
      }
    }
    // Freshly carved, light honey-coloured wood so the dark seeds stand out. A faint warm
    // emissive term keeps the bowl interiors readable when the rim shades them.
    const bowlTex = woodGrainTexture(9, '#cf9d66');
    bowlTex.repeat.set(0.6, 0.6);
    const bowls = new THREE.Mesh(
      mergeGeometries(bowlGeos),
      new THREE.MeshStandardMaterial({
        map: bowlTex,
        color: 0xffffff,
        roughness: 0.62,
        emissive: 0x5a3a1c,
        emissiveIntensity: 0.28,
        side: THREE.DoubleSide,
      }),
    );
    bowls.receiveShadow = true;
    this.group.add(bowls);
    bowlGeos.forEach((g) => g.dispose());
    bowlTemplate.dispose();

    // --- Feet ---------------------------------------------------------------
    const footMat = new THREE.MeshStandardMaterial({ map: sideTex, color: 0x8a6446, roughness: 0.7 });
    for (const x of [-width / 2 + 1.2, width / 2 - 1.2]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, depth - 0.8), footMat);
      foot.position.set(x, 0.05, 0);
      foot.castShadow = true;
      foot.receiveShadow = true;
      this.group.add(foot);
    }

    // --- Calabashes for captured seeds --------------------------------------
    const calGeo = calabashGeometry();
    const calMat = new THREE.MeshStandardMaterial({ color: 0xc27a35, roughness: 0.55, side: THREE.DoubleSide });
    for (const player of [SOUTH, NORTH]) {
      const cal = new THREE.Mesh(calGeo, calMat);
      cal.position.copy(layout.calabashPosition(player));
      cal.position.y = -0.05;
      cal.castShadow = true;
      cal.receiveShadow = true;
      this.group.add(cal);
    }

    // --- Highlight rings and count labels -----------------------------------
    const ringGeo = new THREE.RingGeometry(PIT_RADIUS + 0.02, PIT_RADIUS + 0.09, 40);
    ringGeo.rotateX(-Math.PI / 2);
    for (const player of [SOUTH, NORTH]) {
      for (let bin = 0; bin < columns * 2; bin++) {
        layout.pitCenter(player, bin, center);
        const ring = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 }),
        );
        ring.position.set(center.x, BOARD_TOP + 0.004, center.z);
        ring.visible = false;
        ring.renderOrder = 2;
        ring.userData.baseX = center.x;
        ring.userData.ownMaterial = true;
        this.group.add(ring);
        this.rings.set(key(player, bin), ring);

        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: countTexture(0), depthWrite: false }));
        const row = rowOf(columns, player, bin);
        label.position.set(center.x, BOARD_TOP + 0.06, center.z + LABEL_OFFSET[row]);
        label.scale.set(0.34, 0.21, 1);
        label.renderOrder = 3;
        label.userData.value = 0;
        label.userData.ownMaterial = true;
        label.visible = this.countsVisible;
        this.group.add(label);
        this.labels.set(key(player, bin), label);
      }
    }

    this.disposables.push(bodyGeo, topTex, sideTex, topMat, sideMat, bowls.geometry, bowls.material, bowlTex);
    this.disposables.push(footMat, calGeo, calMat, ringGeo);
    return layout;
  }

  clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child.isMesh && child.geometry.type === 'BoxGeometry') child.geometry.dispose();
      if (child.userData.ownMaterial) child.material.dispose();
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.rings.clear();
    this.labels.clear();
    this.layers.clear();
    this.flashes.clear();
  }


  // --- Counts -----------------------------------------------------------------

  setCount(player, bin, value) {
    const label = this.labels.get(key(player, bin));
    if (!label || label.userData.value === value) return;
    label.userData.value = value;
    label.material.map = countTexture(value);
    label.material.needsUpdate = true;
  }

  setCounts(bins) {
    bins.forEach((side, player) => side.forEach((n, bin) => this.setCount(player, bin, n)));
  }

  setCountsVisible(visible) {
    this.countsVisible = visible;
    for (const label of this.labels.values()) label.visible = visible;
  }

  // --- Highlights ---------------------------------------------------------------

  /** Replaces the pits highlighted in a named layer (e.g. 'legal', 'hover'). */
  setLayer(name, pits = []) {
    const old = this.layers.get(name) ?? [];
    const next = pits.filter(Boolean).map((p) => key(p.player, p.bin));
    this.layers.set(name, next);
    for (const k of new Set([...old, ...next])) this.refreshRing(k);
  }

  clearLayers(names = [...this.layers.keys()]) {
    for (const name of names) this.setLayer(name, []);
  }

  flash(player, bin, kind = 'invalid', ms = 650) {
    const k = key(player, bin);
    this.flashes.set(k, { kind, until: performance.now() + ms });
    this.refreshRing(k);
  }

  refreshRing(k) {
    const ring = this.rings.get(k);
    if (!ring) return;
    let kind = null;
    const flash = this.flashes.get(k);
    if (flash) kind = flash.kind;
    else {
      for (const name of PRIORITY) {
        if (this.layers.get(name)?.includes(k)) {
          kind = name;
          break;
        }
      }
    }
    ring.userData.kind = kind;
    if (!kind) {
      ring.visible = false;
      return;
    }
    const style = RING_STYLE[kind];
    ring.visible = true;
    ring.material.color.setHex(style.color);
    ring.material.opacity = style.opacity;
  }

  update(timeMs) {
    for (const [k, f] of this.flashes) {
      if (timeMs > f.until) {
        this.flashes.delete(k);
        this.refreshRing(k);
      }
    }
    const pulse = 0.55 + 0.45 * Math.sin(timeMs / 260);
    for (const ring of this.rings.values()) {
      if (!ring.visible) continue;
      const style = RING_STYLE[ring.userData.kind];
      if (style?.pulse) ring.material.opacity = style.opacity * (0.45 + 0.55 * pulse);
      ring.position.x = ring.userData.baseX + (ring.userData.kind === 'invalid' ? Math.sin(timeMs / 25) * 0.04 : 0);
    }
  }
}
