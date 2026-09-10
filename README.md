# 卡密驗證系統 (Card-Key / License Verification)

Vue 3 管理後台 + NestJS 後端 + PostgreSQL + Redis，一鍵 Docker 部署。
用途：軟體授權／啟用驗證。原生客戶端啟動時呼叫 API 驗證卡密是否有效。

## 功能
- **時效卡密**：首次啟用後計時，支援永久卡。
- **HWID 綁機**：一卡一機，後台可解綁換機（保留剩餘時間）。
- **管理後台**：批量產卡、查詢/篩選、封禁/解封、解綁、刪除、匯出 CSV、統計儀表板。
- **防破解**：
  - 請求 **HMAC-SHA256 簽章** + 時間戳 + nonce 防重放。
  - 回應 **Ed25519 簽章**，客戶端內嵌公鑰驗章 → 假伺服器無法偽造「有效」。
  - Nginx 反向代理（上線請加 TLS）。

## 架構
```
[原生客戶端] --簽章--> Nginx(:8080) --/api--> [NestJS backend:3000] --> [PostgreSQL]
[管理者瀏覽器] -------> Nginx(:8080) --/admin-->                         [Redis] (nonce/限流)
                         └ 靜態 Vue 後台
```

## 快速開始
```bash
# 1. 準備環境變數
cp .env.example .env

# 2. 產生密鑰並填入 .env（APP_SECRET / JWT_SECRET / ED25519_*）
cd backend && node scripts/genkeys.js   # 將輸出的幾行貼進 .env，記下 PEM 公鑰
cd ..

# 3. 編輯 .env：設定資料庫密碼、初始管理員帳密
# 4. 啟動
docker compose up -d --build
```
- 後台： http://localhost:8080 （用 `.env` 的 `ADMIN_USERNAME/ADMIN_PASSWORD` 登入）
- 客戶端 API： `POST http://localhost:8080/api/v1/activate`、`/api/v1/verify`

## Docker Compose 設定
```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}
      interval: 5s
      timeout: 5s
      retries: 10
  redis:
    image: redis:7-alpine
    restart: unless-stopped
  backend:
    build: ./backend
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      PORT: "3000"
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
      REDIS_URL: redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - ${HTTP_PORT:-8080}:80
    depends_on:
      - backend
    # default: reach `backend` internally; npm_bridge: reachable by Nginx Proxy
    # Manager for a domain + HTTPS (proxy target: verify-frontend:80).
    networks:
      - default
      - npm_bridge
volumes:
  pgdata: null
networks:
  npm_bridge:
    external: true
```

## 客戶端串接
1. 把 `APP_SECRET` 與 Ed25519 **公鑰 PEM**（後台「統計儀表板」可複製）內嵌到你的客戶端程式。
2. 每次請求帶 header：`x-timestamp`(unix ms)、`x-nonce`(隨機 hex)、`x-signature`(HMAC-SHA256)。
   簽章字串：`METHOD\nPATH\nTIMESTAMP\nNONCE\nRAW_BODY`。
3. **務必驗證回應的 Ed25519 簽章**後才信任 `valid:true`。
4. 參考實作：`client-example/verify.js`
```bash
APP_SECRET=xxx SERVER_PUBLIC_KEY_PEM="$(cat pub.pem)" \
  node client-example/verify.js activate ABCD-EF23-GHJK-LMNP HW-001 http://localhost:8080
```

## API
### 客戶端（簽章保護，回應為 `{payload, sig}`）
| Method | Path | Body | 說明 |
|---|---|---|---|
| POST | /api/v1/activate | `{code, hwid}` | 首次啟用綁機並計時；之後同機回 OK |
| POST | /api/v1/verify | `{code, hwid, session?, takeover?}` | 心跳驗證（不啟用未使用卡）；帶 `session` 啟用在線/多開檢測 |

`payload` 解出後欄位：`{action, valid, result, expiresAt, nonce, serverTime}`
`result` ∈ `OK | NOT_FOUND | BANNED | EXPIRED | HWID_MISMATCH | NOT_ACTIVATED | CONCURRENT_SESSION`

**心跳 / 在線 / 多開（顶号）**：客戶端每 ~2 分鐘調一次 `verify`，帶 per-process 隨機 `session`。
進程啟動時首發一次 `takeover:true` 搶占會話；同機第二個實例啟動會頂掉前一個，被頂實例下次心跳收到
`CONCURRENT_SESSION` 後退出。跨機器多開仍由 HWID 綁定擋下。後台 `GET /admin/cards` 每張卡多回
`online`（`lastSeenAt > now − HEARTBEAT_ONLINE_TTL_S`）、`lastSeenAt`、`sessionId`。
參考實作見 `client-example/verify.js heartbeat <CODE>`（Rust 版同）。
相關環境變數：`HEARTBEAT_ONLINE_TTL_S`(360)、`SESSION_STALE_TTL_S`(360)、`MULTIOPEN_POLICY`(kick-old)。

### 後台（JWT，`Authorization: Bearer`）
`POST /admin/login`、`POST /admin/cards/batch`、`GET /admin/cards`、`GET /admin/cards/export`、
`PATCH /admin/cards/:id/{ban,unban,unbind}`、`DELETE /admin/cards/:id`、`GET /admin/stats`、`GET /admin/pubkey`

## 開發
```bash
# backend
cd backend && npm i && npm run test          # 卡密狀態機單元測試
DATABASE_URL=... npm run test:e2e            # e2e（需 Postgres，未設則自動 skip）
npm run start:dev
# frontend
cd frontend && npm i && npm run dev          # http://localhost:5173 (proxy 到 :3000)
```

## 安全說明
```
客戶端內嵌的 `APP_SECRET` 可被逆向取出——真正的保證在「**伺服器端狀態 + 回應的 Ed25519 簽章**」：
攻擊者即使改 hosts／攔截改回 `valid:true`，沒有伺服器私鑰也無法產生有效簽章。
上線務必：使用 HTTPS、妥善保管 `ED25519_PRIVATE_KEY`、定期更換密鑰、限制資料庫對外。
```
