import { isHexString } from 'ethers';

const encoder = new TextEncoder();

const normalizeHex = (hex: string): string => {
  if (!isHexString(hex, { allowMissingPrefix: true })) {
    throw new Error('请输入合法的 16 进制字符串');
  }
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (stripped.length % 2 !== 0) {
    throw new Error('16 进制字符串长度需要为偶数');
  }
  return stripped.toLowerCase();
};

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
};

const buildKey = (key: string): Uint8Array => {
  if (!key.trim()) {
    throw new Error('密钥不能为空');
  }
  return encoder.encode(key);
};

const mixByte = (byte: number, keyByte: number, index: number): number => {
  // 简单的异或 + 位置扰动，使用相同函数实现加密/解密
  const positionSalt = (index * 31 + 0xa5) & 0xff;
  return byte ^ keyByte ^ positionSalt;
};

export const encryptHex = (hex: string, key: string): string => {
  const normalized = normalizeHex(hex);
  const inputBytes = hexToBytes(normalized);
  const keyBytes = buildKey(key);
  const output = new Uint8Array(inputBytes.length);

  for (let i = 0; i < inputBytes.length; i += 1) {
    const keyByte = keyBytes[i % keyBytes.length];
    output[i] = mixByte(inputBytes[i], keyByte, i);
  }

  return bytesToHex(output);
};

export const decryptHex = (cipherHex: string, key: string): string => {
  const normalized = normalizeHex(cipherHex);
  const inputBytes = hexToBytes(normalized);
  const keyBytes = buildKey(key);
  const output = new Uint8Array(inputBytes.length);

  for (let i = 0; i < inputBytes.length; i += 1) {
    const keyByte = keyBytes[i % keyBytes.length];
    output[i] = mixByte(inputBytes[i], keyByte, i);
  }

  return bytesToHex(output);
};
