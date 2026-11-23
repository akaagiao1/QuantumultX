// Tests for Scripts/quanx-to-singbox.js. Run: node tests/singbox-converter.test.js
// No sing-box binary is needed here; `sing-box check` on the generated
// full config is a separate step (see README).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { convertLine, collectLines, buildFullConfig } = require('../Scripts/quanx-to-singbox.js');

const repo = path.join(__dirname, '..');

function ok(line) {
  const r = convertLine(line);
  assert.ok(r.outbound, line + ' should convert, got skip: ' + r.skip);
  return r.outbound;
}
function skipped(line, re) {
  const r = convertLine(line);
  assert.ok(r.skip, line + ' should be skipped');
  assert.match(r.skip, re);
  return r.skip;
}

// Hysteria 2: plain, bandwidth, salamander, port hopping, gecko.
let o = ok('hysteria2=example.com:443, password=pwd, tls-host=example.com, tls-verification=true, udp-relay=true, tag=hy2-01');
assert.equal(o.type, 'hysteria2');
assert.equal(o.tls.server_name, 'example.com');
assert.equal(o.tls.insecure, undefined);
assert.equal(o.network, undefined);

o = ok('hysteria2=example.com:443, password=pwd, tls-host=example.com, tls-verification=true, udp-relay=true, download-bandwidth=100, tag=hy2-02');
assert.equal(o.down_mbps, 100);

o = ok('hysteria2=example.com:443, password=pwd, salamander-password=obfskey, tls-host=example.com, tls-verification=true, udp-relay=true, tag=hy2-03');
assert.deepEqual(o.obfs, { type: 'salamander', password: 'obfskey' });

o = ok('hysteria2=example.com:443, password=pwd, port-hopping=20000-50000, port-hopping-interval=30, tls-host=example.com, tls-verification=true, udp-relay=true, tag=hy2-04');
assert.deepEqual(o.server_ports, ['20000:50000']);
assert.equal(o.hop_interval, '30s');

o = ok('hysteria2=example.com:443, password=pwd, gecko-password=obfskey, tls-host=apple.com, tls-verification=true, udp-relay=true, tag=hy2-gecko-tls-01');
assert.deepEqual(o.obfs, { type: 'gecko', password: 'obfskey' });
assert.equal(o.tls.server_name, 'apple.com');

skipped(
  'hysteria2=example.com:443, password=pwd, gecko-password=a, salamander-password=b, tag=bad',
  /cannot both be set/
);
skipped(
  'hysteria2=example.com:443, password=pwd, port-hopping=20000-30000,40000-50000, tag=bad',
  /combined port-hopping/
);

// mieru: official sing-box has no mieru outbound.
skipped(
  'mieru=example.com:8964, username=name, password=pwd, fast-open=false, udp-relay=true, udp-over-tcp=true, tag=mieru-01',
  /no mieru outbound/
);
skipped(
  'mieru=example.com:443, username=name, password=pwd, over-tls=true, tls-host=apple.com, reality-base64-pubkey=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk, reality-hex-shortid=0123456789abcdef, udp-relay=true, udp-over-tcp=true, tag=mieru-reality-01',
  /no mieru outbound/
);

// VLESS Reality + Vision (QuanX mode 1 line from xray-reality-onekey).
o = ok('vless=example.com:443, method=none, password=23ad6b10-8d1a-40f7-8ad0-e3e35cd32291, obfs=over-tls, obfs-host=example.com, reality-base64-pubkey=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk, reality-hex-shortid=0123456789abcdef, vless-flow=xtls-rprx-vision, udp-relay=true, tag=vless-01');
assert.equal(o.type, 'vless');
assert.equal(o.flow, 'xtls-rprx-vision');
assert.equal(o.tls.reality.public_key, 'k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk');
assert.equal(o.tls.reality.short_id, '0123456789abcdef');
assert.equal(o.tls.server_name, 'example.com');
assert.deepEqual(o.tls.utls, { enabled: true, fingerprint: 'chrome' });

// VLESS Encryption must be skipped, not silently downgraded.
skipped(
  'vless=example.com:443, method=none, password=23ad6b10-8d1a-40f7-8ad0-e3e35cd32291, encryption=mlkem768x25519-sha256-0rtt.600s.0123456789abcdef, tag=vless-enc',
  /VLESS Encryption/
);

// Trojan wss, VMess wss, AnyTLS, SOCKS5-TLS, HTTP-TLS.
o = ok('trojan=example1.com:443, password=pwd, obfs=wss, obfs-host=example.com, obfs-uri=/path, udp-relay=true, tag=trojan-wss-05');
assert.equal(o.transport.type, 'ws');
assert.equal(o.transport.path, '/path');
assert.equal(o.tls.server_name, 'example.com');

