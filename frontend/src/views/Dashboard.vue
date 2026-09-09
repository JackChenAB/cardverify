<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi } from '../api';

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  activations: { day: string; count: number }[];
}

const stats = ref<Stats | null>(null);
const pubkey = ref('');

const cards = [
  { key: 'total', label: '總卡密數', color: '#409eff' },
  { key: 'UNUSED', label: '未使用', color: '#909399' },
  { key: 'ACTIVE', label: '使用中', color: '#67c23a' },
  { key: 'EXPIRED', label: '已過期', color: '#e6a23c' },
  { key: 'BANNED', label: '已封禁', color: '#f56c6c' },
];

function value(key: string) {
  if (!stats.value) return 0;
  return key === 'total' ? stats.value.total : stats.value.byStatus[key] ?? 0;
}

function barWidth(count: number) {
  const max = Math.max(1, ...(stats.value?.activations.map((a) => a.count) ?? [1]));
  return `${Math.round((count / max) * 100)}%`;
}

onMounted(async () => {
  stats.value = await adminApi.stats();
  pubkey.value = (await adminApi.pubkey()).publicKeyPem;
});
</script>

<template>
  <div>
    <el-row :gutter="12">
      <el-col v-for="c in cards" :key="c.key" :span="24 / cards.length">
        <el-card shadow="hover">
          <div class="label">{{ c.label }}</div>
          <div class="num" :style="{ color: c.color }">{{ value(c.key) }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" style="margin-top: 16px" header="近 14 天啟用趨勢">
      <div v-if="stats?.activations.length" class="trend">
        <div v-for="a in stats.activations" :key="a.day" class="trend-row">
          <span class="day">{{ a.day }}</span>
          <div class="bar-bg"><div class="bar" :style="{ width: barWidth(a.count) }" /></div>
          <span class="cnt">{{ a.count }}</span>
        </div>
      </div>
      <el-empty v-else description="近 14 天尚無啟用紀錄" />
    </el-card>

    <el-card shadow="never" style="margin-top: 16px" header="客戶端公鑰 (Ed25519, 內嵌到客戶端程式)">
      <el-input type="textarea" :rows="5" :model-value="pubkey" readonly />
    </el-card>
  </div>
</template>

<style scoped>
.label { color: #909399; font-size: 14px; }
.num { font-size: 30px; font-weight: 700; margin-top: 6px; }
.trend-row { display: flex; align-items: center; margin: 6px 0; }
.day { width: 100px; color: #606266; font-size: 13px; }
.bar-bg { flex: 1; background: #f0f2f5; border-radius: 4px; height: 16px; }
.bar { background: #409eff; height: 16px; border-radius: 4px; }
.cnt { width: 40px; text-align: right; font-size: 13px; }
</style>
