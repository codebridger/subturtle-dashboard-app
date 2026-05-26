<template>
    <div class="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <template v-if="errorKey">
            <h1 class="text-2xl font-bold">{{ t('live-practice.oops-something-went-wrong') }}</h1>
            <p class="text-lg">{{ t(errorKey) }}</p>
            <Button class="mt-4" @click="router.push('/')">{{ t('live-practice.back-to-dashboard') }}</Button>
        </template>
        <template v-else>
            <div class="h-10 w-10 animate-spin rounded-full border-b-2 border-primary"></div>
            <p class="text-sm text-gray-500 dark:text-white-light/60">{{ t('live-practice.going-live') }}</p>
        </template>
    </div>
</template>

<script setup lang="ts">
// Dispatcher for the live-session gate. The Gemini Live API (audio) and the
// text-only `generateContent` path are fundamentally different transports, so
// rather than branch one page on `mode`, this page resolves the request once
// and redirects to a dedicated voice or text page. Resolved phrases are stashed
// in the setup store so the target page doesn't re-fetch (it falls back to its
// own resolve on a hard refresh).
import { Button } from 'pilotui/elements';
import { useLivePracticeSetupStore } from '~/stores/livePracticeSetup';

definePageMeta({
    // @ts-ignore
    layout: 'blank',
    // @ts-ignore
    middleware: ['auth'],
});

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const setup = useLivePracticeSetupStore();
const errorKey = ref<string | null>(null);

onMounted(async () => {
    const raw = route.query.session as string | undefined;
    const request = await setup.resolve(raw);

    if (setup.errorKey || !request) {
        errorKey.value = setup.errorKey || 'live-practice.toast.no-session-data';
        return;
    }

    const target = request.mode === 'text' ? 'live-session-text' : 'live-session-voice';
    router.replace(`/practice/${target}?session=${encodeURIComponent(raw as string)}`);
});
</script>
