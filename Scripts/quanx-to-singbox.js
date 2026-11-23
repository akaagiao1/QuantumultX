// quanx-to-singbox.js
//
// Convert Quantumult X native server lines into sing-box outbounds.
//
// Usage:
//   node quanx-to-singbox.js <input.conf|input.txt> [--include-commented] [--full] [--out out.json]
//
//   <input>   A Quantumult X profile (only its [server_local] section is
//             read) or a plain list of `type=host:port, ...` server lines.
//   --include-commented
//             Also take `;`-commented server lines (the sample nodes in
//             QuantumultX_Profiles.conf are commented out). Off by default:
//             a real config's commented lines are not live nodes.
//   --full    Emit a minimal complete sing-box config (mixed inbound,
//             direct/block, a `proxy` selector over the converted nodes,
//             route final -> proxy) instead of just the outbounds array.
//   --out <file>
//             Write the JSON to <file> instead of stdout. Skipped nodes
//             are always reported on stderr.
//
// Only nodes are converted. Filter/rewrite/MITM/task/geo_location_checker
// have no sing-box equivalent and are ignored.
//
// What converts, and what does not (sing-box 1.15, official build):
//   hysteria2  yes, including salamander, gecko and port hopping
//   vless      yes for TCP/Reality/Vision and ws/wss/http transports;
//              a line carrying VLESS Encryption (encryption=<key>, not
//              "none") is skipped: official sing-box has no VLESS
//              encryption support
//   trojan, vmess, shadowsocks, socks5, http, anytls
//              yes for their plain/TLS/WebSocket forms (see skips below)
//   mieru      skipped: official sing-box has no mieru outbound
//              (only forked cores such as NekoBox/sing-box-xboard have one)
//   shadowsocksr, vmess with aead=false, shadowsocks with an ssr-protocol
//              skipped: no equivalent in sing-box
//   shadowsocks obfs=http/tls/ws/wss is emitted as a plugin outbound
//              (obfs-local / v2ray-plugin); the plugin binary itself is
//              not bundled with sing-box, so that node only runs where
//              the plugin is installed.
//
// The converter never guesses credentials: a line missing its required
// password/uuid/method is skipped with a reason. Run the output through
// the official check before use:
//   sing-box check -c <output.json>
'use strict';

const fs = require('node:fs');

const KNOWN_TYPES = new Set([
  'shadowsocks', 'trojan', 'vmess', 'vless', 'anytls',
  'hysteria2', 'mieru', 'http', 'socks5',
]);

// Split "k=v, k2=v2" on commas. Values in QuanX server lines do not
// contain unquoted commas, so a plain split on ", " is safe here.
// Parts without "=" (e.g. a second port range after a comma) are kept
// in params.__stray so converters can reject them instead of silently
// dropping them.
function parseParams(text) {
  const params = {};
  const stray = [];
  for (const part of text.split(/,\s*/)) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      if (part.trim()) stray.push(part.trim());
      continue;
    }
    params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  if (stray.length) params.__stray = stray;
  return params;
}

function parseAddress(addr) {
  const m = addr.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/);
  if (!m) return null;
  return { server: m[1] || m[2], server_port: Number(m[3]) };
}

function bool(v, dflt) {
  if (v === undefined) return dflt;
  return v === 'true';
}

// TLS block shared by the TLS-based outbounds. `serverName` is the SNI
// (tls-host / obfs-host); without one the server address is used.
function tlsBlock(p, serverName) {
  const tls = { enabled: true };
  if (serverName) tls.server_name = serverName;
  if (bool(p['tls-verification'], true) === false) tls.insecure = true;
  if (p['reality-base64-pubkey']) {
    tls.reality = { enabled: true, public_key: p['reality-base64-pubkey'] };
    if (p['reality-hex-shortid']) tls.reality.short_id = p['reality-hex-shortid'];
    // sing-box refuses a Reality client without uTLS; chrome matches
    // the fp=chrome used in vless:// links and in sing-box-ios.json.
    tls.utls = { enabled: true, fingerprint: 'chrome' };
  }
  return tls;
}

