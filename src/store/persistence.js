// localStorage helpers. Every call is wrapped: storage can be unavailable
// (private mode, quota) and the app must keep working without it.

const KEYS = { current: 'flowforge.current', saved: 'flowforge.saved', runs: 'flowforge.runs' };

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadCurrent = () => read(KEYS.current, null);
export const saveCurrent = (wf) => write(KEYS.current, wf);

export const loadSaved = () => read(KEYS.saved, {});
export function saveNamed(wf) {
  const all = loadSaved();
  all[wf.id] = { ...wf, savedAt: Date.now() };
  return write(KEYS.saved, all);
}
export function deleteNamed(id) {
  const all = loadSaved();
  delete all[id];
  write(KEYS.saved, all);
}

export const loadRuns = () => read(KEYS.runs, []);
export const saveRuns = (runs) => write(KEYS.runs, runs);
