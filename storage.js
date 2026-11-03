const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';
const DB = DEMO ? 'echo-recordings-demo' : 'echo-recordings';
const STORE = 'clips';
const PROGRESS = DEMO ? 'echo-progress-demo' : 'echo-progress';
export const parentPinKey = DEMO ? 'echo-parent-pin-demo' : 'echo-parent-pin';
let clipEpoch = 0;
let deleting = false;
let deletion = null;
export function saveProgress(progress) { localStorage.setItem(PROGRESS, JSON.stringify(progress)); }
export function loadProgress() { try { return JSON.parse(localStorage.getItem(PROGRESS) ?? 'null'); } catch { return null; } }
export function retryKey(sessionId, sentenceId) { return `echo-${DEMO ? 'demo-' : ''}retry:${sessionId}:${sentenceId}`; }
export function failures(sessionId, sentenceId) { return Number(localStorage.getItem(retryKey(sessionId, sentenceId)) ?? 0); }
export function setFailures(sessionId, sentenceId, value) { localStorage.setItem(retryKey(sessionId, sentenceId), String(value)); }
export function clearDemoProgress() {
  if (!DEMO) return;
  localStorage.removeItem(PROGRESS);
  localStorage.removeItem(parentPinKey);
  localStorage.removeItem('echo-active-ms-demo');
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key?.startsWith('echo-demo-retry:')) localStorage.removeItem(key);
  }
}
export function dateKey(at) {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function markCompletedDay(days, at) { return [...new Set([...days, dateKey(at)])].sort(); }
export function consecutiveDays(days, at) {
  const known = new Set(days), cursor = new Date(at);
  cursor.setHours(12, 0, 0, 0);
  let count = 0;
  while (known.has(dateKey(cursor))) { count++; cursor.setDate(cursor.getDate() - 1); }
  return count;
}
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function recordingEpoch() { return clipEpoch; }
export async function saveClip(id, blob, epoch = clipEpoch) {
  if (deleting || epoch !== clipEpoch) return false;
  const db = await openDb();
  try {
    if (deleting || epoch !== clipEpoch) return false;
    await new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    return epoch === clipEpoch;
  }
  finally { db.close(); }
}
export async function loadClip(id) {
  if (deleting) return null;
  const epoch = clipEpoch;
  const db = await openDb();
  try {
    if (deleting || epoch !== clipEpoch) return null;
    const blob = await new Promise((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).get(id); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error); });
    return epoch === clipEpoch ? blob : null;
  }
  finally { db.close(); }
}
export async function deleteClip(id) {
  clipEpoch++;
  const db = await openDb();
  try { await new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}
export function deleteAllClips() {
  if (deletion) return deletion;
  clipEpoch++; deleting = true;
  deletion = (async () => {
    try {
      const db = await openDb();
      try { await new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
      finally { db.close(); }
    } finally { deleting = false; deletion = null; }
  })();
  return deletion;
}
