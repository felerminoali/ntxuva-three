/**
 * Mouse, touch and keyboard input. Converts pointer events into bin picks on the board,
 * distinguishing taps/clicks from camera drags.
 */
import * as THREE from 'three';
import { BOARD_TOP } from './board.js';

const CLICK_MOVE_TOLERANCE = 8;
const CLICK_TIME_LIMIT = 650;

export class InputHandler {
  /**
   * @param {{ canvas:HTMLCanvasElement, camera:THREE.Camera, board:import('./board.js').Board }} deps
   * @param {{ onPick:(pit:{player:number,bin:number}|null)=>void, onHover:(pit:object|null)=>void, onKey:(e:KeyboardEvent)=>void }} handlers
   */
  constructor({ canvas, camera, board }, handlers) {
    this.canvas = canvas;
    this.camera = camera;
    this.board = board;
    this.handlers = handlers;
    this.enabled = true;
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_TOP);
    this.pointer = new THREE.Vector2();
    this.down = null;
    this.hovered = null;

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerleave', () => this.setHover(null));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  pitFromEvent(e) {
    const layout = this.board.layout;
    if (!layout) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null;
    return layout.pitAtPoint(hit);
  }

  onDown(e) {
    if (!e.isPrimary) {
      this.down = null; // multi-touch gestures (pinch zoom) are never clicks
      return;
    }
    this.down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
  }

  onUp(e) {
    const d = this.down;
    this.down = null;
    if (!d || !this.enabled || !e.isPrimary) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > CLICK_MOVE_TOLERANCE || performance.now() - d.t > CLICK_TIME_LIMIT) return;
    if (e.button !== undefined && e.button !== 0) return;
    const pit = this.pitFromEvent(e);
    if (e.pointerType !== 'mouse') this.setHover(pit);
    this.handlers.onPick(pit);
  }

  onMove(e) {
    if (!this.enabled || e.pointerType !== 'mouse') return;
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_MOVE_TOLERANCE) {
      this.setHover(null);
      return;
    }
    this.setHover(this.pitFromEvent(e));
  }

  setHover(pit) {
    const same =
      (pit === null && this.hovered === null) ||
      (pit && this.hovered && pit.player === this.hovered.player && pit.bin === this.hovered.bin);
    if (same) return;
    this.hovered = pit;
    this.canvas.style.cursor = pit ? 'pointer' : '';
    this.handlers.onHover(pit);
  }

  onKeyDown(e) {
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('input, select, textarea')) return;
    this.handlers.onKey(e);
  }
}
