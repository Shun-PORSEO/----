// 原本の保存先。
// - 標準: File System Access API で社長のPCのフォルダに保存（Chrome / Edge）
// - 代替: 未対応ブラウザでは、このブラウザ内（IndexedDB）に保存するお試しモード
// フォルダの「ハンドル」を IndexedDB に保存し、次回以降の再選択を不要にする。

const DB_NAME = 'kioku-local';
const DB_STORE = 'kv';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(DB_STORE).objectStore(DB_STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(key) {
  const db = await idb();
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
  });
}

export const fsSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// ---- PCのフォルダに保存 ----
class FolderStore {
  constructor(handle) {
    this.handle = handle;
    this.kind = 'folder';
    this.label = handle.name;
  }

  async #dirFor(pathStr, create) {
    const parts = pathStr.split('/').filter(Boolean);
    const name = parts.pop();
    let dir = this.handle;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
    return { dir, name };
  }

  async readText(pathStr) {
    try {
      const { dir, name } = await this.#dirFor(pathStr, false);
      const fh = await dir.getFileHandle(name);
      return await (await fh.getFile()).text();
    } catch (e) {
      if (e.name === 'NotFoundError') return null;
      throw e;
    }
  }

  async writeText(pathStr, text) {
    const { dir, name } = await this.#dirFor(pathStr, true);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); // 一時ファイルに書いてから置き換わるので、途中で落ちても元データは壊れない
    await w.write(text);
    await w.close();
  }
}

// ---- ブラウザ内に保存（お試しモード） ----
class BrowserStore {
  constructor() {
    this.kind = 'browser';
    this.label = 'このブラウザ内（お試し）';
  }
  async readText(p) {
    return (await idbGet('file:' + p)) ?? null;
  }
  async writeText(p, text) {
    await idbSet('file:' + p, text);
  }
}

// 保存先の復元。permission: 'granted' | 'prompt' | 'none'
export async function restoreStore() {
  const mode = await idbGet('storeMode');
  if (mode === 'browser') return { store: new BrowserStore(), permission: 'granted' };
  if (mode !== 'folder' || !fsSupported) return { store: null, permission: 'none' };
  const handle = await idbGet('folderHandle');
  if (!handle) return { store: null, permission: 'none' };
  const permission = await handle.queryPermission({ mode: 'readwrite' });
  return { store: new FolderStore(handle), permission, handle };
}

// ボタン操作の中から呼ぶ（ブラウザの制約でユーザー操作が必要）
export async function reauthorize(handle) {
  const p = await handle.requestPermission({ mode: 'readwrite' });
  return p === 'granted';
}

// 選んだだけでは保存先として記憶しない（rememberFolder で確定）
export async function pickFolder() {
  const handle = await window.showDirectoryPicker({ id: 'kioku', mode: 'readwrite', startIn: 'documents' });
  return new FolderStore(handle);
}

export async function rememberFolder(store) {
  await idbSet('folderHandle', store.handle);
  await idbSet('storeMode', 'folder');
}

export async function useBrowserStore() {
  await idbSet('storeMode', 'browser');
  return new BrowserStore();
}

export async function forgetStore() {
  await idbDelete('folderHandle');
  await idbDelete('storeMode');
}

// ブラウザがデータを勝手に消さないよう永続化を依頼（お試しモード向け）
export async function requestPersist() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function downloadFile(filename, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
