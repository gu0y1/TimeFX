# Lark Currency Field Shortcut

This project contains two parts:

- `src/`: Lark Base Field Shortcut FaaS entry.
- `backend/`: self-hosted conversion backend that verifies Lark traffic, fetches historical FX rates, caches rates, and returns the converted amount.

## Local Setup

```bash
npm install
npm test
npm run build
```

Run the backend locally:

```bash
npm run build
$env:LARK_EXPECTED_PACK_ID="replit_replace_with_real_pack_id"
$env:LARK_BASE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----`n...`n-----END PUBLIC KEY-----"
$env:CONVERSION_BACKEND_URL="http://127.0.0.1:8787/api/convert"
npm run server
```

For manual backend testing without Lark headers, temporarily set:

```bash
$env:LARK_SIGNATURE_VERIFY="false"
```

## Lark Field Shortcut

The shortcut creates a numeric result field and asks the user to configure:

- Transaction date: Date field.
- Original amount: Number field.
- Source currency: Text or SingleSelect field containing an ISO 4217 code, for example `USD`.
- Target currency: Text or SingleSelect field containing an ISO 4217 code, for example `CNY`.
- Decimal places: `0`, `2`, `4`, or `6`.

The FaaS calls `POST /api/convert` with:

```json
{
  "date": "2026-05-21",
  "amount": 100,
  "from": "USD",
  "to": "CNY",
  "decimalPlaces": 2
}
```

It sends Lark traffic identity headers:

- `X-Base-Signature`: `context.baseSignature`
- `X-Base-Pack-ID`: `context.packID`

## Backend Contract

Success response:

```json
{
  "ok": true,
  "date": "2026-05-21",
  "from": "USD",
  "to": "CNY",
  "amount": 100,
  "decimalPlaces": 2,
  "rate": 7.1,
  "rateDate": "2026-05-21",
  "convertedAmount": 710,
  "cached": false
}
```

Error response:

```json
{
  "ok": false,
  "error": {
    "code": "RATE_DATE_UNAVAILABLE",
    "message": "No exchange rate is available for 2026-05-21."
  }
}
```

The backend uses strict-date behavior. If the rate provider returns a different `date` than requested, the backend returns `422`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Backend HTTP port. |
| `CONVERSION_BACKEND_URL` | `http://127.0.0.1:8787/api/convert` | FaaS backend endpoint. |
| `LARK_SIGNATURE_VERIFY` | `true` | Enable Lark signature verification. |
| `LARK_EXPECTED_PACK_ID` | empty | Required when signature verification is enabled. |
| `LARK_BASE_PUBLIC_KEY` | built-in Base public key | Public key used to verify `context.baseSignature`. This is not an app secret or tenant token. |
| `RATE_CACHE_TTL_MS` | `21600000` | In-process rate cache TTL, default 6 hours. |

`LARK_BASE_PUBLIC_KEY` may be configured as a real multiline PEM value, or as a single line with escaped `\n` characters. The server normalizes both forms before calling `crypto.createVerify('RSA-SHA256')`.

For local Field Shortcut debugging, Lark uses a fixed `baseSignature` shared by developers, so `LARK_SIGNATURE_VERIFY=false` is acceptable for manual local checks. Production must keep `LARK_SIGNATURE_VERIFY=true` and validate the signature, `exp`, and `packID`.

## Publish

Use the Lark BaseKit CLI scripts:

```bash
npm run start
npm run pack
```

`npm run start` uses `block-basekit-cli start:field` for the Field Shortcut Debugging Assistant.
`npm run pack` uses `block-basekit-cli pack:field` and writes a zip under `output/`.
The local default uses `127.0.0.1` instead of `localhost` because the current BaseKit CLI package rejects the literal `localhost` during field packaging, while it accepts IPv4 loopback addresses.

Before publishing, replace the local backend URL with the deployed backend URL through `CONVERSION_BACKEND_URL`, and ensure the deployed backend hostname is the one allowed by `basekit.addDomainList`.
