// PC故障に備えた「暗号化バックアップ」。
// 社長が決めた合言葉から鍵を作り（PBKDF2-SHA256）、AES-GCMで暗号化する。
// 合言葉はどこにも保存しない。バックアップファイルは外付けディスクやUSBメモリに置く想定。

const ITERATIONS = 310000;
const MAGIC = 'kioku-backup';

const b64 = {
  enc: (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  dec: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(data, passphrase) {
  if (!passphrase || passphrase.length < 8) throw new Error('合言葉は8文字以上にしてください');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return JSON.stringify({ format: MAGIC, v: 1, createdAt: new Date().toISOString(), kdf: { name: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64.enc(salt) }, iv: b64.enc(iv), data: b64.enc(cipher) });
}

export async function decryptBackup(text, passphrase) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('バックアップファイルの形式が正しくありません');
  }
  if (obj.format !== MAGIC) throw new Error('会社の記憶帳のバックアップファイルではありません');
  const key = await deriveKey(passphrase, b64.dec(obj.kdf.salt), obj.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(obj.iv) }, key, b64.dec(obj.data));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('合言葉が違うか、ファイルが壊れています');
  }
}
