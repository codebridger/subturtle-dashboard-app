<template>
  <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <!-- Page header -->
    <header class="mb-8">
      <p class="text-[11px] font-black uppercase tracking-[0.2em] text-primary/60">{{ t('preferences.eyebrow') }}</p>
      <h1 class="mt-1 text-3xl font-black tracking-tight text-gray-900 dark:text-white">{{ t('preferences.title') }}</h1>
      <p class="mt-2 max-w-xl text-gray-500 dark:text-gray-400">{{ t('preferences.subtitle') }}</p>
    </header>

    <!-- Segmented tabs: one domain at a time keeps the page calm and gives each -->
    <!-- section its own save affordance. -->
    <div class="mb-8 inline-flex rounded-2xl border border-gray-100 bg-gray-100/70 p-1 dark:border-gray-700 dark:bg-gray-800/60">
      <button v-for="tab in tabs" :key="tab.key" type="button" @click="active = tab.key"
        class="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200"
        :class="active === tab.key
          ? 'bg-white text-primary shadow-sm dark:bg-gray-900'
          : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'">
        <Icon :name="tab.icon" class="!h-5 !w-5" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
    </div>

    <!-- Sections (only the active one is mounted, so only its save bar shows) -->
    <template v-else>
      <LeitnerSettings v-if="active === 'review'" :stats="stats" @saved="onSaved" @reset="onReset" />
      <PoolSettings v-else-if="active === 'pool'" :stats="stats" @saved="onSaved" />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { Icon } from 'pilotui/elements';
import LeitnerSettings from '~/components/Leitner/LeitnerSettings.vue';
import PoolSettings from '~/components/Pool/PoolSettings.vue';
import { functionProvider } from '@modular-rest/client';
import { useProfileStore } from '~/stores/profile';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

definePageMeta({
  layout: 'default',
  title: 'Preferences',
  middleware: ['auth'],
});

const active = ref<'review' | 'pool'>('review');

const tabs = computed(() => [
  { key: 'review' as const, label: t('smart_review.title'), icon: 'iconify solar--card-2-bold-duotone' },
  { key: 'pool' as const, label: t('pool.tab'), icon: 'iconify solar--inbox-in-bold-duotone' },
]);

const stats = ref<any>(null);
const loading = ref(true);
const profileStore = useProfileStore();
const { authUser } = storeToRefs(profileStore);

onMounted(() => {
  fetchStats();
});

async function fetchStats() {
  loading.value = true;
  try {
    const userId = authUser.value?.id;
    const res: any = await functionProvider.run({
      name: 'get-stats',
      args: { userId },
    });
    if (res) {
      stats.value = res;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function onSaved() {
  fetchStats();
}

function onReset() {
  fetchStats(); // Reload empty state
}
</script>
