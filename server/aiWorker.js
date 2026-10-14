/** Worker thread for the server's computer players (see aiPool.js). */
import { parentPort } from 'node:worker_threads';
import { chooseAction } from '../src/ai.js';

parentPort.on('message', ({ id, state, skill }) => {
  try {
    parentPort.postMessage({ id, action: chooseAction(state, { difficulty: skill }) });
  } catch (err) {
    parentPort.postMessage({ id, error: String(err?.message ?? err) });
  }
});
