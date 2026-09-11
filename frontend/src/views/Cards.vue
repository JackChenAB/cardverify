<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi, type CardItem } from '../api';

const loading = ref(false);
const rows = ref<CardItem[]>([]);
const total = ref(0);
const query = reactive({
  status: '',
  code: '',
  hwid: '',
  sortBy: '',
  sortOrder: '',
  page: 1,
  pageSize: 20,
});

const statusType: Record<string, string> = {
  UNUSED: 'info',
  ACTIVE: 'success',
  EXPIRED: 'warning',
  BANNED: 'danger',
};

// Remaining time. Activated cards count down from expiresAt (matches the client);
// unactivated cards show their issued grant (clock hasn't started yet).
function remainText(row: CardItem): string {
  if (row.status === 'BANNED') return '已封禁';
  if (!row.activatedAt) {
    return row.durationDays == null ? '永久' : `${row.durationDays} 天（未啟用）`;
  }
  if (row.expiresAt == null) return '永久';
  const ms = Date.parse(row.expiresAt) - Date.now();
  if (ms <= 0) return '已過期';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return days > 0 ? `${days} 天 ${hours} 時` : `${hours} 時`;
}

// Relative "last seen" for the online column (offline rows show how long ago).
function lastSeenText(row: CardItem): string {
  if (!row.lastSeenAt) return '從未';
  const ms = Date.now() - Date.parse(row.lastSeenAt);
  if (ms < 60000) return '剛剛';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function params() {
  const p: Record<string, unknown> = { page: query.page, pageSize: query.pageSize };
  if (query.status) p.status = query.status;
  if (query.code) p.code = query.code;
  if (query.hwid) p.hwid = query.hwid;
  if (query.sortBy) {
    p.sortBy = query.sortBy;
    p.sortOrder = query.sortOrder || 'desc';
  }
  return p;
}

// Server-side sort. The "剩餘時長" column maps to expiresAt (its underlying value).
function onSortChange({ column, order }: { column: any; order: string | null }) {
  const key = column?.columnKey as string | undefined;
  if (!order || !key) {
    query.sortBy = '';
    query.sortOrder = '';
  } else {
    query.sortBy = key === 'status' ? 'status' : 'expiresAt';
    query.sortOrder = order === 'ascending' ? 'asc' : 'desc';
  }
  query.page = 1;
  load();
}

async function load() {
  loading.value = true;
  try {
    const data = await adminApi.listCards(params());
    rows.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  query.page = 1;
  load();
}

// ----- batch creation -----
const batchDialog = ref(false);
const batchForm = reactive({ name: '', count: 10, permanent: false, durationDays: 30, note: '' });
const generated = ref<string[]>([]);
const resultDialog = ref(false);

async function createBatch() {
  if (!batchForm.name) return ElMessage.warning('請填寫批次名稱');
  try {
    const res = await adminApi.createBatch({
      name: batchForm.name,
      count: batchForm.count,
      durationDays: batchForm.permanent ? null : batchForm.durationDays,
      note: batchForm.note || undefined,
    });
    generated.value = res.codes;
    batchDialog.value = false;
    resultDialog.value = true;
    load();
  } catch {
    ElMessage.error('產生失敗');
  }
}

function copyCodes() {
  navigator.clipboard.writeText(generated.value.join('\n'));
  ElMessage.success('已複製到剪貼簿');
}

// ----- row actions -----
async function act(fn: () => Promise<unknown>, ok: string) {
  try {
    await fn();
    ElMessage.success(ok);
    load();
  } catch {
    ElMessage.error('操作失敗');
  }
}

function confirmDelete(row: CardItem) {
  ElMessageBox.confirm(`確定刪除卡密 ${row.code}？`, '刪除', { type: 'warning' })
    .then(() => act(() => adminApi.remove(row.id), '已刪除'))
    .catch(() => undefined);
}

// ----- export current filter as CSV -----
async function exportCsv() {
  const blob = await adminApi.exportCsv(params());
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cards.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ----- bulk extend duration -----
const selected = ref<CardItem[]>([]);
function onSelectionChange(rows_: CardItem[]) {
  selected.value = rows_;
}

const extendDialog = ref(false);
const extendForm = reactive({ days: 30, scope: 'ids' as 'ids' | 'filter' });

function openExtend() {
  // Default to the selected rows when any are ticked, else the current filter.
  extendForm.scope = selected.value.length > 0 ? 'ids' : 'filter';
  extendDialog.value = true;
}

async function submitExtend() {
  if (extendForm.scope === 'ids' && selected.value.length === 0) {
    return ElMessage.warning('請先勾選要加時長的卡密');
  }
  try {
    const payload: any = { days: extendForm.days, scope: extendForm.scope };
    if (extendForm.scope === 'ids') {
      payload.ids = selected.value.map((c) => c.id);
    } else {
      if (query.status) payload.status = query.status;
      if (query.code) payload.code = query.code;
      if (query.hwid) payload.hwid = query.hwid;
    }
    const res = await adminApi.extendCards(payload);
    extendDialog.value = false;
    ElMessage.success(`已延長 ${res.extended} 張，略過 ${res.skipped} 張（過期/封禁/永久）`);
    load();
  } catch {
    ElMessage.error('加時長失敗');
  }
}

onMounted(load);
</script>

<template>
  <div class="cards-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">LICENSE INVENTORY / CONTROL</p>
        <h1 class="page-title">管理每一組存取憑證。</h1>
        <p class="page-subtitle">搜尋、發行與維護卡密狀態。所有關鍵操作集中在同一個工作視圖。</p>
      </div>
      <div class="head-actions">
        <el-button @click="exportCsv"><Download />匯出 CSV</el-button>
        <el-button type="success" @click="batchDialog = true"><Plus />批量產卡</el-button>
      </div>
    </header>

    <section class="filter-panel">
      <div class="filter-heading">
        <div><Operation /><span>篩選條件</span><small>FILTER SET</small></div>
        <span class="result-count"><strong>{{ total }}</strong> 組結果</span>
      </div>
      <el-form :inline="true" class="filter-form" @submit.prevent="search">
        <el-form-item label="狀態">
          <el-select v-model="query.status" placeholder="全部狀態" clearable>
            <el-option label="未使用" value="UNUSED" />
            <el-option label="使用中" value="ACTIVE" />
            <el-option label="已過期" value="EXPIRED" />
            <el-option label="已封禁" value="BANNED" />
          </el-select>
        </el-form-item>
        <el-form-item label="卡密">
          <el-input v-model="query.code" placeholder="輸入卡密片段" clearable prefix-icon="Search" />
        </el-form-item>
        <el-form-item label="裝置 HWID">
          <el-input v-model="query.hwid" placeholder="輸入機器碼" clearable prefix-icon="Monitor" />
        </el-form-item>
        <el-form-item class="filter-submit">
          <el-button type="primary" native-type="submit"><Search />套用篩選</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="table-panel">
      <div class="table-toolbar">
        <div>
          <span class="table-title">卡密清單</span>
          <span v-if="selected.length" class="selected-badge">已選 {{ selected.length }} 張</span>
        </div>
        <el-button type="warning" :plain="!selected.length" @click="openExtend">
          <Timer />加時長<span v-if="selected.length">（{{ selected.length }}）</span>
        </el-button>
      </div>

      <div class="table-scroll">
        <el-table v-loading="loading" :data="rows" @selection-change="onSelectionChange" @sort-change="onSortChange">
          <el-table-column type="selection" width="48" />
          <el-table-column prop="code" label="卡密" width="210">
            <template #default="{ row }"><span class="code-cell">{{ row.code }}</span></template>
          </el-table-column>
          <el-table-column label="狀態" width="108" column-key="status" sortable="custom">
            <template #default="{ row }"><el-tag :type="statusType[row.status]" effect="light" round>{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="剩餘時長" width="145" column-key="remaining" sortable="custom">
            <template #default="{ row }"><span class="time-cell" :class="{ urgent: row.status === 'EXPIRED' || row.status === 'BANNED' }" :title="`發行天數：${row.durationDays ?? '永久'}`">{{ remainText(row) }}</span></template>
          </el-table-column>
          <el-table-column prop="hwid" label="HWID" min-width="165" show-overflow-tooltip>
            <template #default="{ row }"><span :class="row.hwid ? 'hwid-cell' : 'empty-cell'">{{ row.hwid || '尚未綁定' }}</span></template>
          </el-table-column>
          <el-table-column label="在線狀態" width="140">
            <template #default="{ row }">
              <span v-if="row.online" class="online-state"><i />在線</span>
              <span v-else class="offline-state" :title="row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : ''">離線 · {{ lastSeenText(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="到期時間" width="180" column-key="expiresAt" sortable="custom">
            <template #default="{ row }"><span class="date-cell">{{ row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '—' }}</span></template>
          </el-table-column>
          <el-table-column prop="note" label="備註" min-width="125" show-overflow-tooltip>
            <template #default="{ row }"><span :class="row.note ? '' : 'empty-cell'">{{ row.note || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="188" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status !== 'BANNED'" size="small" type="danger" plain @click="act(() => adminApi.ban(row.id), '已封禁')">封禁</el-button>
              <el-button v-else size="small" type="success" plain @click="act(() => adminApi.unban(row.id), '已解封')">解封</el-button>
              <el-button size="small" plain @click="act(() => adminApi.unbind(row.id), '已解綁')">解綁</el-button>
              <el-button class="icon-delete" size="small" type="danger" plain aria-label="刪除" title="刪除" @click="confirmDelete(row)"><Delete /></el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="pagination-row">
        <span>PAGE {{ query.page }} / {{ Math.max(1, Math.ceil(total / query.pageSize)) }}</span>
        <el-pagination layout="prev, pager, next" :total="total" :current-page="query.page" :page-size="query.pageSize" @current-change="(p: number) => { query.page = p; load(); }" />
      </div>
    </section>

    <el-dialog v-model="batchDialog" title="批量產生卡密" width="min(92vw, 480px)">
      <p class="dialog-note">建立一批新的授權卡密，效期將從首次啟用開始計算。</p>
      <el-form label-position="top">
        <el-form-item label="批次名稱"><el-input v-model="batchForm.name" placeholder="例如：九月合作夥伴" /></el-form-item>
        <div class="dialog-grid">
          <el-form-item label="產生數量"><el-input-number v-model="batchForm.count" :min="1" :max="10000" /></el-form-item>
          <el-form-item label="授權類型"><el-switch v-model="batchForm.permanent" active-text="永久" inactive-text="限時" /></el-form-item>
        </div>
        <el-form-item v-if="!batchForm.permanent" label="有效天數"><el-input-number v-model="batchForm.durationDays" :min="1" :max="36500" /></el-form-item>
        <el-form-item label="備註"><el-input v-model="batchForm.note" placeholder="選填，方便後續辨識" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="batchDialog = false">取消</el-button><el-button type="primary" @click="createBatch">確認產生</el-button></template>
    </el-dialog>

    <el-dialog v-model="resultDialog" :title="`已產生 ${generated.length} 組卡密`" width="min(92vw, 480px)">
      <div class="success-banner"><CircleCheckFilled /><span>卡密已成功建立，請妥善保存。</span></div>
      <el-input class="code-output" type="textarea" :rows="10" :model-value="generated.join('\n')" readonly />
      <template #footer><el-button type="primary" @click="copyCodes"><CopyDocument />複製全部</el-button><el-button @click="resultDialog = false">關閉</el-button></template>
    </el-dialog>

    <el-dialog v-model="extendDialog" title="統一加時長" width="min(92vw, 480px)">
      <p class="dialog-note">延長已啟用卡密的到期日，或增加未啟用卡密的有效天數。</p>
      <el-form label-position="top">
        <el-form-item label="延長天數"><el-input-number v-model="extendForm.days" :min="1" :max="36500" /></el-form-item>
        <el-form-item label="套用範圍">
          <el-radio-group v-model="extendForm.scope"><el-radio value="ids" :disabled="selected.length === 0">勾選的 {{ selected.length }} 張</el-radio><el-radio value="filter">符合目前篩選的全部</el-radio></el-radio-group>
        </el-form-item>
        <el-alert type="info" :closable="false" show-icon title="已過期、已封禁與永久卡將自動略過。" />
      </el-form>
      <template #footer><el-button @click="extendDialog = false">取消</el-button><el-button type="warning" @click="submitExtend">確定加時長</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cards-page { max-width: 1600px; margin: 0 auto; }
.page-head { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
.head-actions { display: flex; flex-shrink: 0; gap: 8px; }
.head-actions :deep(svg), .table-toolbar :deep(svg), .filter-submit :deep(svg) { width: 14px; margin-right: 5px; }
.filter-panel, .table-panel { border: 1px solid rgba(16,37,31,.08); border-radius: 22px; background: rgba(251,252,247,.9); }
.filter-panel { margin-bottom: 15px; padding: 20px 22px 4px; }
.filter-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 17px; padding-bottom: 14px; border-bottom: 1px solid #e3e8df; }
.filter-heading > div { display: flex; align-items: center; gap: 8px; }
.filter-heading :deep(svg) { width: 15px; color: var(--mint-deep); }
.filter-heading span { font-size: 12px; font-weight: 700; }
.filter-heading small { color: #9aa49f; font-family: 'DM Mono',monospace; font-size: 8px; letter-spacing: .1em; }
.result-count { color: #7c8982; font-size: 10px !important; font-weight: 500 !important; }
.result-count strong { color: var(--ink); font-family: 'DM Mono',monospace; font-size: 13px; }
.filter-form { display: grid; grid-template-columns: minmax(150px,.65fr) minmax(210px,1fr) minmax(210px,1fr) auto; align-items: end; gap: 10px; }
.filter-form :deep(.el-form-item) { display: block; margin: 0 0 16px; }
.filter-form :deep(.el-form-item__label) { display: block; height: auto; margin-bottom: 7px; color: #6c7872; font-size: 10px; font-weight: 700; }
.filter-form :deep(.el-select), .filter-form :deep(.el-input) { width: 100%; }
.filter-submit :deep(.el-button) { width: 100%; }
.table-panel { overflow: hidden; padding: 0 22px 15px; }
.table-toolbar { display: flex; min-height: 76px; align-items: center; justify-content: space-between; gap: 18px; }
.table-toolbar > div { display: flex; align-items: center; gap: 11px; }
.table-title { font-family: 'Syne',sans-serif; font-size: 18px; font-weight: 700; letter-spacing: -.025em; }
.selected-badge { padding: 5px 9px; border-radius: 99px; color: #4f701e; background: #e9f9d3; font-size: 9px; font-weight: 700; }
.table-scroll { overflow-x: auto; }
.table-scroll :deep(.el-table) { min-width: 1180px; }
.code-cell, .hwid-cell, .date-cell { font-family: 'DM Mono',monospace; font-size: 11px; }
.code-cell { color: #203d33; font-weight: 500; letter-spacing: .02em; }
.hwid-cell, .date-cell { color: #65736d; font-size: 10px; }
.empty-cell { color: #adb5b1; font-size: 11px; }
.time-cell { font-size: 11px; font-weight: 600; }
.time-cell.urgent { color: var(--danger); }
.online-state { display: inline-flex; align-items: center; gap: 7px; color: #568a25; font-size: 11px; font-weight: 700; }
.online-state i { width: 7px; height: 7px; border-radius: 50%; background: #79b83f; box-shadow: 0 0 0 4px rgba(121,184,63,.12); }
.offline-state { color: #8b9691; font-size: 10px; }
.icon-delete { width: 32px; padding: 0 !important; }
.icon-delete :deep(svg) { width: 13px; }
.pagination-row { display: flex; align-items: center; justify-content: space-between; padding-top: 15px; }
.pagination-row > span { color: #8f9a94; font-family: 'DM Mono',monospace; font-size: 8px; letter-spacing: .08em; }
.dialog-note { margin: -6px 0 24px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.success-banner { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; padding: 12px 14px; border-radius: 12px; color: #47721f; background: #edf9df; font-size: 11px; }
.success-banner :deep(svg) { width: 16px; }
.code-output :deep(textarea) { font-family: 'DM Mono',monospace; font-size: 11px; line-height: 1.7; }
@media (max-width: 1050px) { .filter-form { grid-template-columns: 1fr 1fr; } }
@media (max-width: 680px) {
  .page-head { display: block; } .head-actions { margin-top: 22px; } .head-actions :deep(.el-button) { flex: 1; }
  .filter-form { grid-template-columns: 1fr; } .filter-panel, .table-panel { border-radius: 17px; }
  .table-panel { padding-inline: 14px; } .table-toolbar { min-height: 68px; } .pagination-row > span { display: none; }
  .pagination-row { justify-content: center; } .dialog-grid { grid-template-columns: 1fr; gap: 0; }
}
</style>
