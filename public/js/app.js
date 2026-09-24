// アプリの入口：保存先の確認 → データ読み込み → 画面切り替え

import { h, icon, notice, button } from './ui.js';
import { loadConfig, getConfig, memberCode } from './api.js';
import { restoreStore, reauthorize } from './storage.js';
import { state, loadData, onChange, flush, hasUnsaved } from './state.js';

import * as setup from './views/setup.js';
import * as home from './views/home.js';
import * as onboarding from './views/onboarding.js';
import * as interview from './views/interview.js';
import * as memories from './views/memories.js';
import * as ask from './views/ask.js';
import * as sheet from './views/sheet.js';
import * as report from './views/report.js';
import * as consult from './views/consult.js';
import * as news from './views/news.js';
import * as settings from './views/settings.js';

const ROUTES = [
  { path: 'home', label: 'ホーム', icon: 'home', view: home },
  { path: 'interview', label: 'AIと話して残す', icon: 'mic', view: interview },
  { path: 'memories', label: '会社の記憶', icon: 'book', view: memories },
  { path: 'ask', label: '自社AIに聞く', icon: 'chat', view: ask },
  { path: 'sheet', label: '経営デザインシート', icon: 'sheet', view: sheet },
  { path: 'report', label: '月次レポート', icon: 'chart', view: report },
  { path: 'consult', label: 'お悩み相談', icon: 'help', view: consult },
  { path: 'news', label: 'AIニュース', icon: 'news', view: news },
  { path: 'settings', label: '設定・バックアップ', icon: 'gear', view: settings },
  { path: 'onboarding', label: 'はじめての登録', view: onboarding, hidden: true },
];

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const status = document.getElementById('save-status');
let cleanup = null;

function currentPath() {
  return (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
}

export function go(path) {
  if (currentPath() === path) render();
  else location.hash = '#/' + path;
}

function renderNav() {
  const cur = currentPath();
  nav.replaceChildren(
    h(
      'ul',
      {},
      ROUTES.filter((r) => !r.hidden).map((r) =>
        h('li', {}, h('a', { href: '#/' + r.path, class: 'side-nav__link', 'aria-current': r.path === cur ? 'page' : null }, icon(r.icon, 20), h('span', {}, r.label))),
      ),
    ),
  );
}

function renderStatus() {
  if (!state.store) {
    status.textContent = '';
    return;
  }
  const where = state.store.kind === 'folder' ? `保存先: PCのフォルダ「${state.store.label}」` : '保存先: このブラウザ内（お試し）';
  const s = state.saveError ? '⚠ ' + state.saveError : state.saving ? '保存中…' : state.lastSavedAt ? `保存済み ${state.lastSavedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}` : '';
  status.replaceChildren(icon('lock', 16), h('span', {}, where), s && h('span', { class: state.saveError ? 'is-error' : '' }, '｜' + s));
}

function render() {
  cleanup?.();
  cleanup = null;
  const path = currentPath();
  const route = ROUTES.find((r) => r.path === path) || ROUTES[0];
  renderNav();
  main.replaceChildren();
  const cfg = getConfig();
  if (cfg.demo) {
    main.append(
      notice(
        'warning',
        cfg.staticDemo ? 'デモ表示中（サーバー未接続）' : 'デモモードで動作中',
        h('p', {}, 'AIの応答は固定の見本です。入力した内容は、選んだ保存先にだけ保存されます。'),
      ),
    );
  } else if (cfg.requiresMemberCode && !memberCode() && path !== 'settings') {
    main.append(notice('info', '会員コードを入力してください', h('p', {}, 'AI機能を使うには、ご案内した会員コードが必要です。'), h('a', { href: '#/settings' }, '設定画面で入力する')));
  }
  const container = h('div', { class: 'view' });
  main.append(container);
  document.title = `${route.label}｜${cfg.serviceName || '会社の記憶帳'}`;
  cleanup = route.view.render(container, { go }) || null;
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function start() {
  await loadConfig();
  onChange(renderStatus);
  const { store, permission, handle } = await restoreStore();

  if (!store) {
    setup.render(main, { onReady: afterStore });
    return;
  }
  if (permission !== 'granted') {
    // 前回のフォルダを覚えているので、ボタン1つで再開できる
    main.replaceChildren(
      h(
        'div',
        { class: 'view narrow' },
        h('h1', {}, 'おかえりなさい'),
        h('p', {}, `前回の保存先フォルダ「${handle.name}」を開きます。ブラウザから確認が出たら「許可」を押してください。`),
        h('p', { class: 'text-sub' }, 'Chrome / Edge で「毎回許可する」を選ぶと、次回からこの確認は出ません。'),
        button('保存先フォルダを開く', {
          iconName: 'lock',
          size: 'lg',
          onClick: async () => {
            if (await reauthorize(handle)) afterStore(store);
          },
        }),
        h('p', {}, h('button', { type: 'button', class: 'btn btn--text', onClick: () => setup.render(main, { onReady: afterStore }) }, '別のフォルダを選ぶ')),
      ),
    );
    return;
  }
  afterStore(store);
}

async function afterStore(store) {
  try {
    await loadData(store);
  } catch (e) {
    main.replaceChildren(notice('error', 'データを読み込めませんでした', h('p', {}, e.message)));
    return;
  }
  document.body.classList.add('is-ready');
  if (!state.data.company.name && !location.hash.includes('onboarding')) location.hash = '#/onboarding';
  window.addEventListener('hashchange', render);
  render();
}

// 閉じる・切り替える直前に未保存分を書き込む
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && hasUnsaved()) flush();
});
window.addEventListener('beforeunload', (e) => {
  if (hasUnsaved()) {
    flush();
    e.preventDefault();
  }
});

start();
