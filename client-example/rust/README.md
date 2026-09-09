# cardverify — Rust 客戶端範例

對應 `../verify.js` 的 Rust 版本，示範原生客戶端如何安全呼叫卡密驗證 API：

1. **HMAC-SHA256 請求簽章**（內嵌 `APP_SECRET`）+ 時間戳 + nonce 防重放
2. **Ed25519 回應驗章**（內嵌伺服器公鑰）——驗證通過才信任 `valid:true`，
   假伺服器/中間人即使改回 `valid:true` 也無法偽造簽章

## 編譯 / 執行
```bash
# 需要 Rust 工具鏈 (https://rustup.rs)
cd client-example/rust

# APP_SECRET 從伺服器 prod.env 取得（請勿寫進原始碼/版控）
export APP_SECRET=<你的 APP_SECRET>

# 啟用卡密（首次啟用會綁定 HWID 並開始計時）
cargo run -- activate ABCD-EF23-GHJK-LMNP

# 心跳驗證（指定 HWID；不給則由本機 /etc/machine-id 推導）
cargo run -- verify ABCD-EF23-GHJK-LMNP HW-001
```

## 設定（編譯內建預設，可用環境變數覆寫）
| 變數 | 預設 | 說明 |
|---|---|---|
| `APP_SECRET` | （無，**必填**） | HMAC 共享密鑰 |
| `SERVER_URL` | `https://card.smallab.win` | 伺服器位址 |
| `SERVER_PUBLIC_KEY_PEM` | 內建公鑰 | 伺服器 Ed25519 公鑰 PEM |
| `HWID` | 由機器推導 | 機器碼（正式環境請用真實硬體指紋） |

## 結束碼
- `0` = 驗證有效（`valid:true`）
- `1` = 驗證無效（過期 / HWID 不符 / 封禁…）
- `2` = 錯誤（網路、簽章不符、參數錯誤）

## 正式環境注意
- `APP_SECRET` 與公鑰應在 build 時內嵌並做混淆；公鑰可公開（本來就要內嵌），`APP_SECRET` 屬縱深防禦。
- 真正的安全保證在「伺服器狀態 + 回應 Ed25519 簽章」，務必保留 `vk.verify(...)` 那段。
- `release` build：`cargo build --release`，輸出 `target/release/cardverify-client`。
