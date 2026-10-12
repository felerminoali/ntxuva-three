/**
 * Runs the AI search in a Web Worker so the 3D view stays smooth while it thinks.
 * Falls back to the main thread if workers are unavailable.
 */
import { chooseAction } from './ai.js';

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./aiWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.error) entry.reject(new Error(data.error));
      else entry.resolve(data.action);
    };
    worker.onerror = (e) => {
      console.warn('AI worker failed, using main thread instead.', e.message);
      for (const [id, entry] of pending) {
        pending.delete(id);
        entry.fallback();
      }
      worker.terminate();
      worker = false;
    };
  } catch {
    worker = false;
  }
  return worker;
}

/** @returns {Promise<{type:'move'|'extra', bin:number}|null>} */
export function requestAiAction(state, difficulty) {
  const w = getWorker();
  const local = () => chooseAction(state, { difficulty });
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(local()), 0));
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, fallback: () => resolve(local()) });
    w.postMessage({ id, state, difficulty });
  });
}
