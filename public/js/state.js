// アプリの状態と原本ファイルへの保存

import { normalizeData, emptyData, dataToMarkdown, makeEntry } from './memory.js';
import { applySheetUpdates } from './sheet.js';

export const DATA_FILE = 'kioku.json';
export const READABLE_FILE = '会社の記憶.md';

export const state = {
  store: null, // FolderStore | BrowserStore
  data: null,
  saving: false,
  lastSavedAt: null,
  saveError: null,
};

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn(state);
}

export async function loadData(store) {
  state.store = store;
  const text = await store.readText(DATA_FILE);
  state.data = text ? normalizeData(JSON.parse(text)) : emptyData();
  emit();
  return state.data;
}

let timer = null;
let pending = null;
let resolvePending = null;

// 変更は少しまとめてから保存（聞き出し中の連続更新でもディスク書き込みを抑える）
export function save() {
  clearTimeout(timer);
  if (!pending) pending = new Promise((resolve) => (resolvePending = resolve));
  const p = pending;
  timer = setTimeout(flush, 800);
  emit();
  return p;
}

export const hasUnsaved = () => !!pending || state.saving;

// すぐに保存する。書き込みは1つずつ順番に行う（古い内容が後から上書きしないように）
let writing = Promise.resolve();
export function flush() {
  clearTimeout(timer);
  const resolve = resolvePending;
  pending = resolvePending = null;
  writing = writing.then(writeNow, writeNow);
  if (resolve) writing.then(resolve);
  return writing;
}

async function writeNow() {
  if (!state.store || !state.data) return;
  state.saving = true;
  emit();
  try {
    await state.store.writeText(DATA_FILE, JSON.stringify(state.data, null, 2));
    await state.store.writeText(READABLE_FILE, dataToMarkdown(state.data));
    state.lastSavedAt = new Date();
    state.saveError = null;
  } catch (e) {
    state.saveError = e.name === 'NotAllowedError' ? 'フォルダへの書き込みが許可されていません。ページを再読み込みして、保存先フォルダを開き直してください。' : '保存に失敗しました: ' + e.message;
  } finally {
    state.saving = false;
    emit();
  }
}

export function addEntries(list, source) {
  const now = new Date().toISOString();
  const added = list.filter((m) => (m.content || '').trim()).map((m) => makeEntry({ ...m, source }, now));
  state.data.entries.unshift(...added);
  if (added.length) save();
  return added;
}

export function updateSheet(updates) {
  const { sheet, changed } = applySheetUpdates(state.data.sheet, updates);
  state.data.sheet = sheet;
  if (changed.length) save();
  return changed;
}

export async function writeExtra(path, text) {
  await state.store.writeText(path, text);
}
