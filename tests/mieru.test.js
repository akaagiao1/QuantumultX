const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const parser = fs.readFileSync(process.env.QUANX_TEST_PARSER || 'Scripts/resource-parser.js', 'utf8');
function parse(content, {build = 968, params = '', type = 'server'} = {}) {
  const notices = [];
  let result;
  vm.runInNewContext(parser, {
    $environment: {version: 'Quantumult X build' + build},
    $resource: {type, content, link: 'https://example.com/sub' + params, tag: 'Test'},
    $notify: (...args) => notices.push(args),
    $done: output => { result = output.content; },
    console: {log() {}}
  }, {timeout: 5000});
  return {nodes: Buffer.from(result || '', 'base64').toString('utf8'), notices: notices.flat().join(' ')};
}

const plain = 'mieru=example.com:8964, username=name, password=pwd, fast-open=false, udp-relay=true, udp-over-tcp=true, tag=mieru-01';
const tls = 'mieru=example.com:443, username=name, password=pwd, over-tls=true, tls-host=example.com, tls-verification=true, udp-relay=false, tag=mieru-tls-01';
const reality = 'mieru=example.com:443, username=name, password=pwd, over-tls=true, tls-host=apple.com, reality-base64-pubkey=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk, reality-hex-shortid=0123456789abcdef, udp-relay=true, udp-over-tcp=true, tag=mieru-reality-01';
const fallback = 'http=other.example.com:80, tag=HTTP';
const uri = 'mierus://n%40me:p%40ss%3Aword@[2001:db8::1]?port=8964&profile=Simple%20TCP&protocol=TCP';
const yaml = [
  'proxies:',
  '  - name: Mihomo mieru',
  '    type: mieru',
  '    server: example.com',
  '    port: 8964',
  '    transport: TCP',
  '    username: "0123"',
  '    password: "money$and\x60"',
  '    udp: true',
  '  - {name: Other, type: http, server: other.example.com, port: 80}'
].join('\n');

assert.equal(parse([plain, tls, reality].join('\r\n')).nodes, [plain, tls, reality].join('\n'));
assert.equal(parse(Buffer.from(plain).toString('base64')).nodes, plain);
assert.equal(parse('[general]\n[filter_local]\n[server_local]\n' + plain).nodes, plain);
assert.match(parse(tls, {params: '#cert=-1&udp=1'}).nodes, /tls-verification=false, udp-relay=true, udp-over-tcp=true, tag=/);
assert.match(parse(plain, {params: '#udp=-1'}).nodes, /udp-relay=false, udp-over-tcp=false/);
assert.match(parse(plain, {params: '#rename=$type@'}).nodes, /tag=MIERUmieru-01/);

const simple = parse(uri).nodes;
assert.match(simple, /^mieru=\[2001:db8::1\]:8964, username=n@me, password=p@ss:word, /);
assert.match(simple, /tag=Simple TCP$/);
assert.equal(parse(Buffer.from(uri).toString('base64')).nodes, simple);
assert.match(parse(yaml).nodes, /^mieru=example\.com:8964, username=0123, password=money\$and\x60, udp-relay=true, udp-over-tcp=true, tag=Mihomo mieru$/m);
assert.match(parse(yaml).nodes, /^http=/m);

for (const content of [[plain, fallback].join('\n'), [uri, fallback].join('\n'), yaml]) {
  const old = parse(content, {build: 967});
  assert.doesNotMatch(old.nodes, /^mieru=/m);
  assert.match(old.nodes, /^http=/m);
  assert.match(old.notices, /build 968/);
}

const unsupported = parse([uri.replace('protocol=TCP', 'protocol=UDP'), 'mieru://AAAA', fallback].join('\n'));
assert.doesNotMatch(unsupported.nodes, /^mieru=/m);
assert.match(unsupported.nodes, /^http=/m);
assert.match(unsupported.notices, /TCP/);
assert.match(unsupported.notices, /mierus:\/\//);
assert.doesNotMatch(unsupported.notices, /p%40ss|mieru:\/\/AAAA/);

const profile = fs.readFileSync('QuantumultX_Profiles.conf', 'utf8');
const examples = profile.match(/^;mieru=.+/gm).map(line => line.slice(1));
assert.deepEqual(examples, [plain, tls, reality]);
assert.equal(parse(examples.join('\n')).nodes, examples.join('\n'));
const clashUDP = parse(yaml.replace('transport: TCP', 'transport: UDP'));
assert.doesNotMatch(clashUDP.nodes, /^mieru=/m);
assert.match(clashUDP.nodes, /^http=/m);
assert.match(clashUDP.notices, /单端口 TCP/);
console.log('Mieru integration tests passed');
