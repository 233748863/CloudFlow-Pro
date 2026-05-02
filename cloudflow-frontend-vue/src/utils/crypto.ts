/**
 * 前端密码哈希工具。
 * 优先使用浏览器原生 Web Crypto；如果当前页面不是安全上下文导致 subtle 不可用，
 * 则回退到纯 TypeScript 的 SHA-256 实现，避免登录页直接崩溃。
 */

const SHA256_INITIAL_HASH: number[] = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
];

const SHA256_ROUND_CONSTANTS: number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const add32 = (...values: number[]): number =>
  values.reduce((sum, value) => (sum + value) >>> 0, 0);

const rightRotate = (value: number, bits: number): number =>
  (value >>> bits) | (value << (32 - bits));

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * 纯前端 SHA-256 兜底实现。
 * 这里按标准分块计算摘要，确保在 `crypto.subtle` 不可用时仍能得到一致结果。
 */
const sha256Fallback = (message: string): string => {
  const source = new TextEncoder().encode(message);
  const bitLength = source.length * 8;
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(source);
  padded[source.length] = 0x80;

  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  view.setUint32(paddedLength - 8, highBits, false);
  view.setUint32(paddedLength - 4, lowBits, false);

  const hash = [...SHA256_INITIAL_HASH];
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4, false);
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rightRotate(schedule[index - 15], 7) ^
        rightRotate(schedule[index - 15], 18) ^
        (schedule[index - 15] >>> 3);
      const s1 =
        rightRotate(schedule[index - 2], 17) ^
        rightRotate(schedule[index - 2], 19) ^
        (schedule[index - 2] >>> 10);
      schedule[index] = add32(schedule[index - 16], s0, schedule[index - 7], s1);
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = add32(h, sum1, choice, SHA256_ROUND_CONSTANTS[index], schedule[index]);
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = add32(sum0, majority);

      h = g;
      g = f;
      f = e;
      e = add32(d, temp1);
      d = c;
      c = b;
      b = a;
      a = add32(temp1, temp2);
    }

    hash[0] = add32(hash[0], a);
    hash[1] = add32(hash[1], b);
    hash[2] = add32(hash[2], c);
    hash[3] = add32(hash[3], d);
    hash[4] = add32(hash[4], e);
    hash[5] = add32(hash[5], f);
    hash[6] = add32(hash[6], g);
    hash[7] = add32(hash[7], h);
  }

  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
};

const hashWithWebCrypto = async (password: string): Promise<string | null> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return null;
  }

  const data = new TextEncoder().encode(password);
  const hashBuffer = await subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
};

/**
 * 对密码执行 SHA-256 哈希。
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    const hashed = await hashWithWebCrypto(password);
    if (hashed) {
      return hashed;
    }
  } catch {
    // Web Crypto 在部分 HTTP 调试环境中会直接不可用，这里静默回退到纯前端实现。
  }

  return sha256Fallback(password);
};
