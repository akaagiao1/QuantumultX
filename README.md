# QuantumultX
> > [!TIP]
> >
> > <u>**纯自用，无规则，不保证维护，不保证更新**</u>
> >
> > 2026-05-18



仅以下项目前还更新维护：    

## Quantumult X 资源解析器

Hysteria 2 需要 Quantumult X **1.9.0（build 965）或更新版本**。[官方版本公告](https://t.me/QuanXNews/447)

1. 在现有配置的 `[general]` 下替换 `resource_parser_url` 这一行。

   ```ini
   resource_parser_url = https://raw.githubusercontent.com/akaagiao1/QuantumultX/main/Scripts/resource-parser.js
   ```

2. 在 `[server_remote]` 中给节点订阅加上 `opt-parser=true`，保存后刷新节点资源。

   ```ini
   https://example.com/sub, tag=我的订阅, opt-parser=true, enabled=true
   ```

支持 `hy2://`、`hysteria2://`（包括 Base64 编码的订阅）、Clash/Mihomo 的 `type: hysteria2` 及 Quantumult X 原生 `hysteria2=` 节点。转换支持 TLS 验证、Salamander、下载带宽和单个连续端口范围。Realm 及组合端口范围无法转换。

已有 Quantumult X 原生节点可以直接填入 `[server_local]`。下面的域名和密码仅用于示例，请换成你的节点信息。

```ini
hysteria2=example.com:443, password=pwd, tls-host=example.com, tls-verification=true, udp-relay=true, tag=HY2
```

### Hysteria 2 Gecko（build 969+）

Gecko 混淆需要 Quantumult X **1.9.0（build 969）或更新版本**。解析器支持原生 `gecko-password`，也会把分享链接中的 `obfs=gecko&obfs-password=…` 和 Clash/Mihomo 的 Gecko 混淆转换为该字段。[Quantumult X 版本公告](https://t.me/QuanXNews/452)

服务端也必须启用 Gecko 并使用同一混淆密码。`gecko-password` 和 `salamander-password` 不能同时设置。旧版会跳过 Gecko 节点，仍可导入该版本支持的其他节点。Clash/Mihomo 自定义的 Gecko 包大小无法转换。

### mieru（build 968+）

mieru 需要 Quantumult X **1.9.0（build 968）或更新版本**。原生 `mieru=` 节点支持 TCP、TLS 和 REALITY。开启 UDP 中继时使用 `udp-relay=true, udp-over-tcp=true`。[Quantumult X 版本公告](https://t.me/QuanXNews/451)

订阅可导入单端口 TCP 的 `mierus://` 简单分享链接（包括 Base64 订阅）和 Clash/Mihomo 的 `type: mieru` 节点。完整 `mieru://` 客户端配置请重新导出为简单链接。UDP 传输、端口范围或无法转换的选项会提示并跳过该条目。低于 build 968 时会跳过 mieru 节点。

可以把原生节点写入 `[server_local]`。模板中有 TCP、TLS 和 REALITY 三种示例，请用服务商提供的地址和凭据替换占位值。

### 转 sing-box（节点转换，只转 outbounds）

Quantumult X 的 `.conf` 和 sing-box 的 JSON 不能直接互读，转换只做节点：把解析器已经归一化好的 QuanX 行转成 sing-box 的 `outbounds`。分流、重写、MITM、脚本没有等价物，不转。

**主路：解析器 `#singbox` 开关。**在订阅链接后加 `#singbox=1`（只出 outbounds 数组）或 `#singbox=full`（出最小完整配置），再用 Node 跑解析器：

```bash
node Scripts/singbox-from-subscription.js my-sub.txt --full --out singbox.json
sing-box check -c singbox.json
```

这样订阅、Clash YAML、Surge、`hy2://` / `vless://` 链接这些解析器本来就能吃的格式，都能直接转。注意：QuanX 内刷新订阅时解析器必须返回 QuanX 行，所以这个开关只在 Node 下有效，QuanX 里加了也没用。

**另一条路：直接转原生行。**`Scripts/quanx-to-singbox.js` 只认 `[server_local]` 的原生节点行，不走订阅解析：

```bash
node Scripts/quanx-to-singbox.js my-nodes.conf --full --out singbox.json
```

能转：hysteria2（含 Salamander、Gecko、端口跳跃、下载带宽）、VLESS Reality/Vision 与 ws/wss/http、Trojan、VMess、Shadowsocks（AEAD 加密方式）、SOCKS5、HTTP、AnyTLS。跳过并说明原因的：mieru（官方 sing-box 没有 mieru 出站）、带 VLESS Encryption 的 VLESS、ShadowsocksR、旧流式加密的 Shadowsocks（`chacha20` 等）、`aead=false` 的 VMess、SOCKS5 over TLS。

仓库自带测试：`node tests/singbox-parser.test.js`（解析器开关）与 `node tests/singbox-converter.test.js`（独立脚本）。实测用仓库模板 `--include-commented --full` 生成的配置已通过 `sing-box 1.15.0-alpha.13` 的 `sing-box check`（22 个样例节点转成，10 个按上面规则跳过）；混合订阅（hy2 + VLESS Reality + mieru）与 Clash YAML 经解析器开关转出的 `--full` 配置同样通过 check。

**反向：sing-box JSON → QuanX。**订阅内容是 sing-box 配置（带 `outbounds` 数组的对象，或数组本身）时，解析器自动识别并把每个出站转成 QuanX 原生行，**在 QuanX 内刷新订阅也能用**（输出就是 QuanX 行，不像 `#singbox` 那样只限 Node）。用法：把 sing-box 配置放到一个订阅链接里，加资源时打开 opt-parser 即可；也可以在链接后加 `#type=singbox` 强制走这条路。能转：hysteria2（含 Gecko/Salamander、端口跳跃、下载带宽）、VLESS Reality/Vision 与 ws/wss/http、Trojan、VMess、Shadowsocks（含 obfs-local / v2ray-plugin）、SOCKS5、HTTP、AnyTLS。跳过并通知原因的：direct/block/selector/urltest（不是节点）、wireguard/tuic/naive/shadowtls/mieru 等无 QuanX 等价写法的类型、带 VLESS Encryption 的 VLESS、hy2 的 realm、grpc/quic 等传输、缺必填字段的出站。Hy2 只给 `server_ports` 不给 `server_port` 时，首连端口取范围起点（如 `20000:50000` → `38.247.39.62:20000`）。丢弃、无等价物的参数：hy2 的 `hop_interval_max`（QuanX 只有固定 `port-hopping-interval`）、`alpn`。V2Ray/Xray JSON 不认（出站没有顶层 `server`/`server_port`），不会误判。测试：`node tests/singbox-reverse.test.js`，含正反向往返（QuanX 行 → `#singbox` JSON → QuanX 行，关键字段保留）。

[解析器源码](Scripts/resource-parser.js) · [完整配置示例](QuantumultX_Profiles.conf)

有bug请反馈 [@ShawnKOP_Parser_Bot](https://t.me/Shawn_Parser_Bot) 

更新请关注 tg 频道 https://t.me/QuanX_API




