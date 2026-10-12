/**
 * Selectable environments around the board. Everything is procedural (canvas textures and
 * simple low-poly geometry) and kept deliberately light so it never competes with the board.
 *
 * Each scenario describes its sky, fog, lights and the cloth under the board, plus a
 * `build()` that returns a group holding the ground and props. Props that should sit beside
 * the board set `userData.layout(width)`, which the Stage calls whenever the board width changes.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  awningTexture,
  capulanaTexture,
  crateTexture,
  earthTexture,
  grassTexture,
  matTexture,
  pavingTexture,
  sandTexture,
  seaTexture,
} from './textures.js';

export const SCENARIOS = [
  { id: 'village', nameKey: 'scenario.village' },
  { id: 'beach', nameKey: 'scenario.beach' },
  { id: 'market', nameKey: 'scenario.market' },
  { id: 'savanna', nameKey: 'scenario.savanna' },
];

export const DEFAULT_SCENARIO = 'village';

// --- Helpers -------------------------------------------------------------------

function prng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const std = (opts) => new THREE.MeshStandardMaterial(opts);

function mesh(geometry, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function groundDisc(map, radius, tileSize, roughness = 1) {
  map.repeat.set((radius * 2) / tileSize, (radius * 2) / tileSize);
  const ground = mesh(new THREE.CircleGeometry(radius, 64), std({ map, roughness }), { cast: false });
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

/** Places `obj` beside the board: x = side * (boardWidth / 2 + dx). */
function besideBoard(obj, side, dx, z, y = 0) {
  obj.userData.layout = (width) => obj.position.set(side * (width / 2 + dx), y, z);
  return obj;
}

// --- Village: red laterite, reed mat, clay pot and a mango tree ------------------

function buildVillage() {
  const group = new THREE.Group();
  group.add(groundDisc(earthTexture(), 80, 160 / 18));

  const pebbleGeo = new THREE.DodecahedronGeometry(1, 0);
  const pebbleMat = std({ color: 0x8c7a68, roughness: 0.9, flatShading: true });
  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, 60);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const r = prng(3);
  for (let i = 0; i < 60; i++) {
    const angle = r() * Math.PI * 2;
    const dist = 14 + r() * 22;
    p.set(Math.cos(angle) * dist, 0.02, Math.sin(angle) * dist * 0.8);
    q.setFromEuler(new THREE.Euler(r(), r() * 3, r()));
    const k = 0.08 + r() * 0.25;
    s.set(k * 1.4, k * 0.6, k);
    m.compose(p, q, s);
    pebbles.setMatrixAt(i, m);
  }
  pebbles.castShadow = true;
  pebbles.receiveShadow = true;
  group.add(pebbles);

  const potProfile = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const radius = 0.25 + Math.sin(t * Math.PI) * 0.75 - (t > 0.85 ? (t - 0.85) * 1.5 : 0);
    potProfile.push(new THREE.Vector2(Math.max(0.3, radius), t * 1.6));
  }
  const pot = mesh(
    new THREE.LatheGeometry(potProfile, 40),
    std({ color: 0x8e4a2c, roughness: 0.85, side: THREE.DoubleSide }),
  );
  group.add(besideBoard(pot, -1, 5, -6));

  // Mango tree: a sturdy trunk under a dense, rounded dark-green crown.
  const tree = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.35, 0.55, 3.2, 7), std({ color: 0x5a3b26, roughness: 0.95 }));
  trunk.position.y = 1.6;
  tree.add(trunk);
  const blobs = [];
  const rc = prng(17);
  for (let i = 0; i < 7; i++) {
    const g = new THREE.IcosahedronGeometry(1.5 + rc() * 0.8, 1);
    const a = (i / 7) * Math.PI * 2;
    g.translate(Math.cos(a) * 1.4, 4.2 + rc() * 1.2, Math.sin(a) * 1.4);
    blobs.push(g);
  }
  const top = new THREE.IcosahedronGeometry(2, 1);
  top.translate(0, 5.4, 0);
  blobs.push(top);
  const crownGeo = mergeGeometries(blobs);
  blobs.forEach((g) => g.dispose());
  tree.add(mesh(crownGeo, std({ color: 0x2f5a26, roughness: 0.9, flatShading: true })));
  group.add(besideBoard(tree, 1, 4.5, -13));

  return { group };
}

