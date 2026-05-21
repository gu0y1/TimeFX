# 后端部署说明书

本文档面向负责部署 TimeFX 自有后端服务的工程师或 Codex。后端用于接收 Lark Base 字段捷径请求，校验 `context.baseSignature`，调用历史汇率服务，缓存汇率，并返回换算后的数值。

## 1. 服务职责

后端源码入口：

- `backend/server.ts`
- 构建后入口：`dist/backend/server.js`

服务提供两个 HTTP 接口：

- `GET /health`：健康检查，成功返回 `{ "ok": true }`。
- `POST /api/convert`：货币转换接口，供 Lark Field Shortcut FaaS 调用。

后端必须能访问外部汇率服务：

- `https://api.frankfurter.dev`

生产环境提供 HTTPS 公网域名：

```text
https://tools.openmia.ai/TimeFX/api/convert
```

Lark FaaS 侧的 `CONVERSION_BACKEND_URL` 使用这个正式地址，并重新执行字段捷径打包。字段捷径侧的 `addDomainList` 只允许填写 hostname，因此会放行 `tools.openmia.ai`，不要把 `/TimeFX/` 路径写进域名白名单。

## 2. 运行环境

推荐环境：

- Node.js 20 LTS。
- npm 10 或兼容版本。
- 可访问公网 HTTPS。
- 可通过环境变量配置服务。

安装、构建、启动：

```bash
npm install
npm run build
npm run server
```

`npm run server` 会启动：

```bash
node dist/backend/server.js
```

## 3. 必需环境变量

生产环境建议配置：

```bash
PORT=8787
LARK_SIGNATURE_VERIFY=true
LARK_EXPECTED_PACK_ID=<正式 Lark Field Shortcut packID>
RATE_CACHE_TTL_MS=21600000
LARK_BASE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxKNV23rheRvtUKDMJPOW\nGhUt+W25k63X4Q1QYhztPlobF2VNIDR6eHVFUDP22aytzVguisJ/GaOKZ7FJDKis\n9YvMUiCIFnfu1LWB4b4pa4ajmPk/Rr9DMSLz6frKRP0QqirWFe7t+u0K0nzzPe3/\na5ScSmJwYACmayQfLZFTFjyL0Z1SQFZM6pZ1J1w9ETxWI0NrpkMU7eqzVGvhf+OO\ndmxsXrHARWa1Ldm3WqPCF3k5jKuPG7s0zB+iuBHamSitZ7ktBf0mzBBjsAjKQll1\nkmdjryGbKX5sLXhEgOb5ndakYeA0Oy7vve2Hm78kH5MtaSv6MfNVjm5ForMjPAPQ\nBQIDAQAB\n-----END PUBLIC KEY-----"
```

变量说明：

| 变量 | 是否必需 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `PORT` | 否 | `8787` | 后端监听端口。 |
| `LARK_SIGNATURE_VERIFY` | 生产必需 | `true` | 是否校验 Lark `baseSignature`。生产必须保持 `true`。 |
| `LARK_EXPECTED_PACK_ID` | 生产必需 | 空 | 允许调用该后端的正式字段捷径 `packID`。 |
| `LARK_BASE_PUBLIC_KEY` | 建议显式配置 | 内置 Base 公钥 | 用于验证 `context.baseSignature` 的 Base 平台公钥。不是 app secret，也不是 tenant token。 |
| `RATE_CACHE_TTL_MS` | 否 | `21600000` | 进程内汇率缓存 TTL，默认 6 小时。 |

`LARK_BASE_PUBLIC_KEY` 支持两种形式：

- 真实多行 PEM。
- 单行环境变量，用 `\n` 表示换行。

本地调试阶段，Lark 的 `baseSignature` 是固定值，所有开发者拿到的一样；本地手工测试可以临时配置：

```bash
LARK_SIGNATURE_VERIFY=false
```

生产环境禁止关闭签名校验，必须同时校验签名、`exp` 和 `packID`。

## 4. API 契约

### 4.1 健康检查

请求：

```http
GET /health
```

成功响应：

```json
{
  "ok": true
}
```

### 4.2 货币转换

请求：

```http
POST /api/convert
Content-Type: application/json
X-Base-Signature: <context.baseSignature>
X-Base-Pack-ID: <context.packID>
```

请求体：

```json
{
  "date": "2026-05-21",
  "amount": 100,
  "from": "USD",
  "to": "CNY",
  "decimalPlaces": 2
}
```

