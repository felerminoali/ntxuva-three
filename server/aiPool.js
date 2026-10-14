/**
 * Runs computer-player searches in worker threads so a deep search never blocks the server's
 * event loop. With `size: 0` (or if workers cannot start) searches run inline.
 */
import { Worker } from 'node:worker_threads';
import { chooseAction } from '../src/ai.js';

export function createAiPool({ size = 1, log = () => {} } = {}) {
  const workers = [];
  const pending = new Map();
  let nextId = 1;
  let closed = false;

  const inline = (state, skill) => chooseAction(state, { difficulty: skill });

  function spawn() {
    const worker = new Worker(new URL('./aiWorker.js', import.meta.url));
    const entry = { worker, jobs: new Set() };
    worker.on('message', ({ id, action, error }) => {
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      entry.jobs.delete(id);
      if (error) job.reject(new Error(error));
      else job.resolve(action);
    });
    worker.on('error', (err) => {
      log(`AI worker failed: ${err.message}`);
      const i = workers.indexOf(entry);
      if (i >= 0) workers.splice(i, 1);
      for (const id of entry.jobs) {
        const job = pending.get(id);
        pending.delete(id);
        try {
          job?.resolve(inline(job.state, job.skill));
        } catch (e) {
          job?.reject(e);
        }
      }
    });
    worker.unref();
    workers.push(entry);
  }

  for (let i = 0; i < size; i++) {
    try {
      spawn();
    } catch (err) {
      log(`AI workers unavailable, searching inline: ${err.message}`);
      break;
    }
  }

  return {
    /** @returns {Promise<{type:'move'|'extra', bin:number}|null>} */
    choose(state, skill) {
      if (closed) return Promise.reject(new Error('closed'));
      if (workers.length === 0) {
        return new Promise((resolve, reject) =>
          setImmediate(() => {
            try {
              resolve(inline(state, skill));
            } catch (err) {
              reject(err);
            }
          }),
        );
      }
      const entry = workers.reduce((a, b) => (b.jobs.size < a.jobs.size ? b : a));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, state, skill });
        entry.jobs.add(id);
        entry.worker.postMessage({ id, state, skill });
      });
    },
    async close() {
      closed = true;
      for (const job of pending.values()) job.reject(new Error('closed'));
      pending.clear();
      await Promise.all(workers.map((w) => w.worker.terminate()));
      workers.length = 0;
    },
  };
}
