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
  <div>
    <el-card shadow="never" style="margin-bottom: 12px">
      <el-form :inline="true">
        <el-form-item label="狀態">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 130px">
            <el-option label="未使用" value="UNUSED" />
            <el-option label="使用中" value="ACTIVE" />
            <el-option label="已過期" value="EXPIRED" />
            <el-option label="已封禁" value="BANNED" />
          </el-select>
        </el-form-item>
        <el-form-item label="卡密">
          <el-input v-model="query.code" placeholder="模糊查詢" clearable />
        </el-form-item>
        <el-form-item label="HWID">
          <el-input v-model="query.hwid" placeholder="機器碼" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查詢</el-button>
          <el-button type="success" @click="batchDialog = true">批量產卡</el-button>
          <el-button type="warning" @click="openExtend">
            加時長<span v-if="selected.length">（{{ selected.length }}）</span>
          </el-button>
          <el-button @click="exportCsv">匯出 CSV</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table
      v-loading="loading"
      :data="rows"
      border
      style="width: 100%"
      @selection-change="onSelectionChange"
      @sort-change="onSortChange"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column prop="code" label="卡密" width="190" />
      <el-table-column label="狀態" width="100" column-key="status" sortable="custom">
        <template #default="{ row }">
          <el-tag :type="statusType[row.status]">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="剩餘時長" width="130" column-key="remaining" sortable="custom">
        <template #default="{ row }">
          <span :title="`發行天數：${row.durationDays ?? '永久'}`">{{ remainText(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="hwid" label="HWID" min-width="160" show-overflow-tooltip />
      <el-table-column label="在線狀態" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.online" type="success">在線</el-tag>
          <span v-else :title="row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : ''">
            離線 · {{ lastSeenText(row) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="到期時間" width="180" column-key="expiresAt" sortable="custom">
        <template #default="{ row }">{{ row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '—' }}</template>
      </el-table-column>
      <el-table-column prop="note" label="備註" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status !== 'BANNED'" size="small" type="danger" plain @click="act(() => adminApi.ban(row.id), '已封禁')">封禁</el-button>
          <el-button v-else size="small" type="success" plain @click="act(() => adminApi.unban(row.id), '已解封')">解封</el-button>
          <el-button size="small" plain @click="act(() => adminApi.unbind(row.id), '已解綁')">解綁</el-button>
          <el-button size="small" type="danger" @click="confirmDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      style="margin-top: 12px; justify-content: flex-end"
      layout="total, prev, pager, next"
      :total="total"
      :current-page="query.page"
      :page-size="query.pageSize"
      @current-change="(p: number) => { query.page = p; load(); }"
    />

    <!-- batch dialog -->
    <el-dialog v-model="batchDialog" title="批量產生卡密" width="420px">
      <el-form label-width="90px">
        <el-form-item label="批次名稱"><el-input v-model="batchForm.name" /></el-form-item>
        <el-form-item label="數量"><el-input-number v-model="batchForm.count" :min="1" :max="10000" /></el-form-item>
        <el-form-item label="永久卡"><el-switch v-model="batchForm.permanent" /></el-form-item>
        <el-form-item v-if="!batchForm.permanent" label="有效天數">
          <el-input-number v-model="batchForm.durationDays" :min="1" :max="36500" />
        </el-form-item>
        <el-form-item label="備註"><el-input v-model="batchForm.note" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchDialog = false">取消</el-button>
        <el-button type="primary" @click="createBatch">產生</el-button>
      </template>
    </el-dialog>

    <!-- generated codes dialog -->
    <el-dialog v-model="resultDialog" :title="`已產生 ${generated.length} 組卡密`" width="420px">
      <el-input type="textarea" :rows="10" :model-value="generated.join('\n')" readonly />
      <template #footer>
        <el-button type="primary" @click="copyCodes">複製全部</el-button>
        <el-button @click="resultDialog = false">關閉</el-button>
      </template>
    </el-dialog>

    <!-- extend duration dialog -->
    <el-dialog v-model="extendDialog" title="統一加時長" width="440px">
      <el-form label-width="80px">
        <el-form-item label="加幾天">
          <el-input-number v-model="extendForm.days" :min="1" :max="36500" />
        </el-form-item>
        <el-form-item label="套用範圍">
          <el-radio-group v-model="extendForm.scope">
            <el-radio value="ids" :disabled="selected.length === 0">
              勾選的 {{ selected.length }} 張
            </el-radio>
            <el-radio value="filter">符合目前篩選的全部</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="已啟用：到期日往後加；未使用：有效天數往後加。已過期 / 已封禁 / 永久卡會略過。"
        />
      </el-form>
      <template #footer>
        <el-button @click="extendDialog = false">取消</el-button>
        <el-button type="warning" @click="submitExtend">確定加時長</el-button>
      </template>
    </el-dialog>
  </div>
</template>