// --- Beach: Indian Ocean island beach with palms and dhows -----------------------

function palmGeometries() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.25, 2, 0),
    new THREE.Vector3(0.8, 4.2, 0),
    new THREE.Vector3(1.6, 6.2, 0),
  ]);
  const trunk = new THREE.TubeGeometry(curve, 12, 0.2, 6, false);
  const fronds = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const leaf = new THREE.PlaneGeometry(3.2, 0.8, 8, 1);
    leaf.translate(1.6, 0, 0);
    leaf.rotateX(-Math.PI / 2);
    const pos = leaf.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const t = pos.getX(v) / 3.2;
      pos.setY(v, 0.7 * t - 1.9 * t * t);
      pos.setZ(v, pos.getZ(v) * (1 - t * 0.85));
    }
    leaf.computeVertexNormals();
    leaf.rotateZ(0.15);
    leaf.rotateY((i / count) * Math.PI * 2 + i * 0.3);
    leaf.translate(1.6, 6.2, 0);
    fronds.push(leaf);
  }
  const crown = mergeGeometries(fronds);
  fronds.forEach((g) => g.dispose());
  return { trunk, crown };
}

function dhowGeometries() {
  const hull = new THREE.BoxGeometry(3, 0.6, 0.9, 8, 1, 1);
  const pos = hull.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const k = pos.getX(v) / 1.5;
    pos.setZ(v, pos.getZ(v) * (1 - k * k * 0.85));
    if (pos.getY(v) > 0) pos.setY(v, pos.getY(v) + k * k * 0.3);
  }
  hull.computeVertexNormals();
  const shape = new THREE.Shape();
  shape.moveTo(-1.2, 0.5);
  shape.lineTo(1.3, 0.9);
  shape.lineTo(-0.9, 3.6);
  shape.closePath();
  const sail = new THREE.ShapeGeometry(shape);
  const mast = new THREE.CylinderGeometry(0.04, 0.05, 3.2, 5);
  mast.translate(0, 1.6, 0);
  return { hull, sail, mast };
}

function buildBeach() {
  const group = new THREE.Group();
  // A long, narrow strip of sand (an ellipse) so a band of sea shows just behind the board.
  const sandRadius = 22;
  const seaRadius = 160;
  const squash = 8 / sandRadius;
  const sand = groundDisc(sandTexture(), sandRadius, 8);
  sand.material.map.repeat.y *= squash;
  sand.scale.y = squash;
  group.add(sand);
  const sea = mesh(
    new THREE.CircleGeometry(seaRadius, 64),
    std({ map: seaTexture(sandRadius / seaRadius), roughness: 0.3, metalness: 0.05 }),
    { cast: false },
  );
  sea.rotation.x = -Math.PI / 2;
  sea.scale.y = squash;
  sea.position.y = -0.03;
  group.add(sea);

  const { trunk, crown } = palmGeometries();
  const trunkMat = std({ color: 0x8a6a48, roughness: 0.95, flatShading: true });
  const frondMat = std({ color: 0x3f7a2e, roughness: 0.8, side: THREE.DoubleSide });
  // Tall props sit well behind the board, where they frame the view without covering it.
  const palms = [
    [-1, 2.5, -11, 0.4, 0.9],
    [-1, 6, -14, 1.2, 1.05],
    [1, 4, -13, 2.6, 1],
  ];
  for (const [side, dx, z, rot, scale] of palms) {
    const palm = new THREE.Group();
    palm.add(mesh(trunk, trunkMat), mesh(crown, frondMat));
    palm.rotation.y = rot;
    palm.scale.setScalar(scale);
    group.add(besideBoard(palm, side, dx, z));
  }

  const { hull, sail, mast } = dhowGeometries();
  const hullMat = std({ color: 0x5a3b22, roughness: 0.8 });
  const sailMat = std({ color: 0xf1ead8, roughness: 0.9, side: THREE.DoubleSide });
  const boats = [];
  for (const [x, z, rot, scale, phase] of [
    [5, -13, 0.3, 0.55, 0],
    [-30, -38, 2.2, 1, 2],
    [26, 30, -0.8, 1, 4],
  ]) {
    const boat = new THREE.Group();
    boat.add(mesh(hull, hullMat, { cast: false }), mesh(sail, sailMat, { cast: false }), mesh(mast, hullMat, { cast: false }));
    boat.position.set(x, 0.1, z);
    boat.rotation.y = rot;
    boat.scale.setScalar(scale);
    boat.userData.phase = phase;
    boats.push(boat);
    group.add(boat);
  }

  const update = (timeMs) => {
    for (const boat of boats) {
      const t = timeMs / 1000 + boat.userData.phase;
      boat.position.y = 0.06 + Math.sin(t * 1.1) * 0.05;
      boat.rotation.z = Math.sin(t * 0.9) * 0.05;
    }
  };
  return { group, update };
}

