import bcrypt from 'bcryptjs';

/**
 * 前端密码加密工具
 * 使用 SHA-256 进行简单哈希，后端会再次使用 BCrypt 加密
 */

/**
 * 对密码进行 SHA-256 哈希
 * @param password 明文密码
 * @returns 哈希后的密码（十六进制字符串）
 */
export const hashPassword = async (password: string): Promise<string> => {
  // 使用 Web Crypto API 进行 SHA-256 哈希
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};
