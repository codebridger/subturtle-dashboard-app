<template>
  <div class="container mx-auto p-6 md:p-12">
    <div class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Review Dashboard
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-2">
          Track your progress and review due items.
        </p>
      </div>
      <div>
        <Button class="bg-primary-600 text-white" @click="startReview" :disabled="!hasPendingReview">
          Start Review
        </Button>
      </div>
    </div>

    <!-- Stats Section -->
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mb-10">
      <div v-for="(count, box) in stats.boxes" :key="box"
        class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300">Box {{ box }}</h3>
        <p class="text-3xl font-bold text-primary-600 mt-2">{{ count }}</p>
        <p class="text-sm text-gray-500 mt-1">phrases</p>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex flex-col space-y-4 mb-10">
      <NuxtLink to="/settings/preferences" class="text-primary-600 hover:underline">
        Manage Settings
      </NuxtLink>
    </div>

    <!-- Recent AI Lectures -->
    <div class="mt-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {{ t('review.recent-lectures') }}
        </h2>
        <NuxtLink to="/sessions" class="text-primary-600 hover:underline text-sm font-medium">
          {{ t('review.view-all') }}
        </NuxtLink>
      </div>

      <div v-if="isLoading" class="flex justify-center py-8">
        <span
          class="animate-spin border-4 border-primary-500 border-l-transparent rounded-full w-10 h-10 inline-block align-middle m-auto mb-10"></span>
      </div>
      <div v-else-if="!recentSessions.length" class="text-gray-500 dark:text-gray-400 py-4">
        {{ t('live-session.no-sessions') }}
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="session in recentSessions" :key="session._id"
          class="rounded-lg bg-white p-4 shadow transition-shadow hover:shadow-md dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <NuxtLink :to="`/sessions/${session._id}`" class="block h-full flex flex-col justify-between">
            <div>
              <div class="mb-3 flex items-baseline justify-between">
                <span
                  class="rounded-lg bg-blue-100 px-2 py-1 text-xs font-medium uppercase text-blue-600 dark:bg-blue-900 dark:text-blue-400">
                  {{ session.type }}
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {{ new Date(session.createdAt).toLocaleDateString() }}
                </span>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                {{ session.dialogs?.length || 0 }} {{ t('live-session.dialogs') }}
              </div>
              <div v-if="session.metadata" class="text-xs text-gray-500 dark:text-gray-400">
                <div v-if="session.metadata.aiCharacter">AI: {{ session.metadata.aiCharacter }}</div>
              </div>
            </div>
            <div class="mt-4 text-right">
              <Icon name="IconChevronRight" class="h-5 w-5 ml-auto text-gray-400" />
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { functionProvider, dataProvider } from "@modular-rest/client";
import { Button, Icon } from "@codebridger/lib-vue-components/elements.ts";
import { useProfileStore } from "~/stores/profile";
import { storeToRefs } from "pinia";
import { COLLECTIONS, DATABASE } from '~/types/database.type';
import type { LiveSessionRecordType } from '~/types/live-session.type';

const { t } = useI18n();
const stats = ref({ boxes: {}, totalPhrases: 0 });
const hasPendingReview = ref(false);
const recentSessions = ref<LiveSessionRecordType[]>([]);
const isLoading = ref(false);
const router = useRouter();
const profileStore = useProfileStore();
const { authUser } = storeToRefs(profileStore);

definePageMeta({
  middleware: ["auth"],
});

onMounted(() => {
  if (authUser.value?.id) {
    fetchStats();
    checkReview();
    fetchRecentSessions();
  } else {
    // Wait for auth? middleware handles it.
  }
});

async function fetchStats() {
  try {
    const res: any = await functionProvider.run({
      name: "get-stats",
      args: { userId: authUser.value?.id }
    });
    if (res) {
      stats.value = res;
    }
  } catch (e) {
    console.error(e);
  }
}

async function checkReview() {
  try {
    const res: any = await functionProvider.run({
      name: "get-review-bundle",
      args: { userId: authUser.value?.id }
    });
    if (res && res._id) {
      hasPendingReview.value = true;
    }
  } catch (e) {
    console.error(e);
  }
}

async function fetchRecentSessions() {
  isLoading.value = true;
  try {
    const controller = dataProvider.list<LiveSessionRecordType>(
      {
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.LIVE_SESSION,
        query: {
          refId: authUser.value?.id,
        },
        options: {
          sort: { createdAt: -1 },
        }
      },
      {
        limit: 3,
        page: 1,
        onFetched: (data) => {
          recentSessions.value = data;
        },
      }
    );
    // Update pagination and fetch
    await controller.updatePagination();
    await controller.fetchPage(1);
  } catch (e) {
    console.error("Failed to fetch sessions", e);
  } finally {
    isLoading.value = false;
  }
}

function startReview() {
  router.push(`/practice/flashcards-leitner?type=leitner`);
}

</script>
