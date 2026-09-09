//! Rust console sample for the cardverify license API.
//!
//! Demonstrates the full client protocol:
//!   1. HMAC-SHA256 request signing  (shared APP_SECRET, embedded in the client)
//!   2. timestamp + random nonce      (replay protection)
//!   3. Ed25519 response verification  (server private key signs; client holds the
//!      public key — so a fake/MITM server cannot forge a "valid" answer)
//!
//! Usage:
//!   APP_SECRET=<secret> cargo run -- <activate|verify|heartbeat> <CODE> [HWID]
//!
//! `heartbeat` runs the long-lived loop: it claims the session (顶号 — kicking any
//! older instance), then beats every HEARTBEAT_INTERVAL_S seconds and EXITS if the
//! server reports CONCURRENT_SESSION (a newer instance took over) or invalid.
//!
//! Config (compiled-in defaults, overridable by env):
//!   APP_SECRET             (REQUIRED — no default; the shared HMAC secret)
//!   SERVER_URL             default https://card.smallab.win
//!   SERVER_PUBLIC_KEY_PEM  default = the embedded key below
//!   HWID                   default = derived from the machine
//!   SESSION                default = random per-process id
//!   HEARTBEAT_INTERVAL_S   default 120 (heartbeat action only)
//!
//! In a real native client you would embed APP_SECRET + the public key in the
//! binary (obfuscated), and derive a stable hardware fingerprint for HWID.

use base64::{engine::general_purpose, Engine as _};
use ed25519_dalek::pkcs8::DecodePublicKey;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

// The Ed25519 PUBLIC key is meant to be embedded in clients (it is public).
// Get yours from the admin dashboard, or: `echo $ED25519_PUBLIC_KEY | base64 -d`.
const DEFAULT_PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----\n\
MCowBQYDK2VwAyEAg68zo7CWebuf97ovcoATjFsCSxPspfPnIvkT+4BKAMg=\n\
-----END PUBLIC KEY-----\n";

const DEFAULT_SERVER_URL: &str = "https://card.smallab.win";

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

/// Derives a HWID. Replace with a real hardware fingerprint in production.
fn derive_hwid() -> String {
    if let Ok(h) = std::env::var("HWID") {
        return sanitize_hwid(&h);
    }
    // Linux: stable per-install machine id.
    if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
        let id = id.trim();
        if !id.is_empty() {
            return sanitize_hwid(id);
        }
    }
    // Windows / fallback.
    for k in ["COMPUTERNAME", "HOSTNAME", "USERNAME"] {
        if let Ok(v) = std::env::var(k) {
            if !v.is_empty() {
                return sanitize_hwid(&format!("{k}-{v}"));
            }
        }
    }
    "unknown-host".to_string()
}

/// Keep only characters the server accepts: [A-Za-z0-9._:-], min length 4.
fn sanitize_hwid(raw: &str) -> String {
    let mut s: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-'))
        .collect();
    while s.len() < 4 {
        s.push('0');
    }
    s.truncate(128);
    s
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before epoch")
        .as_millis()
}

fn random_nonce() -> String {
    let mut buf = [0u8; 16];
    getrandom::getrandom(&mut buf).expect("OS RNG failed");
    hex::encode(buf)
}

/// One session id per process — distinguishes concurrent instances on one machine.
fn default_session() -> String {
    let mut buf = [0u8; 12];
    getrandom::getrandom(&mut buf).expect("OS RNG failed");
    format!("sess-{}", hex::encode(buf))
}

fn build_agent() -> Result<ureq::Agent, Box<dyn std::error::Error>> {
    // ureq's convenience fns use a default agent with no TLS backend; wire up
    // native-tls explicitly so https works (Windows → SChannel, no ring/NASM).
    Ok(ureq::builder()
        .tls_connector(std::sync::Arc::new(native_tls::TlsConnector::new()?))
        .build())
}

