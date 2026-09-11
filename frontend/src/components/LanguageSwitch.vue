<script setup lang="ts">
import { useI18n, type Locale } from '../i18n';

const { locale, setLocale, t } = useI18n();

const choices: { value: Locale; label: string; title: 'language.zh' | 'language.en' }[] = [
  { value: 'zh-TW', label: '中', title: 'language.zh' },
  { value: 'en', label: 'EN', title: 'language.en' },
];
</script>

<template>
  <div class="language-switch" role="group" :aria-label="t('language.label')">
    <button
      v-for="choice in choices"
      :key="choice.value"
      type="button"
      :class="{ active: locale === choice.value }"
      :aria-pressed="locale === choice.value"
      :title="t(choice.title)"
      @click="setLocale(choice.value)"
    >
      {{ choice.label }}
    </button>
  </div>
</template>

<style scoped>
.language-switch {
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 3px;
  border: 1px solid rgba(16, 37, 31, .12);
  border-radius: 12px;
  background: rgba(255, 255, 255, .48);
  box-shadow: 0 8px 28px rgba(16, 37, 31, .06);
  backdrop-filter: blur(12px);
}
.language-switch button {
  min-width: 34px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  color: var(--muted);
  background: transparent;
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: .04em;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, transform 180ms ease;
}
.language-switch button:hover { color: var(--ink); transform: translateY(-1px); }
.language-switch button.active { color: var(--night); background: var(--mint); box-shadow: 0 4px 10px rgba(84, 123, 38, .16); }
.language-switch button:focus-visible { outline: 2px solid var(--mint-deep); outline-offset: 2px; }
</style>
