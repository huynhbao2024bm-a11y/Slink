'use strict';

const net = require('node:net');

function isPrivateOrDisallowedIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // Unspecified, RFC1918 10/8, Loopback 127/8
  if (a === 169 && b === 254) return true; // Link-local / Cloud Metadata 169.254/16
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 172.16/12
  if (a === 192 && b === 168) return true; // RFC1918 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // Multicast & Reserved
  return false;
}

function isDisallowedIpv6(ip) {
  const normalized = String(ip || '').toLowerCase().split('%')[0];
  if (!normalized || normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedV4) return isPrivateOrDisallowedIpv4(mappedV4[1]);
  // Handle ::ffff:7f00:1 hex-mapped IPv4 addresses cleanly via Node/IPv4-mapped form
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    return isPrivateOrDisallowedIpv4(v4);
  }
  return false;
}

function assertSafeOutboundUrl(raw, { allowLocalInTest = false, label = 'URL' } = {}) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error(`Địa chỉ ${label} không hợp lệ.`);
  }
  if (url.username || url.password) {
    throw new Error(`Địa chỉ ${label} không được chứa thông tin xác thực trong URL.`);
  }
  if (allowLocalInTest) {
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error(`Địa chỉ ${label} phải dùng http hoặc https.`);
    }
    return url;
  }
  if (url.protocol !== 'https:') {
    throw new Error(`Địa chỉ ${label} bắt buộc sử dụng HTTPS.`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) {
    throw new Error(`Địa chỉ ${label} thiếu tên máy chủ.`);
  }
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host === 'metadata'
    || host === 'metadata.google.internal'
    || host.endsWith('.internal')
    || host.endsWith('.local')
    || host.endsWith('.home.arpa')
  ) {
    throw new Error(`Địa chỉ ${label} không được trỏ tới mạng nội bộ.`);
  }
  const ipVersion = net.isIP(host);
  if (ipVersion === 4 && isPrivateOrDisallowedIpv4(host)) {
    throw new Error(`Địa chỉ ${label} không được trỏ tới IP nội bộ hoặc riêng tư.`);
  }
  if (ipVersion === 6 && isDisallowedIpv6(host)) {
    throw new Error(`Địa chỉ ${label} không được trỏ tới IPv6 nội bộ hoặc riêng tư.`);
  }
  return url;
}

module.exports = { assertSafeOutboundUrl };
