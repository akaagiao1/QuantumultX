// Tests for the #singbox switch in Scripts/resource-parser.js.
// Same vm harness style as tests/hysteria2.test.js.
// Run: node tests/singbox-parser.test.js
// No sing-box binary is needed here; `sing-box check` on the generated
// config is a separate step (see README).
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('Scripts/resource-parser.js', 'utf8');

function parse(content, suffix = '', build = 969, notifications = []) {
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
  return Buffer.from(result.content || '', 'base64').toString('utf8');
}

function parseJson(content, suffix = '', build = 969, notifications = []) {
  return JSON.parse(parse(content, suffix, build, notifications));
}

// 1. hy2:// link -> hysteria2 outbound, default path untouched.
let out = parseJson(
  'hysteria2://p%40ss@example.com:443/?sni=apple.com&insecure=0&obfs=salamander&obfs-password=secret#hy2',
  '#singbox=1'
);
assert.equal(out.length, 1);
assert.equal(out[0].type, 'hysteria2');
assert.deepEqual(out[0].obfs, { type: 'salamander', password: 'secret' });
assert.equal(out[0].tls.server_name, 'apple.com');
assert.equal(out[0].password, 'p@ss');

const qx = parse(
  'hysteria2://p%40ss@example.com:443/?sni=apple.com&insecure=0&obfs=salamander&obfs-password=secret#hy2'
);
assert.match(qx, /^hysteria2=example\.com:443/m);

// 2. Clash YAML with Gecko hy2 + http -> both convert.
out = parseJson(
  'proxies:\n' +
  '  - name: Gecko\n    type: hysteria2\n    server: example.com\n    port: 443\n    password: pwd\n    obfs: gecko\n    obfs-password: "key"\n' +
  '  - {name: HTTP, type: http, server: example.org, port: 80}\n',
  '#singbox=1'
);
assert.equal(out.length, 2);
assert.deepEqual(out[0].obfs, { type: 'gecko', password: 'key' });
assert.equal(out[1].type, 'http');

// 3. Native lines: hy2 converts, mieru is skipped and reported.
const notes = [];
out = parseJson(
  'hysteria2=example.com:443, password=pwd, tls-host=apple.com, tls-verification=true, udp-relay=true, tag=hy2-01\n' +
  'mieru=example.com:8964, username=name, password=pwd, fast-open=false, udp-relay=true, udp-over-tcp=true, tag=mieru-01',
  '#singbox=1',
  969,
  notes
);
assert.equal(out.length, 1);
assert.equal(out[0].type, 'hysteria2');
assert.match(notes.flat().join(' '), /sing-box 跳过 1 条/);

// 4. vless:// Reality + Vision -> vless outbound with reality + utls chrome.
out = parseJson(
  'vless://23ad6b10-8d1a-40f7-8ad0-e3e35cd32291@example.com:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=example.com&fp=chrome&pbk=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk&sid=0123456789abcdef&type=tcp&headerType=none#VLESS',
  '#singbox=1'
);
assert.equal(out.length, 1);
assert.equal(out[0].type, 'vless');
assert.equal(out[0].flow, 'xtls-rprx-vision');
assert.equal(out[0].tls.reality.public_key, 'k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk');
assert.equal(out[0].tls.reality.short_id, '0123456789abcdef');
assert.deepEqual(out[0].tls.utls, { enabled: true, fingerprint: 'chrome' });

// 5. singbox=full -> a complete minimal config.
const full = parseJson(
  'hysteria2=example.com:443, password=pwd, tls-host=apple.com, tls-verification=true, udp-relay=true, tag=hy2-01',
  '#singbox=full'
);
assert.equal(full.route.final, 'proxy');
assert.ok(full.outbounds.some((x) => x.type === 'selector' && x.tag === 'proxy'));
assert.equal(full.outbounds[0].type, 'hysteria2');

// 6. Combined switches: #udp=1&singbox=1 still converts.
out = parseJson(
  'hysteria2=example.com:443, password=pwd, tls-host=apple.com, tls-verification=true, tag=hy2-01',
  '#udp=1&singbox=1'
);
assert.equal(out.length, 1);
assert.equal(out[0].network, undefined);

console.log('sing-box parser tests passed');
