<template>
    <div class="max-w-3xl p-4">
        <!-- Header -->
        <div class="mb-6">
            <div class="flex items-center gap-1">
                <Icon name="IconMultipleForwardRight" class="h-6 w-6" />
                <h1 class="text-2xl font-bold">{{ t('live-session.session-details') }}</h1>
            </div>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {{ session?.createdAt ? new Date(session.createdAt).toLocaleString() : '' }}
            </p>
        </div>

        <!-- Dialog Messages -->
        <div class="space-y-4">
            <div v-for="dialog in session?.dialogs" :key="dialog.id" class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
                <div class="flex items-start gap-4">
                    <div class="flex-shrink-0">
                        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                            <Icon :name="dialog.speaker === 'user' ? 'IconUser' : 'IconRobot'" class="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>
                    <div class="flex-grow">
                        <div class="mb-2 flex items-center gap-2">
                            <span class="font-medium">
                                {{ dialog.speaker === 'user' ? 'You' : 'Assistant' }}
                            </span>
                        </div>
                        <div class="prose max-w-none dark:prose-invert">
                            {{ dialog.content }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="my-8 flex justify-center">
            <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900 dark:border-white"></div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { Icon } from '@codebridger/lib-vue-components/elements.ts';
    import { dataProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE } from '~/types/database.type';
    import type { LiveSessionRecordType } from '~/types/live-session.type';

    const route = useRoute();
    const loading = ref(true);
    const session = ref<LiveSessionRecordType | null>(null);
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        middleware: ['auth'],
    });

    // Fetch session details with dialogs
    const fetchSession = async () => {
        try {
            const response = await dataProvider.findOne<LiveSessionRecordType>({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.LIVE_SESSION,
                query: {
                    _id: route.params.id as string,
                    refId: authUser.value?.id,
                },
            });
            session.value = response;
        } catch (error) {
            console.error('Error fetching session:', error);
        } finally {
            loading.value = false;
        }
    };

    onMounted(fetchSession);
</script>
