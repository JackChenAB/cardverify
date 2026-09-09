import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CryptoService } from '../src/crypto/crypto.service';
import { signRequest, verifyResponse } from './sign';

// These tests need a Postgres reachable via DATABASE_URL. When absent we skip
// the suite rather than fail, so `npm run test:e2e` is safe without infra.
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d('Client + Admin API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crypto: CryptoService;
  let pubPem: string;
  let token: string;
  const appSecret = process.env.APP_SECRET as string;
  const createdCodes: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(json({ verify: (req: any, _r, buf) => (req.rawBody = buf.toString('utf8')) }));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    crypto = app.get(CryptoService);
    pubPem = crypto.getPublicKeyPem();

    const res = await request(app.getHttpServer())
      .post('/admin/login')
      .send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
    token = res.body.access_token;
  });

  afterAll(async () => {
    if (createdCodes.length) {
      await prisma.cardKey.deleteMany({ where: { code: { in: createdCodes } } });
    }
    await app?.close();
  });

  async function makeCard(durationDays: number | null): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/admin/cards/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'e2e', count: 1, durationDays });
    const code = res.body.codes[0];
    createdCodes.push(code);
    return code;
  }

  function signedPost(path: string, body: unknown) {
    const { headers } = signRequest(appSecret, 'POST', path, body);
    return request(app.getHttpServer()).post(path).set(headers).send(body);
  }

  it('logs in as the seeded admin', () => {
    expect(token).toBeTruthy();
  });

  it('activates a card, returns a verifiable signed OK', async () => {
    const code = await makeCard(30);
    const res = await signedPost('/api/v1/activate', { code, hwid: 'HW-AAA' });
    expect(res.status).toBe(201);
    expect(verifyResponse(pubPem, res.body.payload, res.body.sig)).toBe(true);
    const data = JSON.parse(res.body.payload);
    expect(data.valid).toBe(true);
    expect(data.result).toBe('OK');
    expect(data.expiresAt).toBeTruthy();
  });

  it('verifies the same card on the same HWID', async () => {
    const code = await makeCard(30);
    await signedPost('/api/v1/activate', { code, hwid: 'HW-BBB' });
    const res = await signedPost('/api/v1/verify', { code, hwid: 'HW-BBB' });
    const data = JSON.parse(res.body.payload);
    expect(data.valid).toBe(true);
  });

  it('rejects a second HWID (HWID_MISMATCH)', async () => {
    const code = await makeCard(30);
    await signedPost('/api/v1/activate', { code, hwid: 'HW-1' });
    const res = await signedPost('/api/v1/verify', { code, hwid: 'HW-2' });
    const data = JSON.parse(res.body.payload);
    expect(data.valid).toBe(false);
    expect(data.result).toBe('HWID_MISMATCH');
  });

  it('allows re-bind after admin unbind, keeping time', async () => {
    const code = await makeCard(30);
    await signedPost('/api/v1/activate', { code, hwid: 'HW-OLD' });
    const card = await prisma.cardKey.findUnique({ where: { code } });
    await request(app.getHttpServer())
      .patch(`/admin/cards/${card!.id}/unbind`)
      .set('Authorization', `Bearer ${token}`);
    const res = await signedPost('/api/v1/activate', { code, hwid: 'HW-NEW' });
    const data = JSON.parse(res.body.payload);
    expect(data.valid).toBe(true);
    const after = await prisma.cardKey.findUnique({ where: { code } });
    expect(after!.hwid).toBe('HW-NEW');
  });

  it('rejects an unsigned client request', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/verify')
      .send({ code: 'WHATEVER-CODE', hwid: 'HW' });
    expect(res.status).toBe(401);
  });

  it('rejects a replayed nonce', async () => {
    const code = await makeCard(30);
    const body = { code, hwid: 'HW-REPLAY' };
    const { headers } = signRequest(appSecret, 'POST', '/api/v1/verify', body);
    const first = await request(app.getHttpServer())
      .post('/api/v1/verify')
      .set(headers)
      .send(body);
    expect(first.status).toBe(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/verify')
      .set(headers)
      .send(body);
    expect(second.status).toBe(401);
  });

  it('heartbeat session marks the card online in the admin list', async () => {
    const code = await makeCard(30);
    await signedPost('/api/v1/activate', { code, hwid: 'HW-HB' });
    await signedPost('/api/v1/verify', { code, hwid: 'HW-HB', session: 'sess-online' });
    const list = await request(app.getHttpServer())
      .get('/admin/cards')
      .query({ code })
      .set('Authorization', `Bearer ${token}`);
    const row = list.body.items.find((c: any) => c.code === code);
    expect(row.online).toBe(true);
    expect(row.sessionId).toBe('sess-online');
  });

  it('顶号: a takeover beat kicks the prior session (signed CONCURRENT_SESSION)', async () => {
    const code = await makeCard(30);
    await signedPost('/api/v1/activate', { code, hwid: 'HW-KICK' });
    await signedPost('/api/v1/verify', { code, hwid: 'HW-KICK', session: 'S1', takeover: true });
    await signedPost('/api/v1/verify', { code, hwid: 'HW-KICK', session: 'S2', takeover: true });
    const res = await signedPost('/api/v1/verify', { code, hwid: 'HW-KICK', session: 'S1' });
    expect(verifyResponse(pubPem, res.body.payload, res.body.sig)).toBe(true);
    const data = JSON.parse(res.body.payload);
    expect(data.valid).toBe(false);
    expect(data.result).toBe('CONCURRENT_SESSION');
  });
});