// Transport shared by vless/vmess/trojan. Returns { transport, tls }
// where transport is undefined for plain TCP and tls is undefined when
// the line carries no TLS at all.
function transportOf(p) {
  const obfs = (p.obfs || '').toLowerCase();
  const host = p['obfs-host'] || p['tls-host'];
  const path = p['obfs-uri'] || '/';
  let transport;
  let tls;
  if (obfs === 'ws' || obfs === 'wss') {
    // sing-box calls the WebSocket transport "ws", not "websocket".
    transport = { type: 'ws', path };
    if (host) transport.headers = { Host: host };
    if (obfs === 'wss') tls = tlsBlock(p, host);
  } else if (obfs === 'http') {
    transport = { type: 'http', path };
    if (host) transport.host = [host];
  } else if (obfs === 'over-tls' || p['over-tls'] === 'true') {
    tls = tlsBlock(p, host);
  }
  return { transport, tls };
}

function networkOf(p) {
  // udp-relay=false means TCP only; true (or unset) means both.
  return bool(p['udp-relay'], true) === false ? 'tcp' : undefined;
}

function convertHysteria2(addr, p) {
  if (!p.password) return { skip: 'missing password' };
  if (p['salamander-password'] && p['gecko-password']) {
    return { skip: 'gecko-password and salamander-password cannot both be set' };
  }
  const out = {
    type: 'hysteria2',
    server: addr.server,
    server_port: addr.server_port,
    password: p.password,
  };
  if (p['salamander-password']) {
    out.obfs = { type: 'salamander', password: p['salamander-password'] };
  } else if (p['gecko-password']) {
    out.obfs = { type: 'gecko', password: p['gecko-password'] };
  }
  if (p['port-hopping']) {
    // A combined range ("20000-30000,40000-50000") arrives here as a
    // stray token after the comma split; sing-box server_ports can hold
    // several ranges, but QuanX port-hopping is one range and the
    // parser treats combined ranges as unconvertible, so skip it
    // instead of silently keeping only the first range.
    if ((p.__stray || []).some((s) => /^\d+-\d+$/.test(s))) {
      return { skip: 'combined port-hopping ranges cannot convert: ' + p['port-hopping'] };
    }
    const m = p['port-hopping'].match(/^(\d+)-(\d+)$/);
    if (!m) return { skip: 'port-hopping is not a single continuous range: ' + p['port-hopping'] };
    out.server_ports = [m[1] + ':' + m[2]];
    out.hop_interval = (Number(p['port-hopping-interval'] || 30)) + 's';
  }
  if (p['download-bandwidth']) {
    const n = Number(p['download-bandwidth']);
    if (Number.isFinite(n)) out.down_mbps = n;
  }
  const net = networkOf(p);
  if (net) out.network = net;
  out.tls = tlsBlock(p, p['tls-host'] || addr.server);
  return { outbound: out };
}

function convertVless(addr, p) {
  if (!p.password) return { skip: 'missing password (uuid)' };
  if (p.encryption && p.encryption !== 'none') {
    return { skip: 'VLESS Encryption is not supported by official sing-box' };
  }
  if (p.method && p.method !== 'none') {
    return { skip: 'unsupported vless method: ' + p.method };
  }
  const out = {
    type: 'vless',
    server: addr.server,
    server_port: addr.server_port,
    uuid: p.password,
  };
  if (p['vless-flow']) out.flow = p['vless-flow'];
  const { transport, tls } = transportOf(p);
  if (transport) out.transport = transport;
  // over-tls / reality lines carry TLS even without a ws transport.
  if (!tls && (p['reality-base64-pubkey'] || p['tls-host'])) {
    out.tls = tlsBlock(p, p['tls-host'] || p['obfs-host'] || addr.server);
  } else if (tls) {
    out.tls = tls;
  }
  // Reality without an explicit TLS host still needs a server_name.
  if (out.tls && out.tls.reality && !out.tls.server_name) {
    out.tls.server_name = p['obfs-host'] || addr.server;
  }
  const net = networkOf(p);
  if (net) out.network = net;
  return { outbound: out };
}

function convertTrojan(addr, p) {
  if (!p.password) return { skip: 'missing password' };
  const out = {
    type: 'trojan',
    server: addr.server,
    server_port: addr.server_port,
    password: p.password,
  };
  const { transport, tls } = transportOf(p);
  if (transport) out.transport = transport;
  if (tls) out.tls = tls;
  const net = networkOf(p);
  if (net) out.network = net;
  return { outbound: out };
}

