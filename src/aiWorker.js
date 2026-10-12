import { chooseAction } from './ai.js';

self.onmessage = ({ data }) => {
  try {
    const action = chooseAction(data.state, { difficulty: data.difficulty });
    self.postMessage({ id: data.id, action });
  } catch (err) {
    self.postMessage({ id: data.id, error: String(err?.message ?? err) });
  }
};
