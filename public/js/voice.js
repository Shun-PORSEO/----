// 音声入力（Web Speech API）。Chrome / Edge で利用可能。
// 注意: ブラウザの音声認識は、ブラウザ提供元（Google / Microsoft）のサーバーで文字起こしされる場合がある。
// 画面上でこの点を明示し、気になる場合はOSの音声入力（Windows: Win+H、Mac: fnキー2回）を案内する。

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const voiceSupported = !!Recognition;

// target: textarea。ボタンを押すと録音開始/停止し、確定した文字をカーソル位置に追記する。
export function attachVoice(button, target, { onState } = {}) {
  if (!Recognition) {
    button.hidden = true;
    return { stop() {} };
  }
  let rec = null;
  let baseText = '';

  const setState = (on) => {
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.querySelector('.label').textContent = on ? '音声入力を止める' : '音声で入力';
    onState?.(on);
  };

  const stop = () => {
    rec?.stop();
  };

  button.addEventListener('click', () => {
    if (rec) return stop();
    rec = new Recognition();
    rec.lang = 'ja-JP';
    rec.continuous = true;
    rec.interimResults = true;
    baseText = target.value ? target.value.replace(/\s*$/, '') + (target.value.trim() ? '\n' : '') : '';
    let finalText = '';
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript + '。';
        else interim += r[0].transcript;
      }
      target.value = baseText + finalText + interim;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed') alert('マイクの使用が許可されていません。ブラウザのアドレスバー左のアイコンから許可してください。');
    };
    rec.onend = () => {
      rec = null;
      setState(false);
    };
    rec.start();
    setState(true);
  });

  return { stop };
}
