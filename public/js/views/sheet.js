// 出す：経営デザインシートの確認・編集・出力

import { h, append, button, progress, toast, fmtDate } from '../ui.js';
import { state, save, writeExtra } from '../state.js';
import { SHEET_SECTIONS, sheetCompletion, sheetToMarkdown, sheetToPrintableHtml, applySheetUpdates } from '../sheet.js';
import { downloadFile } from '../storage.js';
import { pageHeader } from './common.js';

export function render(el, { go }) {
  const d = state.data;
  const pctText = h('span', { class: 'sheet-pct' });
  const bar = h('div');
  const refreshPct = () => {
    const p = sheetCompletion(d.sheet);
    pctText.textContent = `充足率 ${p}%`;
    bar.replaceChildren(progress(p, '経営デザインシートの充足率'));
  };

  const stamp = () => {
    const x = new Date();
    return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`;
  };

  const printSheet = () => {
    const frame = h('iframe', { class: 'print-frame', title: '印刷用' });
    frame.srcdoc = sheetToPrintableHtml(d.sheet, d.company);
    frame.addEventListener('load', () => {
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1000);
    });
    document.body.append(frame);
  };

  const saveToFolder = async () => {
    const name = `出力/経営デザインシート_${stamp()}.html`;
    try {
      await writeExtra(name, sheetToPrintableHtml(d.sheet, d.company));
      toast(`保存先フォルダに「${name}」を保存しました`);
    } catch (e) {
      toast('保存できませんでした: ' + e.message);
    }
  };

  append(el, 
    pageHeader('経営デザインシート', '会社の「これまで」と「これから」を1枚に。AIとの対話で埋まった内容を、社長の言葉で整えて出力できます。'),
    h(
      'div',
      { class: 'card stack' },
      h('div', { class: 'row row--between' }, pctText, h('span', { class: 'text-sub text-small' }, d.sheet.updatedAt ? `最終更新 ${fmtDate(d.sheet.updatedAt)}` : '')),
      bar,
      h(
        'div',
        { class: 'row' },
        button('印刷・PDFで保存', { iconName: 'download', onClick: printSheet }),
        button('保存先フォルダに書き出す', { variant: 'secondary', onClick: saveToFolder }),
        button('Markdownで書き出す', { variant: 'secondary', onClick: () => downloadFile(`経営デザインシート_${stamp()}.md`, sheetToMarkdown(d.sheet, d.company), 'text/markdown;charset=utf-8') }),
      ),
      h('p', { class: 'text-small text-sub' }, '「印刷・PDFで保存」では、印刷画面の送信先で「PDFに保存」を選ぶとPDFになります（A4横1枚）。'),
    ),
    ...SHEET_SECTIONS.map((s) =>
      h(
        'section',
        { class: 'sheet-section' },
        h('h2', {}, s.label),
        h(
          'div',
          { class: 'sheet-section__fields' },
          s.fields.map((f) => {
            const ta = h('textarea', { class: 'input', rows: 5, id: 'sheet-' + f.id, placeholder: f.hint }, d.sheet.fields[f.id]?.text || '');
            ta.addEventListener('change', () => {
              const text = ta.value.trim();
              if (!text) {
                delete d.sheet.fields[f.id];
                d.sheet.updatedAt = new Date().toISOString();
              } else {
                d.sheet = applySheetUpdates(d.sheet, [{ field: f.id, text }]).sheet;
              }
              save();
              refreshPct();
            });
            return h('div', { class: 'form-field' }, h('label', { for: ta.id, class: 'form-field__label' }, f.label), h('p', { class: 'form-field__hint' }, f.hint), ta);
          }),
        ),
      ),
    ),
    h('div', { class: 'card card--action' }, h('h2', {}, '空いている項目を埋める'), h('p', {}, 'AIが質問しながら、足りない項目を埋めていきます。'), button('AIと話して埋める', { iconName: 'mic', onClick: () => go('interview') })),
  );
  refreshPct();
}
