<template>
  <div class="p-4">
    <div class="flex flex-col gap-8">
      <Card class="w-full rounded-lg border border-gray-100 shadow-sm">
        <div class="flex flex-col gap-6 p-4">
          <h2 class="text-xl font-semibold text-gray-900">Leitner System Preferences</h2>
          
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
               <label class="text-sm font-medium text-gray-700">Daily Review Limit</label>
               <input 
                 v-model.number="form.dailyLimit" 
                 type="number" 
                 min="5" 
                 max="100"
                 class="w-full rounded-md border border-gray-300 p-2 focus:border-primary-500 focus:outline-none"
               />
               <span class="text-xs text-gray-500">Maximum phrases to review per day.</span>
            </div>

            <div class="flex flex-col gap-2">
               <label class="text-sm font-medium text-gray-700">Total Boxes</label>
               <input 
                 v-model.number="form.totalBoxes" 
                 type="number" 
                 min="3" 
                 max="10" 
                 class="w-full rounded-md border border-gray-300 p-2 focus:border-primary-500 focus:outline-none"
               />
               <span class="text-xs text-gray-500">Number of Leitner boxes (3-10). Reducing this may move advanced phrases back.</span>
            </div>

            <div class="mt-4">
                <Button 
                   color="primary" 
                   size="md" 
                   @click="saveSettings" 
                   :label="saving ? 'Saving...' : 'Save Preferences'" 
                   :disabled="saving"
                />
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Card, Button } from '@codebridger/lib-vue-components/elements.ts';
import { functionProvider } from "@modular-rest/client";
import { useProfileStore } from '~/stores/profile';
import { storeToRefs } from 'pinia';

definePageMeta({
    layout: 'default',
    title: 'Preferences',
    middleware: ['auth'],
});

const form = ref({
    dailyLimit: 20,
    totalBoxes: 5
});
const saving = ref(false);
const profileStore = useProfileStore();
const { authUser } = storeToRefs(profileStore);

onMounted(() => {
    fetchSettings();
});

async function fetchSettings() {
    try {
        const userId = authUser.value?.id;
        const res: any = await functionProvider.run({
            name: "get-stats",
            args: { userId }
        });
        if (res && res.settings) {
            form.value = { ...res.settings };
        }
    } catch(e) {
        console.error(e);
    }
}

async function saveSettings() {
    saving.value = true;
    try {
        const userId = authUser.value?.id;
        await functionProvider.run({
            name: "update-settings",
            args: { 
                userId, 
                settings: { 
                    dailyLimit: form.value.dailyLimit, 
                    totalBoxes: form.value.totalBoxes 
                } 
            }
        });
        alert("Settings saved successfully");
    } catch(e) {
        console.error(e);
        alert("Failed to save settings");
    } finally {
        saving.value = false;
    }
}
</script>