function convertVmess(addr, p) {
  if (!p.password) return { skip: 'missing password (uuid)' };
  if (p.aead === 'false') {
    return { skip: 'aead=false (legacy non-AEAD VMess) has no sing-box equivalent' };
  }
  const securityMap = {
    'aes-128-gcm': 'aes-128-gcm',
    'chacha20-poly1305': 'chacha20-poly1305',
    'chacha20-ietf-poly1305': 'chacha20-poly1305',
    none: 'none',
    auto: 'auto',
  };
  const out = {
    type: 'vmess',
    server: addr.server,
    server_port: addr.server_port,
    uuid: p.password,
    security: securityMap[(p.method || 'auto').toLowerCase()] || 'auto',
    alter_id: 0,
  };
  const { transport, tls } = transportOf(p);
  if (transport) out.transport = transport;
  if (tls) out.tls = tls;
  else if (p['tls-host']) out.tls = tlsBlock(p, p['tls-host']);
  const net = networkOf(p);
  if (net) out.network = net;
  return { outbound: out };
}

function convertShadowsocks(addr, p) {
  if (p['ssr-protocol']) return { skip: 'ShadowsocksR is not supported by sing-box' };
  if (!p.method || !p.password) return { skip: 'missing method or password' };
  // sing-box 1.15 only accepts AEAD (and 2022-blake3) methods;
  // legacy stream ciphers such as chacha20 / aes-128-cfb are gone.
  const allowedMethods = new Set([
    'aes-128-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305',
    'xchacha20-ietf-poly1305', 'none',
    '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm',
    '2022-blake3-chacha20-poly1305',
  ]);
  if (!allowedMethods.has(p.method.toLowerCase())) {
    return { skip: 'unsupported shadowsocks method in sing-box 1.15: ' + p.method };
  }
  const out = {
    type: 'shadowsocks',
    server: addr.server,
    server_port: addr.server_port,
    method: p.method,
    password: p.password,
  };
  const obfs = (p.obfs || '').toLowerCase();
  if (obfs === 'http' || obfs === 'tls') {
    out.plugin = 'obfs-local';
    out.plugin_opts = 'obfs=' + obfs +
      (p['obfs-host'] ? ';obfs-host=' + p['obfs-host'] : '') +
      (p['obfs-uri'] ? ';obfs-uri=' + p['obfs-uri'] : '');
  } else if (obfs === 'ws' || obfs === 'wss') {
    out.plugin = 'v2ray-plugin';
    out.plugin_opts = (obfs === 'wss' ? 'tls;' : '') +
      (p['obfs-host'] ? 'host=' + p['obfs-host'] + ';' : '') +
      'path=' + (p['obfs-uri'] || '/');
  } else if (obfs && obfs !== 'plain') {
    return { skip: 'unsupported shadowsocks obfs: ' + obfs };
  }
  const net = networkOf(p);
  if (net) out.network = net;
  return { outbound: out };
}

function convertSocks5(addr, p) {
  // sing-box's socks outbound has no tls field: SOCKS5 over TLS has no
  // equivalent there, so skip it rather than emit a plaintext node.
  if (p['over-tls'] === 'true') {
    return { skip: 'SOCKS5 over TLS has no sing-box equivalent' };
  }
  const out = {
    type: 'socks',
    version: '5',
    server: addr.server,
    server_port: addr.server_port,
  };
  if (p.username) out.username = p.username;
  if (p.password) out.password = p.password;
  const net = networkOf(p);
  if (net) out.network = net;
  return { outbound: out };
}

function convertHttp(addr, p) {
  const out = {
    type: 'http',
    server: addr.server,
    server_port: addr.server_port,
  };
  if (p.username) out.username = p.username;
  if (p.password) out.password = p.password;
  if (p['over-tls'] === 'true') out.tls = tlsBlock(p, p['tls-host'] || addr.server);
  return { outbound: out };
}

function convertAnytls(addr, p) {
  if (!p.password) return { skip: 'missing password' };
  const out = {
    type: 'anytls',
    server: addr.server,
    server_port: addr.server_port,
    password: p.password,
    tls: tlsBlock(p, p['tls-host'] || addr.server),
  };
  return { outbound: out };
}

