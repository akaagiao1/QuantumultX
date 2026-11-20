const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('Scripts/resource-parser.js', 'utf8');
function parse(content, suffix='') {
  let result;
  const context = { $resource: {type:'server', link:'https://example.com/sub'+suffix, content, tag:'test'}, $environment: {version:'Quantumult X build999'}, $notify:()=>{}, $done:r=>result=r, console: {log:()=>{}}, setTimeout, clearTimeout };
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
console.log('Hysteria 2 integration tests passed');
