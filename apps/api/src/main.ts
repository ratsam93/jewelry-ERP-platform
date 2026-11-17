import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { LoggingInterceptor } from './common/logging.interceptor';
import { getJwtSecret } from './common/jwt-secret';
import { installBigIntJson } from './common/bigint-json';

// Swagger is served at /api/docs (ignoreGlobalPrefix). The gate also covers the
// global-prefixed variants so no docs path is left unprotected.
const SWAGGER_GATED_PATHS = [
  '/api/docs',
  '/api/docs-json',
  '/api/v1/api/docs',
  '/api/v1/api/docs-json',
];

/** TRUST_PROXY: 'true' | 'false' | hop count | Express trust-proxy string. Default 1 hop. */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = (raw ?? '1').trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/** Constant-time string comparison (hashing first so lengths do not leak). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

function swaggerBasicAuthGate(user: string, password: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const challenge = () => {
      res.set('WWW-Authenticate', 'Basic realm="CaratFlow API Docs"');
      res.status(401).send('Authentication required');
    };
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Basic ')) {
      challenge();
      return;
    }
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sepIdx = decoded.indexOf(':');
    if (sepIdx < 0) {
      challenge();
      return;
    }
    const nameOk = safeEqual(decoded.slice(0, sepIdx), user);
    const passOk = safeEqual(decoded.slice(sepIdx + 1), password);
    if (!(nameOk && passOk)) {
      challenge();
      return;
    }
    next();
  };
}

async function bootstrap() {
  // Must run before any response is serialized: REST routes return Prisma BigInt fields.
  installBigIntJson();

  // Fail fast: in production this throws unless JWT_SECRET is set (>= 32 chars).
  getJwtSecret();

  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Hide framework fingerprint (D-045) and honour the reverse proxy for client IPs
  // (rate limiting, logs).
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance?.() as
    | {
        disable?: (k: string) => void;
        set?: (k: string, v: unknown) => void;
      }
    | undefined;
  instance?.disable?.('x-powered-by');
  instance?.set?.('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

  const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true';

  // Security headers (D-038)
  app.use(
    helmet({
      // JSON API: strict CSP. Only relaxed (disabled) while Swagger UI is served, as it inlines scripts.
      contentSecurityPolicy: swaggerEnabled
        ? false
        : {
            useDefaults: false,
            directives: {
              defaultSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'none'"],
            },
          },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS — entries are trimmed and empty entries dropped.
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Customer-Id', 'X-Session-Id'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter — formats unhandled errors as ApiResponse (D-039)
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Request/response logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // API prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'api/v1/*path'],
  });

  // Swagger — OFF unless SWAGGER_ENABLED=true (D-026). In production it also needs
  // SWAGGER_USER/SWAGGER_PASSWORD, otherwise it is refused.
  const isProd = process.env.NODE_ENV === 'production';
  let docsMounted = false;
  if (swaggerEnabled) {
    const swaggerUser = process.env.SWAGGER_USER;
    const swaggerPassword = process.env.SWAGGER_PASSWORD;
    if (isProd && (!swaggerUser || !swaggerPassword)) {
      console.warn(
        '[CARATFLOW] SWAGGER_ENABLED=true in production but SWAGGER_USER/SWAGGER_PASSWORD are not set — refusing to expose docs',
      );
    } else {
      if (swaggerUser && swaggerPassword) {
        app.use(SWAGGER_GATED_PATHS, swaggerBasicAuthGate(swaggerUser, swaggerPassword));
      } else {
        console.warn('[CARATFLOW] Swagger enabled without SWAGGER_USER/SWAGGER_PASSWORD (non-production only)');
      }
      mountSwagger(app);
      docsMounted = true;
    }
  }

  const port = process.env.API_PORT ?? 4000;
  await app.listen(port);
  console.warn(`CaratFlow API running on http://localhost:${port}`);
  if (docsMounted) {
    console.warn(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}

function mountSwagger(app: INestApplication): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CaratFlow API')
    .setDescription('Jewelry ERP System API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication & authorization')
    .addTag('health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, { useGlobalPrefix: false });
}

bootstrap();