字段要求：

- `date`：`YYYY-MM-DD`。
- `amount`：有限数字。
- `from` / `to`：3 位 ISO 4217 币种代码，例如 `USD`、`CNY`、`EUR`。
- `decimalPlaces`：只能是 `0`、`2`、`4`、`6`。

成功响应：

```json
{
  "ok": true,
  "date": "2026-05-21",
  "amount": 100,
  "from": "USD",
  "to": "CNY",
  "decimalPlaces": 2,
  "rate": 7.1,
  "rateDate": "2026-05-21",
  "convertedAmount": 710,
  "cached": false
}
```

错误响应格式：

```json
{
  "ok": false,
  "error": {
    "code": "RATE_DATE_UNAVAILABLE",
    "message": "No exchange rate is available for 2026-05-21."
  }
}
```

## 5. 业务规则

- 严格当天规则：如果外部汇率服务返回的 `date` 不等于请求的 `date`，后端必须返回 `422`，不能自动回退到前一交易日。
- 同币种转换：`from === to` 时不调用外部汇率服务，`rate = 1`，只按 `decimalPlaces` 四舍五入。
- 缓存 key：`date:from:to`。
- 缓存范围：当前实现为进程内缓存；多实例部署时，每个实例独立缓存。
- 外部 API：当前实现使用 Frankfurter v2 单币对历史汇率接口，后端自行计算 `amount * rate`。

## 6. 错误码和 HTTP 状态

| HTTP 状态 | 场景 |
| --- | --- |
| `400` | 请求体不是合法 JSON。 |
| `401` | 缺少或无法解析 `X-Base-Signature`。 |
| `403` | 签名无效、签名过期、`packID` 不匹配或来源不是 Base。 |
| `413` | 请求体超过 1MB。 |
| `422` | 日期、金额、币种、小数位非法，或严格当天汇率不可用。 |
| `502` | Frankfurter API 超时、网络错误、非 2xx 响应或响应格式异常。 |
| `500` | 服务配置错误或未预期异常。 |

## 7. 部署验收

### 7.1 构建与测试

部署前先执行：

```bash
npm test
npm run build
```

预期：

- 所有测试通过。
- `dist/backend/server.js` 存在。

### 7.2 健康检查

```bash
curl -i https://<your-domain>/health
```

预期：

```http
HTTP/1.1 200 OK
```

响应体：

```json
{"ok":true}
```

### 7.3 临时关闭签名校验测试

仅限本地或预发环境：

```bash
LARK_SIGNATURE_VERIFY=false npm run server
```

测试同币种转换：

```bash
curl -X POST http://127.0.0.1:8787/api/convert \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-21","amount":12.345,"from":"USD","to":"USD","decimalPlaces":2}'
```

预期：

```json
{
  "ok": true,
  "convertedAmount": 12.35
}
```

测试真实历史汇率：

```bash
curl -X POST http://127.0.0.1:8787/api/convert \
  -H "Content-Type: application/json" \
  -d '{"date":"2024-11-25","amount":100,"from":"USD","to":"EUR","decimalPlaces":2}'
```

如果外部汇率服务当天有数据，应返回 `200` 和 `convertedAmount`。

### 7.4 生产签名校验测试

生产环境保持：

```bash
LARK_SIGNATURE_VERIFY=true
```

不带 Lark headers 直接访问：

```bash
curl -i -X POST https://<your-domain>/api/convert \
  -H "Content-Type: application/json" \
  -d '{"date":"2024-11-25","amount":100,"from":"USD","to":"EUR","decimalPlaces":2}'
```

预期返回 `401` 或 `403`。只有 Lark FaaS 携带合法 `X-Base-Signature` 和 `X-Base-Pack-ID` 时才应通过。

## 8. 部署完成后交付给字段捷径侧的信息

部署同事完成后，请提供：

- 正式 HTTPS endpoint：`https://tools.openmia.ai/TimeFX/api/convert`。
- 正式 `LARK_EXPECTED_PACK_ID` 是否已经配置。
- `LARK_SIGNATURE_VERIFY=true` 是否已确认。
- `GET /health` 验收结果。
- 一次由 Lark FaaS 触发的真实转换测试结果。

字段捷径侧拿到正式 endpoint 后，需要：

1. 设置 `CONVERSION_BACKEND_URL=https://tools.openmia.ai/TimeFX/api/convert`。
2. 重新执行 `npm run pack`。
3. 上传新的字段捷径包。
