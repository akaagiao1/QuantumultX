const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(process.env.QUANX_TEST_PARSER || 'Scripts/resource-parser.js', 'utf8');
function parse(content, suffix='', build=965, notifications=[]) {
  let result;
  const context = { $resource: {type:'server', link:'https://example.com/sub'+suffix, content, tag:'test'}, $environment: {version:'Quantumult X build'+build}, $notify:(...args)=>notifications.push(args), $done:r=>result=r, console: {log:()=>{}}, setTimeout, clearTimeout };
  vm.runInNewContext(code, context, {timeout:5000});
  return Buffer.from(result.content || '', 'base64').toString('utf8');
}
let out = parse('hysteria2://p%40ss@example.com:443/?sni=apple.com&insecure=0&obfs=salamander&obfs-password=secret#hy2');
assert.match(out, /hysteria2=example\.com:443/); assert.match(out, /password=p@ss/); assert.match(out, /tls-host=apple\.com/); assert.match(out, /tls-verification=true/); assert.match(out, /salamander-password=secret/); assert.match(out, /udp-relay=true/);
out = parse('hysteria2=example.com:443, password=pwd, tls-host=apple.com, tls-verification=true, udp-relay=true, tag=hy2-01');
assert.match(out, /hysteria2=example\.com:443/); assert.match(out, /udp-relay=true/);
out = parse(JSON.stringify({proxies:[{name:'clash',type:'hysteria2',server:'example.com',port:443,password:'pwd',sni:'apple.com','skip-cert-verify':false,obfs:'salamander','obfs-password':'key',down:'100 Mbps',ports:'20000-50000','hop-interval':30}]}));
for (const x of ['hysteria2=example.com:443','password=pwd','tls-host=apple.com','tls-verification=true','salamander-password=key','download-bandwidth=100','port-hopping=20000-50000','port-hopping-interval=30','udp-relay=true']) assert.ok(out.includes(x), x+': '+out);
out = parse('hy2://pwd@example.com:20000-50000/?insecure=1#node', '#udp=1'); assert.match(out, /port-hopping=20000-50000/); assert.match(out, /tls-verification=false/); assert.match(out, /udp-relay=true/);
const b64 = Buffer.from('hy2://pwd@example.com:443#encoded').toString('base64');
assert.match(parse(b64), /hysteria2=example\.com:443/);
assert.match(parse('hy2://pwd@[2001:db8::1]:443/?insecure=0#ipv6', '#cert=-1'), /tls-verification=false/);
assert.match(parse('hysteria2=example.com:443, password=pwd, tls-verification=true, udp-relay=true, tag=n'), /tls-verification=true/);
const yaml = 'proxies:\n  - name: YAML\n    type: hysteria2\n    server: example.com\n    port: 443\n    password: pwd\n    sni: apple.com\n    skip-cert-verify: true\n';
assert.match(parse(yaml), /tls-verification=false/);

