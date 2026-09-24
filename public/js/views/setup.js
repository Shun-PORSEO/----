// 初回：保存先（社長のPCのフォルダ）を選ぶ

import { h, button, notice } from '../ui.js';
import { fsSupported, pickFolder, rememberFolder, useBrowserStore, requestPersist } from '../storage.js';
import { privacyCard } from './common.js';

export function render(main, { onReady }) {
  const error = h('div');
  const choose = async () => {
    error.replaceChildren();
    try {
      const store = await pickFolder();
      await rememberFolder(store);
      onReady(store);
    } catch (e) {
      if (e.name !== 'AbortError') error.replaceChildren(notice('error', 'フォルダを選べませんでした', h('p', {}, e.message)));
    }
  };

  main.replaceChildren(
    h(
      'div',
      { class: 'view narrow' },
      h('p', { class: 'eyebrow' }, 'はじめに'),
      h('h1', {}, '会社の記憶を保存するフォルダを選びます'),
      h('p', { class: 'lead' }, '社長のPCの中に「会社の記憶」専用のフォルダを1つ作り、それを選んでください。記憶はそのフォルダにだけ保存されます。'),
      privacyCard(),
      fsSupported
        ? h(
            'div',
            { class: 'stack' },
            h(
              'ol',
              { class: 'steps' },
              h('li', {}, '下のボタンを押します'),
              h('li', {}, '「ドキュメント」などに新しいフォルダ（例：会社の記憶）を作って選びます'),
              h('li', {}, 'ブラウザの確認で「ファイルの編集を許可」→ 可能なら「毎回許可する」を選びます'),
            ),
            button('保存先フォルダを選ぶ', { size: 'lg', iconName: 'lock', onClick: choose }),
            error,
          )
        : h(
            'div',
            { class: 'stack' },
            notice(
              'warning',
              'このブラウザはPCのフォルダへの保存に対応していません',
              h('p', {}, 'PCのフォルダに保存するには、Windows / Mac の Google Chrome または Microsoft Edge で開いてください。'),
              h('p', {}, 'Safari・Firefox・スマートフォンでは、このブラウザの中に保存する「お試しモード」を使えます。ブラウザのデータを消すと記憶も消えるため、設定画面から定期的にバックアップしてください。'),
            ),
            button('お試しモードで始める', {
              variant: 'secondary',
              onClick: async () => {
                await requestPersist();
                onReady(await useBrowserStore());
              },
            }),
          ),
    ),
  );
}
