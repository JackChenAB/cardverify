<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { computed } from 'vue';
import { useAuthStore } from '../store/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const active = computed(() => route.name as string);

function logout() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <el-container style="height: 100vh">
    <el-aside width="200px" class="aside">
      <div class="logo">卡密系統</div>
      <el-menu :default-active="active" router>
        <el-menu-item index="cards" :route="{ name: 'cards' }">
          <el-icon><Tickets /></el-icon><span>卡密管理</span>
        </el-menu-item>
        <el-menu-item index="dashboard" :route="{ name: 'dashboard' }">
          <el-icon><DataLine /></el-icon><span>統計儀表板</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span />
        <div>
          <span style="margin-right: 12px">{{ auth.username }}</span>
          <el-button size="small" @click="logout">登出</el-button>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.aside {
  background: #001529;
}
.logo {
  color: #fff;
  text-align: center;
  font-size: 18px;
  line-height: 60px;
  font-weight: 600;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #eee;
  background: #fff;
}
</style>
