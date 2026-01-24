<template>
  <div class="p-4">
    <div class="flex flex-col gap-8">
      <Card class="w-full rounded-lg border border-gray-100 shadow-sm">
        <div class="flex flex-col gap-6 p-4">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Leitner System Preferences</h2>
          
          <div v-if="loading" class="flex justify-center p-8">
            <span class="text-gray-500">Loading settings...</span>
          </div>
          
          <LeitnerSettings 
            v-else 
            :initial-settings="settings" 
            @saved="onSaved"
            @reset="onReset"
          />
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

const settings = ref<any>(null);
const loading = ref(true);
const profileStore = useProfileStore();
const { authUser } = storeToRefs(profileStore);

onMounted(() => {
    fetchSettings();
});

async function fetchSettings() {
    loading.value = true;
    try {
        const userId = authUser.value?.id;
        const res: any = await functionProvider.run({
            name: "get-stats",
            args: { userId }
        });
        if (res && res.settings) {
            settings.value = res.settings;
        }
    } catch(e) {
        console.error(e);
    } finally {
        loading.value = false;
    }
}

function onSaved() {
    // Optionally refetch or show global toast
}

function onReset() {
    fetchSettings(); // Reload empty state
}
</script>
