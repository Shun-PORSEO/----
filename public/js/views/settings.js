// 設定・バックアップ：保存先、暗号化バックアップ（PC故障対策）、会員コード、データの説明

import { h, append, button, field, notice, toast } from '../ui.js';
import { state, save, flush, loadData } from '../state.js';
import { encryptBackup, decryptBackup } from '../backup.js';
import { downloadFile, forgetStore, pickFolder, rememberFolder, fsSupported } from '../storage.js';
import { normalizeData, dataToMarkdown } from '../memory.js';
import { getConfig, memberCode, setMemberCode, checkMemberCode } from '../api.js';
import { pageHeader, privacyCard } from './common.js';

export function render(el) {
  const cfg = getConfig();
  const d = state.data;

  // ---- 会員コード ----
  const codeInput = h('input', { class: 'input', value: memberCode(), autocomplete: 'off', spellcheck: 'false' });
  const codeMsg = h('div', { 'aria-live': 'polite' });
  const memberSection =
    cfg.requiresMemberCode &&
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, '会員コード'),
      h('p', { class: 'text-sub' }, 'AI機能を使うためのコードです。ご案内メールに記載しています。'),
      field('会員コード', codeInput),
      codeMsg,
      h(
        'div',
        { class: 'row' },
        button('確認して保存', {
          onClick: async () => {
            const r = await checkMemberCode(codeInput.value.trim());
            if (r.ok) {
              setMemberCode(codeInput.value);
              codeMsg.replaceChildren(notice('success', `確認できました（${r.member}）`));
            } else codeMsg.replaceChildren(notice('error', r.message));
          },
        }),
      ),
    );

  // ---- バックアップ ----
  const pass1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const pass2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const backupMsg = h('div', { 'aria-live': 'polite' });
  const backupBtn = button('暗号化バックアップを作る', {
    iconName: 'download',
    onClick: async () => {
      if (pass1.value !== pass2.value) return backupMsg.replaceChildren(notice('error', '合言葉が一致しません'));
      try {
        backupBtn.disabled = true;
        d.lastBackupAt = new Date().toISOString();
        const text = await encryptBackup(d, pass1.value);
        const x = new Date();
        downloadFile(`会社の記憶_バックアップ_${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}.kioku`, text, 'application/octet-stream');
        save();
        pass1.value = pass2.value = '';
        backupMsg.replaceChildren(notice('success', 'バックアップを作りました', h('p', {}, 'ダウンロードしたファイルを、外付けディスクやUSBメモリにコピーしてください。合言葉は紙に書いて金庫など安全な場所に保管してください。合言葉を忘れると復元できません（運営者も復元できません）。')));
      } catch (e) {
        backupMsg.replaceChildren(notice('error', e.message));
      } finally {
        backupBtn.disabled = false;
      }
    },
  });

  // ---- 復元 ----
  const fileInput = h('input', { type: 'file', class: 'input', accept: '.kioku,application/json' });
  const restorePass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const restoreMsg = h('div', { 'aria-live': 'polite' });
  const restoreBtn = button('バックアップから復元', {
    variant: 'secondary',
    onClick: async () => {
      const file = fileInput.files?.[0];
      if (!file) return restoreMsg.replaceChildren(notice('error', 'バックアップファイルを選んでください'));
      try {
        const restored = normalizeData(await decryptBackup(await file.text(), restorePass.value));
        if (!confirm(`バックアップ（記憶${restored.entries.length}件）で、今のデータ（記憶${d.entries.length}件）を置き換えます。よろしいですか？`)) return;
        state.data = restored;
        await flush();
        restoreMsg.replaceChildren(notice('success', '復元しました', h('p', {}, `記憶${restored.entries.length}件を読み込みました。`)));
      } catch (e) {
        restoreMsg.replaceChildren(notice('error', e.message));
      }
    },
  });

  // ---- 保存先 ----
  const storeSection = h(
    'section',
    { class: 'card stack' },
    h('h2', {}, '保存先'),
    h('p', {}, state.store.kind === 'folder' ? `PCのフォルダ「${state.store.label}」に保存しています。` : 'このブラウザの中に保存しています（お試しモード）。ブラウザの履歴・データを削除すると消えるため、バックアップを必ず作ってください。'),
    h('p', { class: 'text-sub' }, 'フォルダの中の「kioku.json」が原本、「会社の記憶.md」は人が読むための控えです。どちらもメモ帳などで開けます。'),
    h(
      'div',
      { class: 'row' },
      fsSupported &&
        button('別のフォルダに移す', {
          variant: 'secondary',
          onClick: async () => {
            try {
              const store = await pickFolder();
              const existing = await store.readText('kioku.json');
              if (existing) {
                // 既存データを上書きしない。開くか、やめるかだけを選べる
                if (!confirm('選んだフォルダには既に会社の記憶があります。そのデータに切り替えますか？')) return;
                await loadData(store);
              } else {
                state.store = store;
                await flush();
              }
              await rememberFolder(store);
              toast(`保存先を「${store.label}」にしました`);
              location.reload();
            } catch (e) {
              if (e.name !== 'AbortError') toast(e.message);
            }
          },
        }),
      button('読める形（Markdown）で書き出す', { variant: 'secondary', onClick: () => downloadFile('会社の記憶.md', dataToMarkdown(d), 'text/markdown;charset=utf-8') }),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--text btn--danger',
          onClick: async () => {
            if (!confirm('このブラウザと保存先の接続を解除します（フォルダ内のデータは消えません）。よろしいですか？')) return;
            await forgetStore();
            location.reload();
          },
        },
        '保存先の接続を解除',
      ),
    ),
  );

  append(el, 
    pageHeader('設定・バックアップ'),
    memberSection,
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, 'PC故障に備える（暗号化バックアップ）'),
      h('p', {}, '記憶は社長のPCにしかありません。月に1回、暗号化したバックアップを外付けディスクやUSBメモリに保存してください。合言葉がないと誰も中身を読めません。'),
      d.lastBackupAt ? h('p', { class: 'text-sub' }, `前回のバックアップ: ${new Date(d.lastBackupAt).toLocaleString('ja-JP')}`) : notice('warning', 'まだバックアップがありません'),
      h('div', { class: 'grid-2' }, field('合言葉（8文字以上）', pass1), field('合言葉（確認）', pass2)),
      backupMsg,
      h('div', { class: 'row' }, backupBtn),
      h('hr'),
      h('h3', {}, '復元する（新しいPCに移すときも）'),
      h('div', { class: 'grid-2' }, field('バックアップファイル', fileInput), field('合言葉', restorePass)),
      restoreMsg,
      h('div', { class: 'row' }, restoreBtn),
    ),
    storeSection,
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, '複数のPCで使うには'),
      h('p', {}, '記憶の原本は1台のPCに置くのが基本です。別のPCでも使いたい場合は、上の「暗号化バックアップ」で移すか、保存先フォルダをOneDrive・Googleドライブなどの同期フォルダの中に作ってください（その場合、同期サービスにもデータが置かれます）。同時に2台で編集すると、後から保存した方で上書きされます。'),
    ),
    privacyCard(),
    h(
      'section',
      { class: 'card stack' },
      h('h2', {}, 'データの扱い（詳しく）'),
      h(
        'ul',
        {},
        h('li', {}, 'AIに送る内容：質問・対話の文章と、そのとき関係する会社の記憶（各画面の「今回AIに送った会社の記憶」で確認できます）。'),
        h('li', {}, 'AIの処理：Anthropic社のAPI（商用利用規約により、送信内容をAIの学習に使わない）を利用します。中継サーバーは内容を保存・記録しません。'),
        h('li', {}, '公開情報の調査：会社名・ホームページ・所在地・業種だけを使ってWeb検索します。'),
        h('li', {}, '音声入力：ブラウザの音声認識機能を使うため、音声がブラウザ提供元で文字に変換される場合があります。'),
        h('li', {}, '運営者が見られるもの：お悩み相談フォームに書いた内容と、社長が送った月次CSV（件数と削減時間のみ）だけです。'),
      ),
    ),
  );
}
