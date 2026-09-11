<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { adminApi } from '../api';

interface Stats { total: number; byStatus: Record<string, number>; activations: { day: string; count: number }[]; }
const stats = ref<Stats | null>(null);
const pubkey = ref('');
const copied = ref(false);

const cards = [
  { key: 'total', label: '總卡密數', note: 'TOTAL LICENSES', tone: 'ink', icon: 'Tickets' },
  { key: 'UNUSED', label: '未使用', note: 'READY TO ACTIVATE', tone: 'gray', icon: 'Timer' },
  { key: 'ACTIVE', label: '使用中', note: 'CURRENTLY ACTIVE', tone: 'green', icon: 'Connection' },
  { key: 'EXPIRED', label: '已過期', note: 'REQUIRES REVIEW', tone: 'orange', icon: 'Clock' },
  { key: 'BANNED', label: '已封禁', note: 'ACCESS REVOKED', tone: 'red', icon: 'CircleClose' },
];

function value(key: string) { return stats.value ? (key === 'total' ? stats.value.total : stats.value.byStatus[key] ?? 0) : 0; }
const maxActivation = computed(() => Math.max(1, ...(stats.value?.activations.map((a) => a.count) ?? [1])));
const activeRate = computed(() => stats.value?.total ? Math.round((value('ACTIVE') / stats.value.total) * 100) : 0);

async function copyKey() {
  await navigator.clipboard.writeText(pubkey.value);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1600);
}

onMounted(async () => {
  stats.value = await adminApi.stats();
  pubkey.value = (await adminApi.pubkey()).publicKeyPem;
});
</script>

<template>
  <div class="dashboard-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">SYSTEM PULSE / REALTIME</p>
        <h1 class="page-title">授權狀態，一目瞭然。</h1>
        <p class="page-subtitle">從發行到啟用，掌握所有卡密的生命週期與近十四日使用脈動。</p>
      </div>
      <div class="live-badge"><span />LIVE DATA</div>
    </header>

    <section class="stat-grid" aria-label="卡密統計">
      <article v-for="(card, i) in cards" :key="card.key" class="stat-card" :class="`tone-${card.tone}`" :style="{ '--delay': `${i * 55}ms` }">
        <div class="stat-top"><span>{{ String(i + 1).padStart(2, '0') }}</span><component :is="card.icon" /></div>
        <strong>{{ value(card.key).toLocaleString() }}</strong>
        <div class="stat-label"><span>{{ card.label }}</span><small>{{ card.note }}</small></div>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="panel trend-panel">
        <div class="panel-head">
          <div><p class="eyebrow">14 DAY ACTIVITY</p><h2>啟用趨勢</h2></div>
          <div class="rate-dial"><strong>{{ activeRate }}%</strong><span>啟用率</span></div>
        </div>
        <div v-if="stats?.activations.length" class="chart-wrap">
          <div class="chart-grid" aria-hidden="true"><span /><span /><span /><span /></div>
          <div class="bars">
            <div v-for="a in stats.activations" :key="a.day" class="bar-column" :title="`${a.day}: ${a.count}`">
              <span class="bar-value">{{ a.count }}</span>
              <div class="bar" :style="{ height: `${Math.max(7, (a.count / maxActivation) * 100)}%` }" />
              <small>{{ a.day.slice(5) }}</small>
            </div>
          </div>
        </div>
        <el-empty v-else description="近 14 天尚無啟用紀錄" />
      </article>

      <article class="panel key-panel">
        <div class="key-visual" aria-hidden="true"><Key /><span>ED</span></div>
        <p class="eyebrow">CLIENT PUBLIC KEY</p>
        <h2>Ed25519 公鑰</h2>
        <p>將此公鑰內嵌至客戶端，驗證伺服器簽發的授權內容。</p>
        <div class="key-preview">{{ pubkey ? `${pubkey.slice(0, 56)}…` : '正在取得公鑰…' }}</div>
        <button class="copy-key" type="button" :disabled="!pubkey" @click="copyKey">
          <span>{{ copied ? '已複製' : '複製完整公鑰' }}</span><Check v-if="copied" /><CopyDocument v-else />
        </button>
      </article>
    </section>
  </div>
</template>

