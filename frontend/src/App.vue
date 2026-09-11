<script setup lang="ts">
import { computed } from 'vue';
import en from 'element-plus/es/locale/lang/en';
import zhTw from 'element-plus/es/locale/lang/zh-tw';
import { useI18n } from './i18n';

const { locale } = useI18n();
const elementLocale = computed(() => (locale.value === 'en' ? en : zhTw));
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <router-view />
  </el-config-provider>
</template>