/// Signs + sends one request and returns the signature-verified response `data`.
fn call_once(
    agent: &ureq::Agent,
    app_secret: &str,
    server: &str,
    pubkey_pem: &str,
    action: &str,
    body_obj: Value,
) -> Result<Value, Box<dyn std::error::Error>> {
    let path = format!("/api/v1/{action}");
    let url = format!("{server}{path}");

    // Body MUST be the exact bytes we sign — build the string once, send it as-is.
    let body = body_obj.to_string();
    let ts = unix_millis().to_string();
    let nonce = random_nonce();
    let signature = hmac_hex(app_secret, &signing_string("POST", &path, &ts, &nonce, &body));

    let response = agent
        .post(&url)
        .set("content-type", "application/json")
        .set("x-timestamp", &ts)
        .set("x-nonce", &nonce)
        .set("x-signature", &signature)
        .send_string(&body);

    let text = match response {
        Ok(resp) => resp.into_string()?,
        Err(ureq::Error::Status(code, resp)) => {
            // 401 = signature/replay rejected by the guard (never trust this path).
            let detail = resp.into_string().unwrap_or_default();
            return err(format!("request rejected (HTTP {code}): {detail}"));
        }
        Err(e) => return err(format!("network error: {e}")),
    };

    // Envelope: { "payload": "<json string>", "sig": "<base64 ed25519>" }
    let envelope: Value = serde_json::from_str(&text)?;
    let payload = envelope
        .get("payload")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError("missing payload".into()))?;
    let sig_b64 = envelope
        .get("sig")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError("missing sig".into()))?;

    // CRITICAL: verify the Ed25519 signature over the exact payload bytes before
    // trusting anything. Without this, a fake server could return valid:true.
    let vk = VerifyingKey::from_public_key_pem(pubkey_pem)
        .map_err(|e| AppError(format!("bad public key: {e}")))?;
    let sig_bytes = general_purpose::STANDARD.decode(sig_b64)?;
    let sig = Signature::from_slice(&sig_bytes).map_err(|e| AppError(format!("bad sig: {e}")))?;
    vk.verify(payload.as_bytes(), &sig)
        .map_err(|_| AppError("SERVER SIGNATURE INVALID — refusing to trust response".into()))?;

    Ok(serde_json::from_str(payload)?)
}

/// Long-running heartbeat: claim the session, then beat until kicked or invalid.
fn heartbeat_loop(
    agent: &ureq::Agent,
    app_secret: &str,
    server: &str,
    pubkey_pem: &str,
    code: &str,
    hwid: &str,
    session: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let interval_s: u64 = env_or("HEARTBEAT_INTERVAL_S", "120").parse().unwrap_or(120);
    println!("session: {session}  interval: {interval_s}s");
    // First beat takes over (顶号): kicks any older instance holding this card.
    let mut takeover = true;
    loop {
        let body = serde_json::json!({
            "code": code, "hwid": hwid, "session": session, "takeover": takeover
        });
        let data = call_once(agent, app_secret, server, pubkey_pem, "verify", body)?;
        let valid = data.get("valid").and_then(Value::as_bool).unwrap_or(false);
        let result = data.get("result").and_then(Value::as_str).unwrap_or("?");
        println!("[{}] result={result} valid={valid}", unix_millis());

        if result == "CONCURRENT_SESSION" {
            eprintln!("kicked by a newer instance (顶号) — exiting.");
            std::process::exit(3);
        }
        if !valid {
            eprintln!("license no longer valid ({result}) — exiting.");
            return Ok(false);
        }
        takeover = false; // subsequent beats only maintain the session
        std::thread::sleep(Duration::from_secs(interval_s));
    }
}

/// Builds the canonical string the server re-creates and HMACs:
/// METHOD\nPATH\nTIMESTAMP\nNONCE\nRAW_BODY
fn signing_string(method: &str, path: &str, ts: &str, nonce: &str, body: &str) -> String {
    format!("{method}\n{path}\n{ts}\n{nonce}\n{body}")
}

