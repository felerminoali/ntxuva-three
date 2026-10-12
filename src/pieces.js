/**
 * Seed models and their animations (pick-up, sowing, relay and capture).
 */
import * as THREE from 'three';
import { NORTH, SOUTH } from './gameLogic.js';
import { BOARD_TOP } from './board.js';
import { ease } from './animator.js';

const SEED_SIZE = 0.072;
const PIT_RINGS = { radii: [0, 0.11, 0.215], counts: [1, 6, 11], layerHeight: 0.1 };
const STORE_RINGS = { radii: [0, 0.13, 0.26, 0.39, 0.52, 0.64], counts: [1, 6, 12, 18, 24, 30], layerHeight: 0.1 };
const HAND_HEIGHT = 0.75;

const PALETTE = [
  { color: 0x6b4a32, roughness: 0.45 },
  { color: 0x8b5a2b, roughness: 0.4 },
  { color: 0x4a3a2e, roughness: 0.5 },
  { color: 0x4a4038, roughness: 0.6 },
  { color: 0x5b4e6a, roughness: 0.55 },
  { color: 0x3b2a20, roughness: 0.35 },
];

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function seedGeometry(variant) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1 + (hash(i * 3.1 + variant * 17.7 + v.x * 5 + v.y * 7) - 0.5) * 0.18;
    v.multiplyScalar(n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Offset of the i-th item in a heap (rings stacked in layers). */
function heapOffset(i, rings, out) {
  const perLayer = rings.counts.reduce((a, b) => a + b, 0);
  const layer = Math.floor(i / perLayer);
  let j = i % perLayer;
  let ring = 0;
  while (j >= rings.counts[ring]) {
    j -= rings.counts[ring];
    ring++;
  }
  const shrink = Math.max(0.35, 1 - layer * 0.18);
  const r = rings.radii[ring] * shrink;
  const angle = (j / rings.counts[ring]) * Math.PI * 2 + layer * 0.6 + ring * 0.35;
  const jitter = (hash(i + 0.5) - 0.5) * 0.025;
  out.set(Math.cos(angle) * (r + jitter), layer, Math.sin(angle) * (r + jitter));
  return out;
}

export class Pieces {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./animator.js').Animator} animator
   * @param {{ drop?:Function, pickup?:Function, capture?:Function }} audio
   */
  constructor(scene, animator, audio) {
    this.scene = scene;
    this.animator = animator;
    this.audio = audio;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.geometries = [0, 1, 2, 3].map(seedGeometry);
    this.materials = PALETTE.map((p) => new THREE.MeshStandardMaterial({ ...p, metalness: 0 }));
    this.board = null;
    this.pits = [[], []];
    this.stores = [[], []];
    this.hand = [];
    this.skipping = false;
    this.playing = false;
    this.created = 0;
    this.tmp = new THREE.Vector3();
  }

  setBoard(board) {
    this.board = board;
  }

  get layout() {
    return this.board.layout;
  }

  createSeed() {
    const n = this.created++;
    const mesh = new THREE.Mesh(
      this.geometries[n % this.geometries.length],
      this.materials[Math.floor(hash(n * 7.3) * this.materials.length)],
    );
    const s = SEED_SIZE * (0.9 + hash(n * 1.7) * 0.2);
    mesh.scale.set(s * 1.15, s * 0.8, s);
    mesh.rotation.set(hash(n) * 0.4, hash(n * 2.1) * Math.PI * 2, hash(n * 3.3) * 0.4);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  removeSeed(mesh) {
    this.group.remove(mesh);
  }

  // --- Positions ----------------------------------------------------------------

  pitSlot(player, bin, index, out = new THREE.Vector3()) {
    const center = this.layout.pitCenter(player, bin, this.tmp);
    heapOffset(index, PIT_RINGS, out);
    const layer = out.y;
    const r = Math.hypot(out.x, out.z);
    const y = this.layout.bowlSurfaceY(r) + SEED_SIZE * 0.75 + layer * PIT_RINGS.layerHeight;
    return out.set(center.x + out.x, y, center.z + out.z);
  }

  handSlot(player, bin, index, out = new THREE.Vector3()) {
    const center = this.layout.pitCenter(player, bin, this.tmp);
    heapOffset(index, PIT_RINGS, out);
    return out.set(center.x + out.x * 0.7, BOARD_TOP + HAND_HEIGHT + out.y * 0.09, center.z + out.z * 0.7);
  }

  storeSlot(player, index, out = new THREE.Vector3()) {
    const base = this.layout.calabashPosition(player);
    heapOffset(index, STORE_RINGS, out);
    const r = Math.hypot(out.x, out.z);
    const y = 0.1 + (r / 0.84) ** 2 * 0.3 + SEED_SIZE * 0.7 + out.y * STORE_RINGS.layerHeight;
    return out.set(base.x + out.x, y, base.z + out.z);
  }

  // --- State synchronisation ------------------------------------------------------

  reset(state) {
    // Abandon any playback in progress; its final sync must not overwrite the new position.
    this.generation = (this.generation ?? 0) + 1;
    this.skipping = true;
    this.playing = false;
    this.animator.finishAll();
    for (const mesh of this.allSeeds()) this.removeSeed(mesh);
    this.pits = [[], []];
    this.stores = [[], []];
    this.hand = [];
    this.sync(state);
  }

  *allSeeds() {
    for (const side of this.pits) for (const pit of side) yield* pit;
    for (const store of this.stores) yield* store;
    yield* this.hand;
  }

  /**
   * Makes the meshes match `state` exactly (counts per bin and captured seeds per player).
   * Seeds already in the right place stay put; others move (animated when `animate`).
   */
  sync(state, animate = false) {
    const size = state.columns * 2;
    const pool = [...this.hand];
    this.hand = [];
    for (const player of [SOUTH, NORTH]) {
      const pits = this.pits[player];
      pits.length = Math.max(pits.length, size);
      for (let bin = 0; bin < pits.length; bin++) {
        pits[bin] = pits[bin] ?? [];
        const target = bin < size ? state.bins[player][bin] : 0;
        while (pits[bin].length > target) pool.push(pits[bin].pop());
      }
      pits.length = size;
      const store = this.stores[player];
      while (store.length > state.captured[player]) pool.push(store.pop());
    }
    const moved = new Set();
    const take = () => {
      const mesh = pool.pop() ?? this.createSeed();
      moved.add(mesh);
      return mesh;
    };
    for (const player of [SOUTH, NORTH]) {
      for (let bin = 0; bin < size; bin++) {
        const pit = this.pits[player][bin];
        while (pit.length < state.bins[player][bin]) pit.push(take());
      }
      const store = this.stores[player];
      while (store.length < state.captured[player]) store.push(take());
    }
    for (const mesh of pool) this.removeSeed(mesh);

    const placeAll = [];
    for (const player of [SOUTH, NORTH]) {
      this.pits[player].forEach((pit, bin) =>
        pit.forEach((mesh, i) => placeAll.push([mesh, this.pitSlot(player, bin, i)])),
      );
      this.stores[player].forEach((mesh, i) => placeAll.push([mesh, this.storeSlot(player, i)]));
    }
    for (const [mesh, target] of placeAll) {
      if (animate && moved.has(mesh) && mesh.position.lengthSq() > 0) {
        const start = mesh.position.clone();
        this.animator.tween({
          duration: 320,
          update: (t) => {
            mesh.position.lerpVectors(start, target, t);
            mesh.position.y += Math.sin(Math.PI * t) * 0.4;
          },
        });
      } else {
        mesh.position.copy(target);
      }
    }
    this.board?.setCounts(state.bins);
  }

  // --- Move playback ------------------------------------------------------------------

  /** Plays rules-engine events, then snaps to `finalState`. Resolves when finished or skipped. */
  async play(events, finalState, { onEvent } = {}) {
    const generation = (this.generation = (this.generation ?? 0) + 1);
    this.skipping = false;
    this.playing = true;
    let sowIndex = 0;
    try {
      for (const ev of events) {
        if (this.skipping || generation !== this.generation) break;
        onEvent?.(ev);
        if (ev.type === 'pickup') await this.animatePickup(ev);
        else if (ev.type === 'sow') await this.animateSow(ev, sowIndex++);
        else if (ev.type === 'capture') await this.animateCapture(ev);
      }
    } finally {
      if (generation === this.generation) {
        this.sync(finalState);
        this.playing = false;
        this.skipping = false;
      }
    }
  }

  skip() {
    if (!this.playing) return;
    this.skipping = true;
    this.animator.finishAll();
  }

  animatePickup(ev) {
    const seeds = this.pits[ev.player][ev.bin].splice(0);
    this.hand.push(...seeds);
    this.handPit = { player: ev.player, bin: ev.bin };
    this.board.setCount(ev.player, ev.bin, 0);
    this.audio?.pickup?.(seeds.length);
    const starts = this.hand.map((m) => m.position.clone());
    const targets = this.hand.map((_, i) => this.handSlot(ev.player, ev.bin, i));
    const hand = this.hand.slice();
    return this.animator.tween({
      duration: 300,
      easing: ease.out,
      update: (t) => hand.forEach((m, i) => m.position.lerpVectors(starts[i], targets[i], t)),
    });
  }

  animateSow(ev, index) {
    const seed = this.hand.shift();
    if (!seed) return Promise.resolve();
    const pit = this.pits[ev.player][ev.bin];
    const target = this.pitSlot(ev.player, ev.bin, pit.length);
    pit.push(seed);
    const start = seed.position.clone();
    const rest = this.hand.slice();
    const restStarts = rest.map((m) => m.position.clone());
    const restTargets = rest.map((_, i) => this.handSlot(ev.player, ev.bin, i));
    const duration = Math.max(70, 240 * Math.pow(0.95, index));
    return this.animator
      .tween({
        duration,
        update: (t) => {
          seed.position.lerpVectors(start, target, t);
          seed.position.y += Math.sin(Math.PI * t) * 0.18;
          rest.forEach((m, i) => m.position.lerpVectors(restStarts[i], restTargets[i], t));
        },
      })
      .then(() => {
        this.board.setCount(ev.player, ev.bin, pit.length);
        this.audio?.drop?.(index);
      });
  }

  animateCapture(ev) {
    const tweens = [];
    let n = 0;
    for (const { bin } of ev.bins) {
      const seeds = this.pits[ev.from][bin].splice(0);
      this.board.setCount(ev.from, bin, 0);
      this.board.flash(ev.from, bin, 'capture', 900);
      for (const mesh of seeds) {
        const store = this.stores[ev.player];
        const target = this.storeSlot(ev.player, store.length);
        store.push(mesh);
        const start = mesh.position.clone();
        tweens.push(
          this.animator.tween({
            duration: 650,
            delay: n++ * 28,
            update: (t) => {
              mesh.position.lerpVectors(start, target, t);
              mesh.position.y += Math.sin(Math.PI * t) * 1.3;
            },
          }),
        );
      }
    }
    this.audio?.capture?.(ev.count);
    return Promise.all(tweens);
  }
}
