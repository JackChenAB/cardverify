import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable the built-in body parser so OURS (below) runs first and can capture
  // the raw body — re-parsing an already-consumed stream would lose it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Capture the raw request body so the HMAC signature can be verified over the
  // exact bytes the client signed (re-stringifying JSON would not be byte-stable).
  app.use(
    json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // Behind nginx: trust the proxy so req.ip reflects X-Forwarded-For.
  app.set('trust proxy', true);

  // nginx handles TLS in production; enable CORS only for local dev.
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors();
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`cardverify backend listening on :${port}`);
}
bootstrap();