for (const extra of ['', ', download-bandwidth=100', ', salamander-password=obfskey', ', port-hopping=20000-50000, port-hopping-interval=30']) {
  const original = 'hysteria2=example.com:443, password=pwd' + extra + ', tls-host=apple.com, tls-verification=true, udp-relay=true, tag=hy2';
  const actual = parse(original);
  for (const field of original.split(', ')) assert.ok(actual.includes(field), field + ': ' + actual);
}
assert.match(parse('hy2://pwd@example.com:443?obfs=gecko&obfs-password=key#bad\nhy2://pwd@example.org:443#good'), /example\.org:443/);
assert.doesNotMatch(parse('hy2://pwd@example.com:443?obfs=gecko&obfs-password=key#bad\nhy2://pwd@example.org:443#good'), /example\.com:443/);
const native = 'hysteria2=example.com:443, password=pwd, tls-verification=true, udp-relay=true, tag=native';
const hy2 = 'hy2://pwd@example.com:443#URI';
const other = 'http=example.org:80, tag=HTTP';
for (const content of [native + '\n' + other, hy2 + '\n' + other, 'proxies:\n  - {name: HY2, type: hysteria2, server: example.com, port: 443, password: pwd}\n  - {name: HTTP, type: http, server: example.org, port: 80}\n']) {
  const notifications = [];
  const old = parse(content, '', 964, notifications);
  assert.doesNotMatch(old, /^hysteria2=/m);
  assert.match(old, /^http=/m);
  assert.match(notifications.flat().join(' '), /build 965/);
  const supported = parse(content, '', 965);
  assert.match(supported, /^hysteria2=/m);
  assert.match(supported, /^http=/m);
}
assert.match(parse('HY2://pwd@example.com:443#CRLF\r\n' + other + '\r\n'), /^hysteria2=.*tag=CRLF$/m);
assert.doesNotMatch(parse(hy2, '#tfo=1'), /fast-open=/);
assert.match(parse(hy2, '#rename=$type@'), /tag=HY2URI/);
assert.match(parse(hy2, '#suffix=1'), /tag=URI 「𝐡𝐲𝟐」/);
assert.match(parse(native.replace('tag=native', 'tag=')), /tag=.*example\.com/);
const geckoUri = 'hy2://pwd@example.com:443?obfs=gecko&obfs-password=key%40edge&sni=apple.com&insecure=0#Gecko';
const geckoNative = 'hysteria2=example.com:443, password=pwd, gecko-password=key@edge, tls-host=apple.com, tls-verification=true, udp-relay=true, tag=Gecko';
const geckoYaml = 'proxies:\n  - name: Gecko\n    type: hysteria2\n    server: example.com\n    port: 443\n    password: pwd\n    obfs: gecko\n    obfs-password: "key$and\x60"\n  - {name: Other, type: http, server: example.org, port: 80}';
assert.equal(parse(geckoUri, '', 969), geckoNative);
assert.equal(parse(geckoNative, '', 969), geckoNative);
assert.equal(parse(Buffer.from(geckoUri).toString('base64'), '', 969), geckoNative);
assert.match(parse(geckoYaml, '', 969), /gecko-password=key\$and\x60/);
assert.match(parse(geckoYaml, '', 969), /^http=/m);

const salamander = 'hy2://pwd@example.org:443?obfs=salamander&obfs-password=oldkey#StillSupported';
for (const content of [geckoUri + '\n' + salamander, geckoNative + '\n' + salamander, geckoYaml]) {
  const notifications = [];
  const old = parse(content, '', 968, notifications);
  assert.doesNotMatch(old, /gecko-password=/);
  assert.match(old, /^(?:http=|hysteria2=example\.org)/m);
  assert.match(notifications.flat().join(' '), /Gecko.*build 969/);
}
const conflictNotices = [];
const conflict = geckoNative.replace('gecko-password=key@edge,', 'gecko-password=key@edge, salamander-password=oldkey,');
assert.doesNotMatch(parse(conflict + '\n' + other, '', 969, conflictNotices), /^hysteria2=/m);
assert.match(conflictNotices.flat().join(' '), /Gecko.*Salamander/);
const missing = parse(geckoUri.replace('&obfs-password=key%40edge', '') + '\n' + other, '', 969);
assert.doesNotMatch(missing, /^hysteria2=/m);
assert.match(missing, /^http=/m);

const customPaddingNotices = [];
const customPadding = geckoYaml.replace('    obfs: gecko', '    obfs: gecko\n    obfs-min-packet-size: 512');
assert.doesNotMatch(parse(customPadding, '', 969, customPaddingNotices), /^hysteria2=/m);
assert.match(customPaddingNotices.flat().join(' '), /自定义 Gecko 包大小/);
assert.equal(parse(geckoNative.replace('key@edge', 'chacha20-poly-key'), '', 969),
  geckoNative.replace('key@edge', 'chacha20-poly-key'));

const profile = fs.readFileSync('QuantumultX_Profiles.conf', 'utf8');
const samples = profile.match(/^;hysteria2=.+/gm).map(line => line.slice(1));
assert.equal(samples.length, 6);
for (const sample of samples) assert.equal(parse(sample, '', 969), sample);
console.log('Hysteria 2 integration tests passed');
