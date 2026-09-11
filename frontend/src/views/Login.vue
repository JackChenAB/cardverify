<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { adminApi } from '../api';
import { useAuthStore } from '../store/auth';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

async function submit() {
  if (!form.username || !form.password) {
    ElMessage.warning('請輸入帳號與密碼');
    return;
  }
  loading.value = true;
  try {
    const res = await adminApi.login(form.username, form.password);
    auth.setSession(res.access_token, res.username);
    router.push({ name: 'cards' });
  } catch {
    ElMessage.error('登入失敗，帳號或密碼錯誤');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-wrap">
    <section class="login-story">
      <div class="story-top"><div class="story-mark">K</div><span>KEYLINE / LICENSE CONTROL</span></div>
      <div class="story-content">
        <p class="story-kicker">SECURE ACCESS INFRASTRUCTURE</p>
        <h1>讓每一組授權，<br /><em>清晰可控。</em></h1>
        <p>集中管理卡密生命週期、裝置綁定與即時啟用狀態，將複雜的授權流程留在一道簡潔介面之後。</p>
        <div class="story-metrics">
          <div><strong>24/7</strong><span>狀態監控</span></div>
          <div><strong>Ed25519</strong><span>簽章驗證</span></div>
          <div><strong>01</strong><span>管理入口</span></div>
        </div>
      </div>
      <div class="signal-art" aria-hidden="true"><div class="signal-ring ring-a" /><div class="signal-ring ring-b" /><div class="signal-dot" /></div>
      <div class="story-foot"><span>AUTH GATEWAY</span><span>TAIPEI · {{ new Date().getFullYear() }}</span></div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <p class="eyebrow">ADMINISTRATOR ACCESS</p>
        <h2>歡迎回來</h2>
        <p class="login-note">請使用管理員憑證進入授權控制中心。</p>
        <el-form label-position="top" @submit.prevent="submit">
          <el-form-item label="管理員帳號">
            <el-input v-model="form.username" size="large" placeholder="輸入帳號" prefix-icon="User" autocomplete="username" />
          </el-form-item>
          <el-form-item label="安全密碼">
            <el-input v-model="form.password" size="large" type="password" placeholder="輸入密碼" prefix-icon="Lock" autocomplete="current-password" show-password @keyup.enter="submit" />
          </el-form-item>
          <el-button type="primary" size="large" :loading="loading" class="submit-button" @click="submit">
            <span>進入控制中心</span><span aria-hidden="true">↗</span>
          </el-button>
        </el-form>
        <div class="secure-note"><Lock /><span>登入連線受到加密保護</span></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-wrap { display: grid; min-height: 100vh; grid-template-columns: minmax(0,1.15fr) minmax(420px,.85fr); background: var(--canvas); }
.login-story { position: relative; display: flex; min-height: 100vh; flex-direction: column; overflow: hidden; padding: clamp(28px,5vw,68px); color: #f3f7eb; background: radial-gradient(circle at 85% 10%, rgba(183,243,107,.19), transparent 28%), linear-gradient(145deg,#183c31,#0a1b16 68%); }
.login-story::before { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px); background-size: 54px 54px; content: ''; }
.story-top, .story-foot, .story-content { position: relative; z-index: 2; }
.story-top { display: flex; align-items: center; gap: 12px; color: rgba(243,247,235,.68); font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: .14em; }
.story-mark { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 12px 4px; color: var(--night); background: var(--mint); font-family: 'Syne',sans-serif; font-size: 18px; font-weight: 700; }
.story-content { max-width: 760px; margin: auto 0; padding: 80px 0; }
.story-kicker { margin: 0 0 20px; color: var(--mint); font-family: 'DM Mono',monospace; font-size: 10px; letter-spacing: .18em; }
.story-content h1 { max-width: 700px; margin: 0; font-family: 'Syne',sans-serif; font-size: clamp(44px,6vw,86px); line-height: .98; letter-spacing: -.065em; }
.story-content h1 em { color: var(--mint); font-style: normal; }
.story-content > p:not(.story-kicker) { max-width: 580px; margin: 28px 0 0; color: rgba(239,245,234,.62); font-size: 14px; line-height: 1.9; }
.story-metrics { display: flex; gap: clamp(26px,5vw,74px); margin-top: 54px; }
.story-metrics div { display: grid; gap: 7px; }
.story-metrics strong { font-family: 'DM Mono',monospace; font-size: 18px; font-weight: 500; }
.story-metrics span { color: rgba(239,245,234,.4); font-size: 10px; letter-spacing: .08em; }
.story-foot { display: flex; justify-content: space-between; color: rgba(243,247,235,.32); font-family: 'DM Mono',monospace; font-size: 8px; letter-spacing: .12em; }
.signal-art { position: absolute; right: -12%; bottom: -18%; width: min(42vw,580px); aspect-ratio: 1; }
.signal-ring { position: absolute; border: 1px solid rgba(183,243,107,.13); border-radius: 50%; }
.ring-a { inset: 0; } .ring-b { inset: 18%; }
.signal-dot { position: absolute; top: 19%; left: 12%; width: 10px; height: 10px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 24px rgba(183,243,107,.65); animation: float-dot 4s ease-in-out infinite; }
.login-panel { display: grid; min-height: 100vh; place-items: center; padding: clamp(30px,7vw,100px); }
.login-card { width: min(100%,430px); animation: enter 600ms cubic-bezier(.2,.75,.2,1) both; }
.login-card h2 { margin: 0; font-family: 'Syne',sans-serif; font-size: clamp(36px,4vw,52px); line-height: 1; letter-spacing: -.055em; }
.login-note { margin: 15px 0 36px; color: var(--muted); font-size: 13px; line-height: 1.7; }
.login-card :deep(.el-form-item) { margin-bottom: 22px; }
.login-card :deep(.el-form-item__label) { color: #53615b; font-size: 11px; font-weight: 700; letter-spacing: .04em; }
.login-card :deep(.el-input__wrapper) { min-height: 50px; padding-inline: 15px; background: rgba(255,255,255,.72); }
.submit-button { display: flex; width: 100%; height: 52px; justify-content: space-between; margin-top: 6px; padding: 0 20px; }
.secure-note { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 24px; color: #89938e; font-family: 'DM Mono',monospace; font-size: 9px; }
.secure-note :deep(svg) { width: 12px; }
@keyframes enter { from { opacity: 0; transform: translateY(24px); } }
@keyframes float-dot { 50% { transform: translate(18px,-15px); } }
@media (max-width: 900px) {
  .login-wrap { display: block; } .login-story { min-height: 42vh; padding: 26px; } .story-content { padding: 66px 0 48px; }
  .story-content h1 { font-size: clamp(40px,10vw,66px); } .story-content > p:not(.story-kicker), .story-metrics { display: none; }
  .story-foot { display: none; } .login-panel { min-height: 58vh; padding: 48px 24px 60px; }
}
@media (max-width: 520px) { .story-content { padding-top: 50px; } .story-content h1 { font-size: 40px; } }
</style>
