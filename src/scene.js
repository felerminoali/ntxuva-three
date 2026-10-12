/**
 * Three.js renderer, scene, camera, lighting and the surrounding environment (scenario).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { skyTexture } from './textures.js';
import { Animator, ease } from './animator.js';
import { BOARD_DEPTH } from './board.js';
import { DEFAULT_SCENARIO, SCENARIOS, SCENARIO_DEFS } from './scenarios.js';

export { SCENARIOS };

const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 512 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048 },
};

export class Stage {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xc98d62, 28, 70);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(0, 12, 12);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minPolarAngle = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.target.set(0, 0.3, 0);

    this.cameraAnimator = new Animator();
    this.boardWidth = 17;
    this.viewSide = 1;

    this.time = 0;
    this.scenarioId = null;
    this.env = null;
    this.envDisposables = [];

    this.addLights();
    this.addCloth();
    this.setScenario(DEFAULT_SCENARIO);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  addLights() {
    this.hemi = new THREE.HemisphereLight(0xffe2bf, 0x6b3a22, 0.9);
    this.scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(0xffd6a0, 2.4);
    sun.position.set(-9, 16, 7);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    const cam = sun.shadow.camera;
    cam.left = -16;
    cam.right = 16;
    cam.top = 10;
    cam.bottom = -10;
    cam.near = 1;
    cam.far = 60;
    this.scene.add(sun);
    this.sun = sun;

    this.fill = new THREE.DirectionalLight(0x9fb7ff, 0.35);
    this.fill.position.set(8, 6, -10);
    this.scene.add(this.fill);

    // Soft shadowless light from almost straight above, so the bowl interiors stay readable.
    this.lift = new THREE.DirectionalLight(0xfff1dc, 0.35);
    this.lift.position.set(1, 12, 3);
    this.scene.add(this.lift);
  }

  /** The mat or cloth under the board; its texture comes from the scenario. */
  addCloth() {
    this.cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    );
    this.cloth.rotation.x = -Math.PI / 2;
    this.cloth.position.y = 0.004;
    this.cloth.receiveShadow = true;
    this.scene.add(this.cloth);
    this.clothTile = 2.5;
  }

  /**
   * Switches the environment (sky, fog, lights, ground, cloth and props) instantly. The board
   * and seeds are untouched. Unknown ids fall back to 'village'.
   */
  setScenario(id) {
    if (!SCENARIO_DEFS[id]) id = DEFAULT_SCENARIO;
    if (id === this.scenarioId) return id;
    const def = SCENARIO_DEFS[id];
    this.disposeEnvironment();
    this.scenarioId = id;

    const sky = skyTexture(def.sky);
    this.scene.background = sky;
    this.scene.fog.color.setHex(def.fog);
    this.renderer.toneMappingExposure = def.exposure;

    const [skyColor, groundColor, hemiIntensity] = def.hemi;
    this.hemi.color.setHex(skyColor);
    this.hemi.groundColor.setHex(groundColor);
    this.hemi.intensity = hemiIntensity;
    for (const [light, cfg, dist] of [
      [this.sun, def.sun, 25],
      [this.fill, def.fill, 14],
    ]) {
      light.color.setHex(cfg.color);
      light.intensity = cfg.intensity;
      light.position.set(...cfg.dir).normalize().multiplyScalar(dist);
    }
    this.lift.intensity = def.lift;

    const cloth = def.cloth();
    this.cloth.material.map = cloth.map;
    this.cloth.material.roughness = cloth.roughness;
    this.cloth.material.needsUpdate = true;
    this.clothTile = cloth.tile;

    const env = def.build();
    this.env = env;
    this.scene.add(env.group);
    env.group.traverse((obj) => {
      if (obj.geometry) this.envDisposables.push(obj.geometry);
      const mats = obj.material ? [].concat(obj.material) : [];
      for (const m of mats) {
        this.envDisposables.push(m);
        if (m.map) this.envDisposables.push(m.map);
      }
      if (obj.isLight) this.envDisposables.push(obj);
    });
    this.envDisposables.push(sky, cloth.map);
    this.layoutEnvironment();
    return id;
  }

  disposeEnvironment() {
    if (this.env) this.scene.remove(this.env.group);
    this.env = null;
    for (const d of new Set(this.envDisposables)) d.dispose?.();
    this.envDisposables = [];
  }

  layoutEnvironment() {
    const width = this.boardWidth;
    const matW = width + 5.2;
    const matD = BOARD_DEPTH + 3.2;
    this.cloth.scale.set(matW, matD, 1);
    this.cloth.material.map?.repeat.set(matW / this.clothTile, matD / this.clothTile);
    this.env?.group.traverse((obj) => obj.userData.layout?.(width));
  }

  setQuality(name) {
    const q = QUALITY[name] ?? QUALITY.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.mapSize.x !== q.shadowSize) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  setBoardWidth(width) {
    this.boardWidth = width;
    const half = width / 2 + 3;
    const cam = this.sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.updateProjectionMatrix();
    this.layoutEnvironment();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Re-frame when the phone rotates between portrait and landscape.
    const portrait = this.isPortrait();
    if (this.portrait !== undefined && this.portrait !== portrait) this.frame(this.viewSide, true);
    this.portrait = portrait;
  }

  isPortrait() {
    return this.camera.aspect < 0.9;
  }

  /** Camera position that frames the whole board from the given side (1 = South, -1 = North). */
  framing(side = this.viewSide) {
    const aspect = this.camera.aspect;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const target = new THREE.Vector3(0, 0.3, 0);
    if (this.isPortrait()) {
      // Narrow screens: look down the length of the board so its long side runs
      // top-to-bottom, with the viewer's rows on the right-hand side.
      const elevation = 1.25;
      const halfLen = this.boardWidth / 2 + 0.6;
      const halfDepth = BOARD_DEPTH / 2 + 0.35;
      // Leave room for the top bar and the bottom buttons (~78% of the height is free).
      const distLen = (halfLen * Math.sin(elevation)) / (Math.tan(vfov / 2) * 0.78) + halfLen * Math.cos(elevation) * 0.5;
      const distDepth = halfDepth / Math.tan(hfov / 2);
      const dist = THREE.MathUtils.clamp(Math.max(distLen, distDepth), 7, 80);
      const position = new THREE.Vector3(-Math.cos(elevation) * dist * side, Math.sin(elevation) * dist, 0).add(target);
      return { position, target };
    }
    const elevation = 0.95; // radians above the horizon
    const halfW = this.boardWidth / 2 + 2.6;
    const distW = halfW / Math.tan(hfov / 2);
    const distD = 4.6 / Math.tan(vfov / 2);
    const dist = THREE.MathUtils.clamp(Math.max(distW, distD), 7, 80);
    const position = new THREE.Vector3(0, Math.sin(elevation) * dist, Math.cos(elevation) * dist * side).add(target);
    return { position, target };
  }

  /** Moves the camera to the default view of `side` (smoothly unless `instant`). */
  frame(side = this.viewSide, instant = false) {
    this.viewSide = side;
    this.controls.maxDistance = Math.max(40, this.framing(side).position.length() * 1.6);
    const { position, target } = this.framing(side);
    // Keep the fog behind the board however far the camera has to sit (narrow portrait screens).
    const dist = position.distanceTo(target);
    this.scene.fog.near = Math.max(28, dist + 4);
    this.scene.fog.far = Math.max(70, dist * 2.4);
    if (instant) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      return Promise.resolve();
    }
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    // Swing around the board instead of passing straight over it when switching sides.
    const startAngle = Math.atan2(startPos.x - startTarget.x, startPos.z - startTarget.z);
    let endAngle = Math.atan2(position.x - target.x, position.z - target.z);
    if (Math.abs(endAngle - startAngle) > Math.PI) endAngle += endAngle < startAngle ? Math.PI * 2 : -Math.PI * 2;
    const startFlat = Math.hypot(startPos.x - startTarget.x, startPos.z - startTarget.z);
    const endFlat = Math.hypot(position.x - target.x, position.z - target.z);
    return this.cameraAnimator.tween({
      duration: 900,
      easing: ease.inOut,
      update: (t) => {
        const angle = startAngle + (endAngle - startAngle) * t;
        const flat = startFlat + (endFlat - startFlat) * t;
        const y = startPos.y + (position.y - startPos.y) * t;
        this.controls.target.lerpVectors(startTarget, target, t);
        this.camera.position.set(
          this.controls.target.x + Math.sin(angle) * flat,
          y,
          this.controls.target.z + Math.cos(angle) * flat,
        );
      },
    });
  }

  update(dt) {
    this.time += dt;
    this.env?.update?.(this.time);
    this.cameraAnimator.update(dt);
    this.controls.update();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
