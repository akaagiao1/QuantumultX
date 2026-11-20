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

支持 `hy2://`、`hysteria2://`（包括 Base64 编码的订阅）、Clash/Mihomo 的 `type: hysteria2` 及 Quantumult X 原生 `hysteria2=` 节点。转换支持 TLS 验证、Salamander、下载带宽和单个连续端口范围。Gecko、Realm 及组合端口范围无法转换。

已有 Quantumult X 原生节点可以直接填入 `[server_local]`。下面的域名和密码仅用于示例，请换成你的节点信息。

```ini
hysteria2=example.com:443, password=pwd, tls-host=example.com, tls-verification=true, udp-relay=true, tag=HY2
```

[解析器源码](Scripts/resource-parser.js) · [完整配置示例](QuantumultX_Profiles.conf)

有bug请反馈 [@ShawnKOP_Parser_Bot](https://t.me/Shawn_Parser_Bot) 

更新请关注 tg 频道 https://t.me/QuanX_API