// --- Market: Maputo market at dusk with stalls, crates and string lights ---------

function buildMarket() {
  const group = new THREE.Group();
  group.add(groundDisc(pavingTexture(), 80, 4.8, 0.95));

  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.7, 6);
  const woodMat = std({ color: 0x6e4a2e, roughness: 0.85 });
  const counterGeo = new THREE.BoxGeometry(3, 0.9, 1.3);
  const roofGeo = new THREE.BoxGeometry(3.5, 0.05, 2.5);
  const crateGeo = new THREE.BoxGeometry(0.7, 0.5, 0.5);
  const crateMat = std({ map: crateTexture(), roughness: 0.9 });
  const fruitGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const fruitMat = std({ roughness: 0.6 });
  const fruitColors = [0xf28c1e, 0xd8321e, 0x6aa32b, 0xf2c230].map((c) => new THREE.Color(c));

  const stall = (colors, seed) => {
    const s = new THREE.Group();
    for (const [x, z] of [
      [-1.5, -1],
      [1.5, -1],
      [-1.5, 1],
      [1.5, 1],
    ]) {
      const pole = mesh(poleGeo, woodMat);
      pole.position.set(x, 1.35, z);
      s.add(pole);
    }
    const counter = mesh(counterGeo, woodMat);
    counter.position.set(0, 0.45, 0.2);
    s.add(counter);
    const roof = mesh(roofGeo, std({ map: awningTexture(colors), roughness: 0.9 }));
    roof.position.set(0, 2.72, 0);
    roof.rotation.x = 0.14;
    s.add(roof);
    const fruit = new THREE.InstancedMesh(fruitGeo, fruitMat, 30);
    const r = prng(seed);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 30; i++) {
      const heap = i % 3;
      m.makeTranslation(-0.9 + heap * 0.9 + (r() - 0.5) * 0.5, 1.0 + r() * 0.12, 0.2 + (r() - 0.5) * 0.7);
      fruit.setMatrixAt(i, m);
      fruit.setColorAt(i, fruitColors[(heap + seed) % fruitColors.length]);
    }
    fruit.castShadow = true;
    s.add(fruit);
    for (const [x, y, z, ry] of [
      [2.1, 0.25, 1.5, 0.2],
      [2.0, 0.75, 1.5, 0.05],
      [2.3, 0.25, 2.1, -0.3],
    ]) {
      const crate = mesh(crateGeo, crateMat);
      crate.position.set(x, y, z);
      crate.rotation.y = ry;
      s.add(crate);
    }
    return s;
  };

  const left = stall(['#c8242b', '#f4ead8'], 1);
  const right = stall(['#1c3f94', '#f2a516', '#127a4a'], 2);
  right.scale.x = -1;
  group.add(besideBoard(left, -1, 4.5, -6.5), besideBoard(right, 1, 4.5, -6.5));

  // String of warm bulbs hanging between the two stalls, plus one lamp to light the scene.
  const bulbs = 26;
  const bulbMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd892, toneMapped: false }),
    bulbs,
  );
  const wireGeo = new THREE.BufferGeometry().setFromPoints(new Array(bulbs).fill(0).map(() => new THREE.Vector3()));
  const wire = new THREE.Line(wireGeo, new THREE.LineBasicMaterial({ color: 0x1a1410 }));
  const lamp = new THREE.PointLight(0xffb468, 30, 30, 2);
  const lights = new THREE.Group();
  lights.add(bulbMesh, wire, lamp);
  lights.userData.layout = (width) => {
    const half = width / 2 + 3;
    const m = new THREE.Matrix4();
    const pos = wireGeo.attributes.position;
    for (let i = 0; i < bulbs; i++) {
      const t = i / (bulbs - 1);
      const x = -half + t * half * 2;
      const y = 2.75 - Math.sin(t * Math.PI) * 0.9;
      m.makeTranslation(x, y - 0.06, -7.5);
      bulbMesh.setMatrixAt(i, m);
      pos.setXYZ(i, x, y, -7.5);
    }
    bulbMesh.instanceMatrix.needsUpdate = true;
    pos.needsUpdate = true;
    wireGeo.computeBoundingSphere();
    bulbMesh.computeBoundingSphere();
    lamp.position.set(0, 2.2, -6.5);
  };
  group.add(lights);

  const crates = new THREE.Group();
  for (const [x, y, z, ry] of [
    [0, 0.25, 0, 0.1],
    [0.75, 0.25, 0.1, -0.15],
    [0.35, 0.75, 0.05, 0.35],
  ]) {
    const crate = mesh(crateGeo, crateMat);
    crate.position.set(x, y, z);
    crate.rotation.y = ry;
    crates.add(crate);
  }
  group.add(besideBoard(crates, 1, 3.2, 4.5));
  return { group };
}

