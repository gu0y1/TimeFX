import * as http from 'http';
import { CurrencyConverter, ExchangeRateError, FrankfurterRateProvider } from './exchange-service';
import { normalizePublicKey, verifyLarkSignature } from './lark-signature';

interface ServerConfig {
  port: number;
  expectedPackID: string;
  verifySignature: boolean;
  cacheTtlMs: number;
  basePublicKey: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT || 8787),
    expectedPackID: env.LARK_EXPECTED_PACK_ID || '',
    verifySignature: env.LARK_SIGNATURE_VERIFY !== 'false',
    cacheTtlMs: Number(env.RATE_CACHE_TTL_MS || 21600000),
    basePublicKey: normalizePublicKey(env.LARK_BASE_PUBLIC_KEY),
  };
}

export function createRequestHandler(
  config: ServerConfig,
  converter = new CurrencyConverter(new FrankfurterRateProvider(), config.cacheTtlMs),
) {
  return async (request: http.IncomingMessage, response: http.ServerResponse) => {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (request.method !== 'POST' || request.url !== '/api/convert') {
        writeJson(response, 404, errorBody('NOT_FOUND', 'Route not found.'));
        return;
      }

      if (config.verifySignature) {
        const auth = verifyLarkSignature({
          signature: request.headers['x-base-signature'],
          packID: request.headers['x-base-pack-id'],
          expectedPackID: config.expectedPackID,
          publicKey: config.basePublicKey,
        });
        if (!auth.ok) {
          writeJson(response, auth.status, errorBody(auth.code, auth.message));
          return;
        }
      }

      const body = await readJsonBody(request);
      const result = await converter.convert(body);
      writeJson(response, 200, result);
    } catch (error) {
      if (error instanceof ExchangeRateError) {
        writeJson(response, error.status, errorBody(error.code, error.message));
        return;
      }

      if (error instanceof SyntaxError) {
        writeJson(response, 400, errorBody('BAD_JSON', error.message));
        return;
      }

      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      writeJson(response, 500, errorBody('INTERNAL_ERROR', message));
    }
  };
}

export function startServer(config = loadConfig()) {
  const handler = createRequestHandler(config);
  const server = http.createServer(handler);

  server.listen(config.port, () => {
    console.log(`Currency conversion backend listening on http://localhost:${config.port}`);
    if (config.verifySignature && !config.expectedPackID) {
      console.warn('LARK_SIGNATURE_VERIFY is enabled, but LARK_EXPECTED_PACK_ID is empty. Conversion requests will be rejected.');
    }
  });

  return server;
}

if (require.main === module) {
  startServer();
}

function errorBody(code: string, message: string) {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function writeJson(response: http.ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function readJsonBody(request: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 1024 * 1024) {
        reject(new ExchangeRateError(413, 'BODY_TOO_LARGE', 'Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });

    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        reject(new SyntaxError('Request body must be JSON.'));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}
