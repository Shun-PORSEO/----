// ランディングページ：サーバー設定（申込フォーム・メルマガ等のURL）を反映する

import { loadConfig } from './api.js';

const cfg = await loadConfig();

if (cfg.trialFormUrl) {
  for (const a of document.querySelectorAll('[data-trial-link]')) {
    a.href = cfg.trialFormUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
} else if (cfg.contactEmail) {
  const mail = `mailto:${cfg.contactEmail}?subject=${encodeURIComponent('会社の記憶帳 試行の申し込み')}&body=${encodeURIComponent('会社名：\nお名前：\n所在地：\n従業員数：\n電話番号：\n')}`;
  for (const a of document.querySelectorAll('[data-trial-link]')) {
    if (a.closest('#trial')) a.href = mail;
  }
  document.getElementById('trial-note').textContent = 'メールソフトが開きます。会社名・お名前・所在地・従業員数をお書き添えください。';
} else {
  document.getElementById('trial-note').textContent = '申し込み窓口は準備中です。';
}

const setLink = (sel, url) => {
  const a = document.querySelector(sel);
  if (a && url) {
    a.href = url;
    a.hidden = false;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
};
setLink('[data-newsletter-link]', cfg.newsletterUrl);
setLink('[data-podcast-link]', cfg.podcastUrl);

if (cfg.operatorName) document.querySelector('[data-operator]').textContent = cfg.operatorName;
if (cfg.contactEmail) {
  const el = document.querySelector('[data-contact]');
  el.append('お問い合わせ：');
  const a = document.createElement('a');
  a.href = `mailto:${cfg.contactEmail}`;
  a.textContent = cfg.contactEmail;
  el.append(a);
}