const CONVERTERS = {
  hysteria2: convertHysteria2,
  vless: convertVless,
  trojan: convertTrojan,
  vmess: convertVmess,
  shadowsocks: convertShadowsocks,
  socks5: convertSocks5,
  http: convertHttp,
  anytls: convertAnytls,
};

function convertLine(line) {
  const m = line.match(/^([a-z0-9]+)=(.+)$/);
  if (!m) return { skip: 'not a server line' };
  const type = m[1];
  if (type === 'mieru') {
    return { skip: 'official sing-box has no mieru outbound', type };
  }
  if (!KNOWN_TYPES.has(type)) return { skip: 'unknown type: ' + type, type };
  const parts = m[2].split(/,\s*/);
  const addr = parseAddress(parts[0]);
  if (!addr) return { skip: 'bad address: ' + parts[0], type };
  const p = parseParams(parts.slice(1).join(', '));
  const tag = p.tag || (type + '-' + addr.server);
  const r = CONVERTERS[type](addr, p);
  if (r.skip) return { skip: r.skip, type, tag };
  const out = r.outbound;
  out.tag = tag;
  if (bool(p['fast-open'], false)) out.tcp_fast_open = true;
  return { outbound: out, type, tag };
}

function collectLines(text, includeCommented) {
  const lines = [];
  let inServerLocal = !text.includes('[server_local]');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) {
      inServerLocal = line === '[server_local]';
      continue;
    }
    if (!inServerLocal) continue;
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    if (line.startsWith(';')) {
      if (includeCommented && /^[a-z0-9]+=/i.test(line.slice(1))) {
        lines.push(line.slice(1).trim());
      }
      continue;
    }
    lines.push(line);
  }
  return lines;
}

function buildFullConfig(outbounds) {
  const tags = outbounds.map((o) => o.tag);
  return {
    $schema: 'https://sing-box.sagernet.org/schema.json',
    log: { level: 'info' },
    dns: {
      servers: [
        { tag: 'dns-local', type: 'local' },
        { tag: 'dns-proxy', type: 'https', server: '1.1.1.1', detour: 'proxy' },
      ],
    },
    inbounds: [
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 1080 },
    ],
    outbounds: [
      ...outbounds,
      { type: 'direct', tag: 'direct' },
      { type: 'block', tag: 'block' },
      { type: 'selector', tag: 'proxy', outbounds: tags },
    ],
    route: {
      final: 'proxy',
      auto_detect_interface: true,
      // 1.12+ requires a domain resolver for outbounds addressed by
      // domain name; dns-local avoids a proxy detour loop here.
      default_domain_resolver: { server: 'dns-local' },
    },
  };
}

function main(argv) {
  const args = argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  if (!input) {
    process.stderr.write(
      'Usage: node quanx-to-singbox.js <input.conf|input.txt> [--include-commented] [--full] [--out out.json]\n'
    );
    return 1;
  }
  const includeCommented = args.includes('--include-commented');
  const full = args.includes('--full');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

  const text = fs.readFileSync(input, 'utf8');
  const lines = collectLines(text, includeCommented);
  const outbounds = [];
  const skipped = [];
  const seenTags = new Set();
  for (const line of lines) {
    const r = convertLine(line);
    if (r.skip) {
      skipped.push((r.tag || r.type || line) + ' (' + (r.type || '?') + '): ' + r.skip);
      continue;
    }
    let tag = r.outbound.tag;
    if (seenTags.has(tag)) {
      let i = 2;
      while (seenTags.has(tag + '-' + i)) i++;
      tag = tag + '-' + i;
      r.outbound.tag = tag;
    }
    seenTags.add(tag);
    outbounds.push(r.outbound);
  }
  for (const s of skipped) process.stderr.write('SKIP ' + s + '\n');
  process.stderr.write(
    'converted ' + outbounds.length + ' / ' + lines.length +
    ' lines, skipped ' + skipped.length + '\n'
  );
  if (outbounds.length === 0) return 1;
  const doc = full ? buildFullConfig(outbounds) : outbounds;
  const json = JSON.stringify(doc, null, 2) + '\n';
  if (outFile) fs.writeFileSync(outFile, json);
  else process.stdout.write(json);
  return 0;
}

module.exports = { convertLine, collectLines, buildFullConfig };

if (require.main === module) process.exit(main(process.argv));
