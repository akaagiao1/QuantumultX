// singbox-from-subscription.js
//
// Run Scripts/resource-parser.js under Node and emit sing-box JSON for a
// subscription file. The parser is invoked with the link suffix
// #singbox=1 (or #singbox=full), so any format the parser accepts works
// as input: hy2:// / vless:// / mieru:// links, Clash/Mihomo YAML,
// Surge, QuanX native lines, base64 subscriptions.
//
// Usage:
//   node Scripts/singbox-from-subscription.js <subscription-file> [--full] [--out out.json]
//
//   --full  Emit a minimal complete sing-box config (mixed inbound,
//           direct/block, a `proxy` selector) instead of just the
//           outbounds array.
//   --out   Write the JSON to <file> instead of stdout. Skipped nodes
//           are reported on stderr.
//
// This only runs under Node. Inside Quantumult X the parser must return
// QuanX node lines, so #singbox has no effect there. Validate the
// output before use: sing-box check -c <output.json>
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function main(argv) {
  const args = argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  if (!input) {
    process.stderr.write(
      'Usage: node Scripts/singbox-from-subscription.js <subscription-file> [--full] [--out out.json]\n'
    );
    return 1;
  }
  const full = args.includes('--full');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

  const repo = path.join(__dirname, '..');
  const code = fs.readFileSync(path.join(repo, 'Scripts', 'resource-parser.js'), 'utf8');
  const content = fs.readFileSync(input, 'utf8');

  const notifications = [];
  let result;
  const context = {
    $resource: {
      type: 'server',
      link: 'https://example.com/sub#singbox=' + (full ? 'full' : '1'),
      content,
      tag: 'singbox',
      user_agent: '',
    },
    $environment: { version: 'Quantumult X build969' },
    $notify: (...a) => notifications.push(a),
    $done: (r) => { result = r; },
    console: { log: () => {} },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(code, context, { timeout: 30000 });

  for (const n of notifications) {
    process.stderr.write(n.map((x) => String(x)).join(' | ') + '\n');
  }
  if (!result || !result.content) {
    process.stderr.write('parser returned no content\n');
    return 1;
  }
  const json = Buffer.from(result.content, 'base64').toString('utf8');
  try {
    JSON.parse(json);
  } catch (e) {
    process.stderr.write('parser output is not JSON: ' + json.slice(0, 200) + '\n');
    return 1;
  }
  if (outFile) fs.writeFileSync(outFile, json + '\n');
  else process.stdout.write(json + '\n');
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