// --- Savanna: Gorongosa grassland at sunset with acacias ------------------------

function buildSavanna() {
  const group = new THREE.Group();
  group.add(groundDisc(grassTexture(), 80, 6));

  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.2, 3.2, 6);
  trunkGeo.translate(0, 1.6, 0);
  const branchGeo = new THREE.CylinderGeometry(0.05, 0.09, 1.6, 5);
  branchGeo.translate(0, 0.8, 0);
  const crownGeo = new THREE.SphereGeometry(1, 9, 5);
  crownGeo.scale(3.2, 0.45, 2.6);
  const barkMat = std({ color: 0x3a2a1e, roughness: 1 });
  const leafMat = std({ color: 0x3b4a20, roughness: 0.95, flatShading: true });
  const r = prng(29);
  const near = [
    [-1, 3, -12, 1.1],
    [1, 6, -15, 1.3],
  ];
  for (let i = 0; i < 7 + near.length; i++) {
    const tree = new THREE.Group();
    const trunk = mesh(trunkGeo, barkMat);
    trunk.rotation.z = (r() - 0.5) * 0.3;
    tree.add(trunk);
    for (const dir of [-1, 1]) {
      const branch = mesh(branchGeo, barkMat);
      branch.position.set(0, 2.6, 0);
      branch.rotation.z = dir * (0.5 + r() * 0.3);
      tree.add(branch);
    }
    const crown = mesh(crownGeo, leafMat);
    crown.position.y = 3.6;
    tree.add(crown);
    tree.rotation.y = r() * Math.PI;
    if (i < near.length) {
      const [side, dx, z, scale] = near[i];
      tree.scale.setScalar(scale);
      group.add(besideBoard(tree, side, dx, z));
      continue;
    }
    const angle = (i / 7) * Math.PI * 2 + r() * 0.6;
    const dist = 26 + r() * 26;
    tree.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    tree.scale.setScalar(0.9 + r() * 0.6);
    group.add(tree);
  }

  // Grass clumps: a few thin blades splayed outward, instanced.
  const blades = [];
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.ConeGeometry(0.05, 0.9, 3);
    blade.translate(0, 0.45, 0);
    blade.rotateZ(0.35 + (i % 2) * 0.2);
    blade.rotateY((i / 6) * Math.PI * 2);
    blades.push(blade);
  }
  const clumpGeo = mergeGeometries(blades);
  blades.forEach((g) => g.dispose());
  const tufts = new THREE.InstancedMesh(
    clumpGeo,
    std({ color: 0xd8b25e, roughness: 1, flatShading: true }),
    260,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < 260; i++) {
    // Scatter around the board but never on the widest (24-column) mat.
    do p.set((r() - 0.5) * 70, 0, (r() - 0.5) * 60);
    while (Math.abs(p.x) < 16.5 && Math.abs(p.z) < 5.5);
    const k = 0.6 + r() * 0.9;
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.2, r() * 3, (r() - 0.5) * 0.2));
    s.set(k, k, k);
    m.compose(p, q, s);
    tufts.setMatrixAt(i, m);
  }
  group.add(tufts);

  const moundProfile = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    moundProfile.push(new THREE.Vector2(Math.max(0.05, 1.1 * Math.pow(1 - t, 1.4)), t * 2.4));
  }
  const mound = mesh(new THREE.LatheGeometry(moundProfile, 9), std({ color: 0x9a5a3a, roughness: 1, flatShading: true }));
  group.add(besideBoard(mound, 1, 6, -7));
  return { group };
}