<style scoped>
.dashboard-page { max-width: 1500px; margin: 0 auto; }
.page-head { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 34px; }
.live-badge { display: flex; align-items: center; gap: 9px; padding: 10px 14px; border: 1px solid #d5ddd1; border-radius: 999px; color: #6d7a73; background: rgba(255,255,255,.4); font-family: 'DM Mono',monospace; font-size: 9px; letter-spacing: .1em; }
.live-badge span { width: 7px; height: 7px; border-radius: 50%; background: #79b83f; box-shadow: 0 0 0 4px rgba(121,184,63,.12); }
.stat-grid { display: grid; grid-template-columns: repeat(10,1fr); gap: 12px; }
.stat-card { grid-column: span 2; min-height: 190px; padding: 22px; border: 1px solid rgba(16,37,31,.08); border-radius: 20px; background: rgba(251,252,247,.9); animation: rise 520ms cubic-bezier(.2,.75,.2,1) var(--delay) both; }
.stat-card:first-child { color: #f4f8ee; background: var(--night); }
.stat-top { display: flex; align-items: center; justify-content: space-between; color: #97a39c; font-family: 'DM Mono',monospace; font-size: 9px; }
.stat-top :deep(svg) { width: 18px; height: 18px; }
.stat-card > strong { display: block; margin: 25px 0 18px; font-family: 'Syne',sans-serif; font-size: clamp(34px,4vw,52px); line-height: 1; letter-spacing: -.055em; }
.stat-label { display: grid; gap: 4px; }
.stat-label span { font-size: 12px; font-weight: 700; }
.stat-label small { color: #93a099; font-family: 'DM Mono',monospace; font-size: 7px; letter-spacing: .08em; }
.stat-card:first-child .stat-top, .stat-card:first-child .stat-label small { color: rgba(245,250,238,.48); }
.tone-green .stat-top :deep(svg) { color: #71a83b; } .tone-orange .stat-top :deep(svg) { color: #df8c42; } .tone-red .stat-top :deep(svg) { color: #cf5751; }
.dashboard-grid { display: grid; grid-template-columns: minmax(0,1.75fr) minmax(300px,.75fr); gap: 16px; margin-top: 16px; }
.panel { position: relative; overflow: hidden; min-height: 390px; padding: clamp(24px,3vw,38px); border: 1px solid rgba(16,37,31,.08); border-radius: 24px; background: rgba(251,252,247,.92); }
.panel-head { display: flex; align-items: start; justify-content: space-between; }
.panel h2 { margin: 0; font-family: 'Syne',sans-serif; font-size: 25px; letter-spacing: -.035em; }
.rate-dial { display: grid; width: 66px; height: 66px; place-content: center; border: 1px solid #d8dfd4; border-radius: 50%; text-align: center; }
.rate-dial strong { font-family: 'DM Mono',monospace; font-size: 14px; }
.rate-dial span { color: var(--muted); font-size: 8px; }
.chart-wrap { position: relative; height: 245px; margin-top: 24px; padding-top: 25px; }
.chart-grid { position: absolute; inset: 25px 0 28px; display: flex; flex-direction: column; justify-content: space-between; }
.chart-grid span { width: 100%; border-top: 1px dashed #dfe4dc; }
.bars { position: relative; z-index: 1; display: flex; height: 100%; align-items: end; justify-content: space-around; gap: clamp(4px,1vw,12px); }
.bar-column { display: flex; height: 100%; min-width: 10px; flex: 1; flex-direction: column; align-items: center; justify-content: end; }
.bar { width: min(26px,72%); min-height: 7px; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg,var(--mint),#7dae3f); transition: height 500ms cubic-bezier(.2,.75,.2,1); }
.bar-column:hover .bar { background: var(--apricot); }
.bar-value { margin-bottom: 5px; opacity: 0; color: var(--ink); font-family: 'DM Mono',monospace; font-size: 8px; transition: opacity 150ms ease; }
.bar-column:hover .bar-value { opacity: 1; }
.bar-column small { margin-top: 9px; color: #89958f; font-family: 'DM Mono',monospace; font-size: clamp(6px,.7vw,8px); transform: rotate(-35deg); }
.key-panel { display: flex; flex-direction: column; color: #f3f8ed; background: linear-gradient(160deg,#183d31,#0d211b 72%); }
.key-panel::after { position: absolute; right: -70px; bottom: -70px; width: 210px; height: 210px; border: 1px solid rgba(183,243,107,.12); border-radius: 50%; content: ''; }
.key-panel .eyebrow { color: var(--mint); }
.key-panel h2 { font-size: 29px; }
.key-panel > p:not(.eyebrow) { max-width: 330px; margin: 14px 0 25px; color: rgba(240,246,235,.55); font-size: 12px; line-height: 1.7; }
.key-visual { display: flex; align-items: center; justify-content: space-between; margin-bottom: auto; padding-bottom: 35px; color: var(--mint); }
.key-visual :deep(svg) { width: 30px; }
.key-visual span { color: rgba(240,246,235,.18); font-family: 'DM Mono',monospace; font-size: 11px; }
.key-preview { overflow: hidden; padding: 13px; border: 1px solid rgba(255,255,255,.08); border-radius: 11px; color: rgba(240,246,235,.46); background: rgba(0,0,0,.14); font-family: 'DM Mono',monospace; font-size: 8px; white-space: nowrap; }
.copy-key { position: relative; z-index: 1; display: flex; height: 43px; align-items: center; justify-content: space-between; margin-top: 10px; padding: 0 15px; border: 0; border-radius: 11px; color: var(--night); background: var(--mint); font-size: 11px; font-weight: 700; cursor: pointer; }
.copy-key:disabled { opacity: .5; cursor: wait; } .copy-key :deep(svg) { width: 14px; }
@keyframes rise { from { opacity: 0; transform: translateY(14px); } }
@media (max-width: 1180px) { .stat-card { grid-column: span 5; } .stat-card:first-child { grid-column: span 10; } .dashboard-grid { grid-template-columns: 1fr; } .key-panel { min-height: 340px; } }
@media (max-width: 650px) { .page-head { align-items: start; } .live-badge { display: none; } .stat-grid { grid-template-columns: 1fr 1fr; } .stat-card, .stat-card:first-child { grid-column: auto; min-height: 160px; } .stat-card:first-child { grid-column: 1 / -1; } .panel { padding: 22px 18px; } .chart-wrap { overflow-x: auto; } .bars { min-width: 560px; } }
</style>