o = ok('vmess=ws-tls-b.example.com:443, method=chacha20-ietf-poly1305, password=23ad6b10-8d1a-40f7-8ad0-e3e35cd32291, obfs-host=ws-tls-b.example.com, obfs=wss, obfs-uri=/ws, tls-verification=true, fast-open=false, udp-relay=false, tag=Sample-I');
assert.equal(o.security, 'chacha20-poly1305');
assert.equal(o.transport.type, 'ws');
assert.equal(o.network, 'tcp');
assert.equal(o.tls.insecure, undefined);

o = ok('anytls=example.com:443, password=pwd, tls-host=example.com, tls-verification=true, tag=anytls-01');
assert.equal(o.type, 'anytls');
assert.equal(o.tls.server_name, 'example.com');

o = ok('socks5=example.com:80, username=name, password=pwd, fast-open=false, udp-relay=false, tag=socks5-02');
assert.equal(o.type, 'socks');
assert.equal(o.tls, undefined);

// SOCKS5 over TLS has no sing-box equivalent: skip, don't downgrade.
skipped(
  'socks5=example.com:443, username=name, password=pwd, over-tls=true, tls-host=example.com, tls-verification=true, fast-open=false, udp-relay=false, tag=socks5-tls-01',
  /SOCKS5 over TLS/
);

o = ok('http=https.example.com:443, username=name, password=pwd, over-tls=true, tls-host=example.com, tls-verification=true, fast-open=false, udp-relay=false, tag=http-tls');
assert.equal(o.type, 'http');

// Shadowsocks: plain converts, obfs becomes a plugin, SSR is skipped.
o = ok('shadowsocks=ss.example.com:8388, method=aes-128-gcm, password=pwd, tag=ss-plain');
assert.equal(o.type, 'shadowsocks');
assert.equal(o.plugin, undefined);

o = ok('shadowsocks=ss-a.example.com:80, method=aes-128-gcm, password=pwd, obfs=http, obfs-host=bing.com, obfs-uri=/resource/file, fast-open=false, udp-relay=false, tag=Sample-A');
assert.equal(o.plugin, 'obfs-local');
assert.match(o.plugin_opts, /obfs=http;obfs-host=bing\.com/);

// Legacy stream ciphers are gone in sing-box 1.15: skip, don't emit.
skipped(
  'shadowsocks=ss-a.example.com:80, method=chacha20, password=pwd, obfs=http, obfs-host=bing.com, obfs-uri=/resource/file, tag=Sample-A-old',
  /unsupported shadowsocks method/
);

skipped(
  'shadowsocks=ssr-a.example.com:443, method=chacha20, password=pwd, ssr-protocol=auth_chain_b, ssr-protocol-param=def, obfs=tls1.2_ticket_fastauth, obfs-host=bing.com, tag=Sample-D',
  /ShadowsocksR/
);

// VMess aead=false has no sing-box equivalent.
skipped(
  'vmess=ws-c.example.com:80, method=chacha20-ietf-poly1305, password=23ad6b10-8d1a-40f7-8ad0-e3e35cd32291, obfs-host=ws-c.example.com, obfs=ws, obfs-uri=/ws, fast-open=false, udp-relay=false, aead=false, tag=Sample-H',
  /aead=false/
);

// The repo's own profile: 6 hy2 lines convert, 3 mieru lines skip.
const profile = fs.readFileSync(path.join(repo, 'QuantumultX_Profiles.conf'), 'utf8');
const lines = collectLines(profile, true);
const results = lines.map(convertLine);
const converted = results.filter((r) => r.outbound);
const hy2 = converted.filter((r) => r.type === 'hysteria2');
assert.equal(hy2.length, 6);
assert.equal(results.filter((r) => r.skip && /mieru/.test(r.skip)).length, 3);
assert.ok(converted.some((r) => r.type === 'vless') === false, 'profile has no vless sample');
const full = buildFullConfig(converted.map((r) => r.outbound));
assert.equal(full.route.final, 'proxy');
assert.ok(full.outbounds.some((x) => x.type === 'selector' && x.tag === 'proxy'));
assert.deepEqual(
  full.outbounds.find((x) => x.tag === 'proxy').outbounds,
  converted.map((r) => r.outbound.tag)
);

console.log('sing-box converter tests passed (' + converted.length + ' profile nodes converted, ' +
  results.filter((r) => r.skip).length + ' skipped)');