fn hmac_hex(secret: &str, message: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC key");
    mac.update(message.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

#[derive(Debug)]
struct AppError(String);
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
impl std::error::Error for AppError {}
fn err<T>(msg: impl Into<String>) -> Result<T, Box<dyn std::error::Error>> {
    Err(Box::new(AppError(msg.into())))
}

fn print_help(prog: &str) {
    println!(
        "cardverify-client — 卡密啟用 / 驗證工具

用法:
    {prog} <activate|verify|heartbeat> <CODE> [HWID]

動作:
    activate   首次啟用卡密（綁定本機 HWID 並開始計時）
    verify     心跳驗證（不會啟用未使用的卡）
    heartbeat  長駐心跳：先搶占會話（顶号），之後每隔 HEARTBEAT_INTERVAL_S 秒驗證一次；
               被新實例頂掉（CONCURRENT_SESSION）或失效時退出

參數:
    CODE       卡號，例如 ABCD-EF23-GHJK-LMNP
    HWID       選填；省略則由本機推導（MAC / 主機名）

環境變數:
    APP_SECRET             必填，HMAC 共享密鑰
    SERVER_URL             伺服器位址（預設 {default}）
    SERVER_PUBLIC_KEY_PEM  伺服器 Ed25519 公鑰 PEM（驗證回應簽章；預設內建）
    HWID                   覆寫機器碼
    SESSION                覆寫本進程會話 id（預設隨機）
    HEARTBEAT_INTERVAL_S   心跳間隔秒數（預設 120；僅 heartbeat 動作）

結束碼:
    0  有效    1  無效(過期/換機/封禁)    2  錯誤(網路/簽章/參數)    3  被頂號

範例:
    APP_SECRET=xxxx {prog} activate ABCD-EF23-GHJK-LMNP
    APP_SECRET=xxxx SERVER_URL=https://card.smallab.win {prog} verify ABCD-EF23-GHJK-LMNP HW-001",
        prog = prog,
        default = DEFAULT_SERVER_URL,
    );
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let prog = args.first().map(String::as_str).unwrap_or("cardverify-client");
    if args.len() < 2 || matches!(args[1].as_str(), "-h" | "--help" | "help") {
        print_help(prog);
        std::process::exit(0);
    }
    std::process::exit(match run() {
        Ok(valid) => {
            if valid {
                0
            } else {
                1
            }
        }
        Err(e) => {
            eprintln!("error: {e}");
            2
        }
    });
}

fn run() -> Result<bool, Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        return err(format!(
            "usage: {} <activate|verify|heartbeat> <CODE> [HWID]",
            args.first().map(String::as_str).unwrap_or("cardverify-client")
        ));
    }
    let action = args[1].as_str();
    if !matches!(action, "activate" | "verify" | "heartbeat") {
        return err("action must be 'activate', 'verify' or 'heartbeat'");
    }
    let code = args[2].clone();
    let hwid = args.get(3).cloned().unwrap_or_else(derive_hwid);

    let app_secret = std::env::var("APP_SECRET")
        .map_err(|_| AppError("APP_SECRET env var is required".into()))?;
    let server = env_or("SERVER_URL", DEFAULT_SERVER_URL);
    let pubkey_pem = env_or("SERVER_PUBLIC_KEY_PEM", DEFAULT_PUBLIC_KEY_PEM);
    let session = env_or("SESSION", &default_session());
    let agent = build_agent()?;

    println!("→ {action}  code={code}  hwid={hwid}");

    if action == "heartbeat" {
        return heartbeat_loop(&agent, &app_secret, &server, &pubkey_pem, &code, &hwid, &session);
    }

    // One-shot activate/verify. verify carries the session id for online tracking.
    let body = if action == "verify" {
        serde_json::json!({ "code": code, "hwid": hwid, "session": session })
    } else {
        serde_json::json!({ "code": code, "hwid": hwid })
    };
    let data = call_once(&agent, &app_secret, &server, &pubkey_pem, action, body)?;
    println!("✓ server signature verified");

    let valid = data.get("valid").and_then(Value::as_bool).unwrap_or(false);
    let result = data.get("result").and_then(Value::as_str).unwrap_or("?");
    let expires = data.get("expiresAt").and_then(Value::as_str).unwrap_or("—");

    if valid {
        println!("✅ VALID   result={result}   expiresAt={expires}");
    } else {
        println!("❌ INVALID result={result}");
    }
    Ok(valid)
}
