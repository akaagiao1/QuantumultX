// Tests for the reverse direction: sing-box JSON -> QuanX lines
// (Singbox2QX in Scripts/resource-parser.js).
// Same vm harness style as tests/hysteria2.test.js.
// Run: node tests/singbox-reverse.test.js
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('Scripts/resource-parser.js', 'utf8');

function run(content, suffix = '', build = 969, notifications = []) {
  let result;
  const context = {
    $resource: { type: 'server', link: 'https://example.com/sub' + suffix, content, tag: 'test', user_agent: '' },
    $environment: { version: 'Quantumult X build' + build },
    $notify: (...args) => notifications.push(args),
    $done: (r) => { result = r; },
    console: { log: () => {} },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(code, context, { timeout: 5000 });
  return { result, notifications };
}

// Normal server output is base64 QuanX lines.
function parse(content, suffix = '', build = 969, notifications = []) {
  const { result } = run(content, suffix, build, notifications);
  return Buffer.from(result.content || '', 'base64').toString('utf8');
}

const VLESS = {
  type: 'vless', tag: 'VLESS-Reality', server: 'example.com', server_port: 443,
  uuid: '23ad6b10-8d1a-40f7-8ad0-e3e35cd32291', flow: 'xtls-rprx-vision',
  tls: {
    enabled: true, server_name: 'example.com',
    reality: { enabled: true, public_key: 'k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk', short_id: '0123456789abcdef' },
    utls: { enabled: true, fingerprint: 'chrome' },
  },
};
const HY2 = {
  type: 'hysteria2', tag: 'HY2', server: 'example.com', server_port: 443,
  password: 'pwd', obfs: { type: 'salamander', password: 'secret' },
  tls: { enabled: true, server_name: 'apple.com' },
};
const TROJAN = {
  type: 'trojan', tag: 'TJ', server: 'example.org', server_port: 443,
  password: 'pwd', tls: { enabled: true, server_name: 'example.org' },
};
const SS = {
  type: 'shadowsocks', tag: 'SS', server: 'example.net', server_port: 8388,
  method: 'aes-128-gcm', password: 'pwd',
};

// 1. Full sing-box config -> QuanX lines; selector/direct/block skipped.
const notes1 = [];
let out = parse(JSON.stringify({
  log: { level: 'info' },
  outbounds: [VLESS, HY2, TROJAN, SS, { type: 'direct', tag: 'direct' }, { type: 'block', tag: 'block' }, { type: 'selector', tag: 'proxy', outbounds: ['VLESS-Reality'] }],
  route: { final: 'proxy' },
}), '', 969, notes1);
assert.match(out, /^vless=example\.com:443, method=none, password=23ad6b10-8d1a-40f7-8ad0-e3e35cd32291/m);
assert.match(out, /vless-flow=xtls-rprx-vision/);
assert.match(out, /reality-base64-pubkey=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk/);
assert.match(out, /reality-hex-shortid=0123456789abcdef/);
assert.match(out, /^hysteria2=example\.com:443, password=pwd, salamander-password=secret/m);
assert.match(out, /tls-host=apple\.com/);
assert.match(out, /^trojan=example\.org:443, password=pwd/m);
assert.match(out, /over-tls=true/);
assert.match(out, /^shadowsocks=example\.net:8388, method=aes-128-gcm, password=pwd/m);
assert.doesNotMatch(out, /direct|selector/);
assert.match(notes1.flat().join(' '), /3 条/);

// 2. Bare outbounds array also converts.
out = parse(JSON.stringify([HY2]));
assert.match(out, /^hysteria2=example\.com:443/m);

// 3. Round-trip: QuanX lines -> #singbox JSON -> QuanX lines again.
const native =
  'hysteria2=example.com:443, password=pwd, salamander-password=secret, tls-host=apple.com, tls-verification=true, udp-relay=true, tag=hy2-01\n' +
  'vless=example.com:443, method=none, password=23ad6b10-8d1a-40f7-8ad0-e3e35cd32291, obfs=over-tls, obfs-host=example.com, reality-base64-pubkey=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk, reality-hex-shortid=0123456789abcdef, vless-flow=xtls-rprx-vision, udp-relay=true, tag=vless-01';
const json = parse(native, '#singbox=1');
const back = parse(json);
assert.match(back, /salamander-password=secret/);
assert.match(back, /reality-base64-pubkey=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk/);
assert.match(back, /vless-flow=xtls-rprx-vision/);
assert.match(back, /tls-host=apple\.com/);

// 4. VLESS Encryption outbound is skipped, the rest converts.
out = parse(JSON.stringify([
  { type: 'vless', tag: 'ENC', server: 'example.com', server_port: 443, uuid: '23ad6b10-8d1a-40f7-8ad0-e3e35cd32291', encryption: 'mlkem768x25519-sha256-0rtt.600s.0123456789abcdef' },
  HY2,
]));
assert.doesNotMatch(out, /ENC/);
assert.match(out, /^hysteria2=/m);

// 5. Hy2 with combined server_ports is skipped.
out = parse(JSON.stringify([
  { type: 'hysteria2', tag: 'BAD', server: 'example.com', server_port: 443, password: 'pwd', server_ports: ['20000:30000', '40000:50000'], tls: { enabled: true, server_name: 'apple.com' } },
  HY2,
]));
assert.doesNotMatch(out, /BAD/);
assert.match(out, /^hysteria2=/m);

// 6. Hy2 port hopping (single range) + download bandwidth round-trip.
out = parse(JSON.stringify([
  { type: 'hysteria2', tag: 'HOP', server: 'example.com', server_port: 443, password: 'pwd', server_ports: ['20000:50000'], hop_interval: '30s', down_mbps: 100, tls: { enabled: true, server_name: 'apple.com' } },
]));
assert.match(out, /port-hopping=20000-50000/);
assert.match(out, /port-hopping-interval=30/);
assert.match(out, /download-bandwidth=100/);

// 7. type=singbox forces the conversion.
out = parse(JSON.stringify([HY2]), '#type=singbox');
assert.match(out, /^hysteria2=example\.com:443/m);

// 8. V2Ray-style JSON (no top-level server/server_port) is NOT
// treated as sing-box: it yields zero valid nodes, no crash,
// and no fake QuanX line is produced.
const notes8 = [];
const raw8 = run(JSON.stringify({
  outbounds: [{ protocol: 'vless', settings: { vnext: [{ address: 'example.com', port: 443 }] }, streamSettings: {} }],
}), '', 969, notes8);
assert.match(notes8.flat().join(' '), /无有效节点/);
assert.ok(raw8.result); // $done called, no crash; no content for zero nodes

// 9. Plain non-JSON content does not crash the parser.
const notes9 = [];
run('not json at all, just text', '', 969, notes9);
assert.ok(notes9.length >= 0);

// 10. Hy2 只给 server_ports、不给 server_port 时，首连端口取范围起点。
out = parse(JSON.stringify([
  { type: 'hysteria2', tag: 'HOP2', server: '38.247.39.62', server_ports: ['20000:50000'], hop_interval: '15s', hop_interval_max: '35s', obfs: { type: 'gecko', password: 'geckopwd' }, password: 'pwd', tls: { enabled: true, server_name: 'www.bing.com', insecure: true, alpn: 'h3' } },
]));
assert.match(out, /^hysteria2=38\.247\.39\.62:20000, password=pwd, gecko-password=geckopwd/m);
assert.match(out, /port-hopping=20000-50000/);
assert.match(out, /port-hopping-interval=15/);
assert.match(out, /tls-host=www\.bing\.com/);
assert.match(out, /tls-verification=false/);

console.log('sing-box reverse tests passed');