// --- Scenario table ---------------------------------------------------------------

/**
 * Lighting and atmosphere per scenario. Directions are where each light comes from.
 * `lift` is a soft, shadowless overhead light that keeps the bowl interiors readable.
 */
export const SCENARIO_DEFS = {
  village: {
    sky: [
      [0, '#2c3e57'],
      [0.45, '#c9875a'],
      [0.62, '#e8b27a'],
      [1, '#7a4a30'],
    ],
    fog: 0xc98d62,
    exposure: 1.05,
    hemi: [0xffe2bf, 0x6b3a22, 0.9],
    sun: { color: 0xffd6a0, intensity: 2.4, dir: [-9, 16, 7] },
    fill: { color: 0x9fb7ff, intensity: 0.35, dir: [8, 6, -10] },
    lift: 0.35,
    cloth: () => ({ map: matTexture(), tile: 2.5, roughness: 0.95 }),
    build: buildVillage,
  },
  beach: {
    sky: [
      [0, '#1f6fc4'],
      [0.35, '#5aaee6'],
      [0.55, '#a9daf0'],
      [0.65, '#cfe8ef'],
      [1, '#e6d8b8'],
    ],
    fog: 0xc4e3ec,
    exposure: 1.0,
    hemi: [0xd6ecff, 0xd4bd8f, 1.05],
    sun: { color: 0xfff3df, intensity: 2.8, dir: [-6, 20, 8] },
    fill: { color: 0xbfe6ff, intensity: 0.4, dir: [8, 8, -10] },
    lift: 0.3,
    cloth: () => ({
      map: matTexture({ palette: ['#e2c992', '#d9bd84', '#ead39f', '#d4b47a'], stripes: ['#1f8a9a', '#2b4f7a'], seed: 23 }),
      tile: 2.5,
      roughness: 0.95,
    }),
    build: buildBeach,
  },
  market: {
    sky: [
      [0, '#141a3d'],
      [0.32, '#4a2f63'],
      [0.52, '#b5576a'],
      [0.66, '#f08a50'],
      [1, '#3a2a30'],
    ],
    fog: 0x7d5260,
    exposure: 1.12,
    hemi: [0xffc7a3, 0x3b2c3a, 0.8],
    sun: { color: 0xffa66b, intensity: 1.7, dir: [-12, 11, 5] },
    fill: { color: 0x8090ff, intensity: 0.45, dir: [9, 7, -9] },
    lift: 0.45,
    cloth: () => ({ map: capulanaTexture(), tile: 4, roughness: 0.9 }),
    build: buildMarket,
  },
  savanna: {
    sky: [
      [0, '#2d2a5c'],
      [0.3, '#8a4a78'],
      [0.47, '#e0707a'],
      [0.6, '#f7a35c'],
      [0.67, '#ffd48a'],
      [1, '#8a5a30'],
    ],
    fog: 0xdc9466,
    exposure: 1.05,
    hemi: [0xffe0b8, 0x7a5a2a, 0.85],
    sun: { color: 0xffc58a, intensity: 2.3, dir: [-14, 10, -4] },
    fill: { color: 0xa48cff, intensity: 0.35, dir: [9, 6, 9] },
    lift: 0.4,
    cloth: () => ({
      map: matTexture({ palette: ['#c9a067', '#bf955c', '#d1a970', '#b88d55'], stripes: ['#5a2a18', '#1f1a14'], seed: 37 }),
      tile: 2.5,
      roughness: 0.95,
    }),
    build: buildSavanna,
  },
};
