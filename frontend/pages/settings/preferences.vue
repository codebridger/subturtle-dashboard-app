<template>
  <div class="p-4">
    <div class="flex flex-col gap-8">
      <Card class="w-full rounded-lg border border-gray-100 shadow-sm">
        <div class="flex flex-col gap-6 p-4">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Leitner System Preferences</h2>

          <div v-if="loading" class="flex justify-center p-8">
            <span class="text-gray-500">Loading settings...</span>
          </div>

          <LeitnerSettings v-else :stats="stats" @saved="onSaved" @reset="onReset" />
        </div>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Card } from '@codebridger/lib-vue-components/elements.ts';
import LeitnerSettings from '~/components/Leitner/LeitnerSettings.vue';
import { functionProvider } from "@modular-rest/client";
import { useProfileStore } from '~/stores/profile';
import { storeToRefs } from 'pinia';

definePageMeta({
  layout: 'default',
  title: 'Preferences',
  middleware: ['auth'],
});

const stats = ref<any>(null); // renamed from settings to stats to be more accurate
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
      name: "get-stats",
      args: { userId }
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
