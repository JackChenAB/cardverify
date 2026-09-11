<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LanguageSwitch from '../components/LanguageSwitch.vue';
import { useI18n } from '../i18n';
import { useAuthStore } from '../store/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const active = computed(() => route.name as string);
const currentMeta = computed(() =>
  active.value === 'dashboard'
    ? { index: '02', title: t('layout.dashboard') }
    : { index: '01', title: t('layout.licenses') },
);

function logout() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand" :aria-label="t('layout.brandAria')">
        <div class="brand-mark"><span>K</span></div>
        <div class="brand-copy">
          <strong>KEYLINE</strong>
          <small>LICENSE CONTROL</small>
        </div>
      </div>

      <div class="rail-label">CONTROL PANEL</div>
      <nav class="nav-list" :aria-label="t('layout.navAria')">
        <router-link :to="{ name: 'cards' }" class="nav-item" :class="{ active: active === 'cards' }">
          <span class="nav-index">01</span>
          <span class="nav-icon"><Tickets /></span>
          <span class="nav-copy"><strong>{{ t('layout.licenses') }}</strong><small>Licenses</small></span>
          <span class="nav-arrow">↗</span>
        </router-link>
        <router-link :to="{ name: 'dashboard' }" class="nav-item" :class="{ active: active === 'dashboard' }">
          <span class="nav-index">02</span>
          <span class="nav-icon"><DataLine /></span>
          <span class="nav-copy"><strong>{{ t('layout.dashboard') }}</strong><small>Overview</small></span>
          <span class="nav-arrow">↗</span>
        </router-link>
      </nav>

      <div class="sidebar-status">
        <div class="status-pulse" aria-hidden="true" />
        <div><strong>{{ t('layout.serviceOnline') }}</strong><small>{{ t('layout.systemsOperational') }}</small></div>
      </div>
      <div class="sidebar-orbit" aria-hidden="true"><span /></div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="mobile-brand">K</div>
        <div class="breadcrumb">
          <span>KEYLINE / {{ currentMeta.index }}</span>
          <strong>{{ currentMeta.title }}</strong>
        </div>
        <div class="account">
          <LanguageSwitch />
          <div class="account-avatar">{{ auth.username?.slice(0, 1).toUpperCase() || 'A' }}</div>
          <div class="account-copy"><strong>{{ auth.username || 'admin' }}</strong><small>{{ t('common.administrator') }}</small></div>
          <button class="logout-button" type="button" :aria-label="t('common.logout')" :title="t('common.logout')" @click="logout">
            <SwitchButton />
          </button>
        </div>
      </header>

      <main class="content"><router-view /></main>
    </section>
  </div>
</template>

<style scoped>
.app-shell { display: grid; grid-template-columns: 272px minmax(0, 1fr); min-height: 100vh; }
.sidebar {
  position: fixed; z-index: 20; inset: 0 auto 0 0; display: flex; width: 272px; flex-direction: column;
  overflow: hidden; padding: 28px 20px 22px; color: #f8faee;
  background: radial-gradient(circle at 80% 8%, rgba(183, 243, 107, .14), transparent 26%), linear-gradient(165deg, #17382e 0%, #0d201b 58%, #091814 100%);
}
.sidebar::before { position: absolute; inset: 0; border-right: 1px solid rgba(255,255,255,.08); background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px); background-size: 100% 32px; content: ''; pointer-events: none; }
.brand { position: relative; z-index: 1; display: flex; align-items: center; gap: 13px; padding: 0 8px 32px; }
.brand-mark { display: grid; width: 42px; height: 42px; place-items: center; border: 1px solid rgba(183,243,107,.55); border-radius: 13px 5px; color: var(--night); background: var(--mint); box-shadow: 0 0 28px rgba(183,243,107,.18); font-family: 'Syne', sans-serif; font-size: 21px; font-weight: 700; transform: rotate(-3deg); }
.brand-copy { display: grid; gap: 3px; }
.brand-copy strong { font-family: 'Syne', sans-serif; font-size: 19px; letter-spacing: .04em; }
.brand-copy small, .sidebar-status small { color: rgba(240,246,236,.46); font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: .13em; }
.rail-label { position: relative; z-index: 1; padding: 0 12px 11px; color: rgba(240,246,236,.38); font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: .16em; }
.nav-list { position: relative; z-index: 1; display: grid; gap: 8px; }
.nav-item { position: relative; display: grid; grid-template-columns: 25px 35px 1fr 16px; align-items: center; min-height: 66px; padding: 9px 12px; border: 1px solid transparent; border-radius: 15px; color: rgba(247,250,238,.64); text-decoration: none; transition: color 180ms ease, background 180ms ease, transform 180ms ease; }
.nav-item:hover { color: #fff; transform: translateX(3px); }
.nav-item.active { border-color: rgba(183,243,107,.22); color: #fff; background: rgba(255,255,255,.075); }
.nav-item.active::before { position: absolute; left: -13px; width: 3px; height: 26px; border-radius: 0 3px 3px 0; background: var(--mint); content: ''; }
.nav-index { color: rgba(183,243,107,.62); font-family: 'DM Mono', monospace; font-size: 9px; }
.nav-icon { display: grid; width: 31px; height: 31px; place-items: center; border-radius: 9px; background: rgba(255,255,255,.06); }
.nav-icon :deep(svg) { width: 15px; }
.nav-copy { display: grid; gap: 2px; }
.nav-copy strong { font-size: 13px; font-weight: 600; }
.nav-copy small { color: rgba(240,246,236,.35); font-family: 'DM Mono', monospace; font-size: 8px; text-transform: uppercase; }
.nav-arrow { opacity: 0; font-size: 13px; transition: opacity 180ms ease; }
.nav-item:hover .nav-arrow, .nav-item.active .nav-arrow { opacity: 1; }
.sidebar-status { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; margin-top: auto; padding: 15px 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; background: rgba(0,0,0,.12); }
.sidebar-status > div:last-child { display: grid; gap: 3px; }
.sidebar-status strong { font-size: 11px; font-weight: 600; }
.status-pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 0 5px rgba(183,243,107,.1); animation: pulse 2.2s ease-in-out infinite; }
.sidebar-orbit { position: absolute; right: -86px; bottom: -88px; width: 230px; height: 230px; border: 1px solid rgba(183,243,107,.1); border-radius: 50%; }
.sidebar-orbit::before { position: absolute; inset: 28px; border: 1px solid rgba(183,243,107,.08); border-radius: 50%; content: ''; }
.sidebar-orbit span { position: absolute; top: 42px; left: 18px; width: 7px; height: 7px; border-radius: 50%; background: var(--mint); }
.workspace { grid-column: 2; min-width: 0; }
.topbar { position: sticky; z-index: 15; top: 0; display: flex; height: 78px; align-items: center; justify-content: space-between; padding: 0 clamp(22px,4vw,58px); border-bottom: 1px solid rgba(16,37,31,.08); background: rgba(242,244,236,.88); backdrop-filter: blur(16px); }
.breadcrumb { display: grid; gap: 4px; }
.breadcrumb span { color: #85918b; font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: .12em; }
.breadcrumb strong { font-size: 13px; font-weight: 700; }
.account { display: flex; align-items: center; gap: 10px; }
.account-avatar, .mobile-brand { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 11px; color: var(--night); background: var(--mint); font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700; }
.account-copy { display: grid; min-width: 90px; gap: 1px; }
.account-copy strong { font-size: 12px; }
.account-copy small { color: #7f8b85; font-family: 'DM Mono', monospace; font-size: 8px; }
.logout-button { display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid var(--line); border-radius: 11px; color: #6b7872; background: transparent; cursor: pointer; transition: 180ms ease; }
.logout-button:hover { border-color: #e3aaa6; color: var(--danger); background: #fff2f0; }
.logout-button :deep(svg) { width: 15px; }
.mobile-brand { display: none; }
.content { min-height: calc(100vh - 78px); padding: clamp(28px,4vw,54px) clamp(22px,4vw,58px) 58px; }
@keyframes pulse { 50% { box-shadow: 0 0 0 9px rgba(183,243,107,0); } }
@media (max-width: 820px) {
  .app-shell { display: block; padding-bottom: 76px; }
  .workspace { display: block; }
  .sidebar { position: fixed; inset: auto 12px 12px; width: auto; height: 64px; flex-direction: row; padding: 7px; border: 1px solid rgba(255,255,255,.12); border-radius: 20px; box-shadow: 0 18px 50px rgba(7,24,18,.25); }
  .brand, .rail-label, .sidebar-status, .sidebar-orbit { display: none; }
  .nav-list { display: grid; width: 100%; grid-template-columns: 1fr 1fr; gap: 6px; }
  .nav-item { grid-template-columns: 32px 1fr; min-height: 48px; padding: 6px 12px; }
  .nav-index, .nav-arrow, .nav-copy small { display: none; }
  .nav-item.active::before { display: none; }
  .nav-icon { width: 30px; height: 30px; }
  .topbar { height: 66px; padding: 0 18px; }
  .mobile-brand { display: grid; }
  .breadcrumb { display: none; }
  .account-copy { min-width: 0; }
  .content { min-height: calc(100vh - 66px); padding: 28px 18px 40px; }
}
@media (max-width: 460px) { .account-copy small { display: none; } .account-avatar { display: none; } .nav-copy strong { font-size: 11px; } }
</style>
