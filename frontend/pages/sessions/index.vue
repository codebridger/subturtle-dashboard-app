<template>
    <div class="flex flex-col gap-6">
        <StPageHeader :title="t('live-session.session-history')" :overline="t('live-session.history-overline')" :subtitle="t('live-session.6-months-expiry')">
            <template #actions>
                <StButton color="primary" icon="solar:add-circle-bold" @click="goToNewSession">{{ t('live-session.new-session') }}</StButton>
            </template>
        </StPageHeader>

        <!-- Loading: five timeline rows, so the column keeps its shape while the page lands. -->
        <div v-if="isLoading && !sessionList.length" class="flex flex-col gap-3.5">
            <StSkeleton v-for="n in 5" :key="n" class="h-[76px]" />
        </div>

        <template v-else>
            <!-- Full history is a Learner+ entitlement. The list is replaced by a teaser: the
                 shape of what is there, with the transcripts withheld. -->
            <InlineNotice
                v-if="locked"
                color="danger"
                icon="solar:lock-keyhole-bold"
                :title="t('subscription.feature-locked.session_history.title')"
                :message="t('subscription.feature-locked.session_history.body')"
            />

            <!-- Search + mode filter narrow the CURRENT page only; the RPC paginates
                 server-side and has no query parameters to push these into. -->
            <div v-if="!isEmptyState && !locked" class="flex flex-wrap items-center gap-3.5">
                <StInput v-model="search" :placeholder="t('live-session.search-sessions')" icon="solar:magnifer-linear" class="w-[300px] max-w-full" />
                <StSegmentedControl v-model="modeFilter" :options="modeFilters" />
            </div>

            <!-- Timeline. The rail is drawn on the row, not the list, so it cannot outrun the
                 last card when the list is filtered down. -->
            <ol v-if="visibleSessions.length" class="flex flex-col">
                <li v-for="(session, i) in visibleSessions" :key="session._id" class="flex gap-5">
                    <div class="w-[150px] flex-none pt-3.5 text-right">
                        <div class="text-st-base font-extrabold text-st-strong">{{ formatWhen(session.createdAt) }}</div>
                        <div class="mt-0.5 text-st-sm font-semibold text-st-muted">{{ durationOf(session) }}</div>
                    </div>

                    <!-- Rail + node. The segment is hidden on the last row so the line stops
                         with the timeline instead of trailing into the footer. -->
                    <div class="relative flex w-3 flex-none justify-center">
                        <span class="absolute top-0 w-px bg-st-line" :class="i === visibleSessions.length - 1 ? 'h-[38px]' : 'h-full'" />
                        <span
                            class="absolute top-[32px] h-2.5 w-2.5 rounded-full ring-4 ring-st-page"
                            :class="isText(session) ? 'bg-st-info' : 'bg-st-primary'"
                        />
                    </div>

                    <NuxtLink
                        :to="`/sessions/${session._id}`"
                        class="st-focus-ring mb-3.5 flex flex-1 items-center gap-3.5 rounded-st-lg border border-st-line bg-st-card p-3.5 shadow-st-xs transition duration-200 ease-out hover:border-st-ink-300 hover:shadow-st-sm"
                    >
                        <span
                            class="flex h-11 w-11 flex-none items-center justify-center rounded-st-md"
                            :class="isText(session) ? 'bg-st-info-soft text-st-sky-600' : 'bg-st-primary-soft text-st-primary'"
                        >
                            <StIcon :name="isText(session) ? 'solar:chat-round-line-bold-duotone' : 'solar:microphone-3-bold-duotone'" :size="22" />
                        </span>

                        <span class="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                            <span class="truncate text-st-base font-extrabold text-st-strong">{{ titleOf(session) }}</span>
                            <StBadge :color="isText(session) ? 'info' : 'primary'">
                                {{ isText(session) ? t('live-practice.mode.text') : t('live-practice.mode.voice') }}
                            </StBadge>
                        </span>

                        <span class="flex flex-none items-center gap-1.5 text-st-sm font-bold text-st-muted">
                            {{ t('live-session.n-dialogs', { n: session.dialogs?.length || 0 }) }}
                            <StIcon name="solar:alt-arrow-right-linear" :size="18" />
                        </span>
                    </NuxtLink>
                </li>
            </ol>

            <!-- Locked: the rows are there, the transcripts are not. -->
            <ol v-else-if="locked" class="flex flex-col" aria-hidden="true">
                <li v-for="(n, i) in 3" :key="n" class="flex gap-5">
                    <div class="w-[150px] flex-none pt-3.5 text-right">
                        <div class="h-3.5 w-24 rounded-st-pill bg-st-ink-150" />
                        <div class="ml-auto mt-2 h-3 w-12 rounded-st-pill bg-st-ink-100" />
                    </div>
                    <div class="relative flex w-3 flex-none justify-center">
                        <span class="absolute top-0 w-px bg-st-line" :class="i === 2 ? 'h-[38px]' : 'h-full'" />
                        <span class="absolute top-[32px] h-2.5 w-2.5 rounded-full bg-st-ink-300 ring-4 ring-st-page" />
                    </div>
                    <div class="mb-3.5 flex flex-1 items-center gap-3.5 rounded-st-lg border border-st-line bg-st-card p-3.5">
                        <span class="flex h-11 w-11 flex-none items-center justify-center rounded-st-md bg-st-ink-100 text-st-faint">
                            <StIcon name="solar:lock-keyhole-bold" :size="22" />
                        </span>
                        <span class="flex-1 text-st-base font-bold text-st-faint">{{ t('live-session.transcript-locked') }}</span>
                        <span class="h-3.5 w-16 rounded-st-pill bg-st-ink-100" />
                    </div>
                </li>
            </ol>

            <!-- No match for the active search / filter. Distinct from having no sessions. -->
            <StCard v-else-if="!isEmptyState" padding="none">
                <StEmptyState
                    compact
                    icon="solar:magnifer-linear"
                    color="neutral"
                    :title="t('live-session.no-matches')"
                    :description="t('live-session.no-matches-description')"
                >
                    <template #action>
                        <StButton variant="outline" color="primary" size="sm" @click="resetFilters">{{ t('bundle.clear_filter') }}</StButton>
                    </template>
                </StEmptyState>
            </StCard>

            <StCard v-else padding="none">
                <StEmptyState
                    icon="solar:history-2-bold-duotone"
                    color="neutral"
                    :title="t('live-session.no-sessions')"
                    :description="t('live-session.no-sessions-description')"
                >
                    <template #action>
                        <StButton color="primary" icon="solar:play-bold" @click="goToBundles">{{ t('live-session.start-first-session') }}</StButton>
                    </template>
                </StEmptyState>
            </StCard>

            <!-- Locked users get the upgrade path where the footer line would be. -->
            <div v-if="locked" class="flex justify-center">
                <StButton color="primary" icon="solar:crown-bold" @click="goToPlans">{{ t('subscription.feature-locked.session_history.cta') }}</StButton>
            </div>

            <p v-else-if="visibleSessions.length" class="text-st-sm font-semibold text-st-muted">
                {{ t('live-session.showing-count', { shown: visibleSessions.length, total }) }}
                {{ t('live-session.6-months-removal') }}
            </p>

            <StPagination
                v-if="totalPages > 1 && !isEmptyState && !locked"
                v-model="currentPage"
                :total-pages="totalPages"
                :label="t('live-session.session-history')"
                @change-page="loadSessions"
            />
        </template>
    </div>
</template>

<script setup lang="ts">
    import { StBadge, StButton, StCard, StEmptyState, StIcon, StInput, StSegmentedControl, StSkeleton } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import StPagination from '~/components/common/StPagination.vue';
    import InlineNotice from '~/components/common/InlineNotice.vue';
    import { useInlineFeatureLock } from '~/composables/useTierLimitModal';
    import { functionProvider } from '@modular-rest/client';
    import type { LiveSessionRecordType, LivePracticeSessionSetupType } from '~/types/live-session.type';
    import { formatSessionDuration } from '~/utils/duration';

    const { t } = useI18n();
    const router = useRouter();

    definePageMeta({
        layout: 'default',
        title: () => t('live-session.session-history'),
        // @ts-ignore
        middleware: ['auth'],
    });

    const perPage = ref(20);
    const sessionList = ref<any[]>([]);
    const currentPage = ref(1);
    const totalPages = ref(1);
    const total = ref(0);
    const isLoading = ref(false);
    const locked = ref(false);

    const search = ref('');
    const modeFilter = ref<'all' | 'voice' | 'text'>('all');

    // session_history renders as an inline locked state on this page, so the
    // global tier-limit modal defers to it (no double upsell on the same lock).
    useInlineFeatureLock('session_history');

    const isEmptyState = computed(() => !sessionList.value.length && !isLoading.value && !locked.value);

    // Type guard for practice sessions
    const isPracticeSession = (session: any): session is LiveSessionRecordType & { session: LivePracticeSessionSetupType } => {
        return session.type === 'bundle-practice' && !!session.session;
    };

    /**
     * Voice or text. `metadata` is the LiveSessionRequest the practice page stored, which
     * carries `mode`; anything older predates text chat and is voice.
     *
     * The previous version keyed this off `session._isText`, a field nothing in the codebase
     * ever assigned — so the Text badge could never render.
     */
    const isText = (session: any) => session?.metadata?.mode === 'text';

    /** The bundle the session practised, falling back to its record type. */
    const titleOf = (session: any) => session?.metadata?.title || session?.type || '—';

    /**
     * "8 min" — the timeline's duration line. `formatSessionDuration` stays the precise form
     * ("8m 0s") the session detail page wants; a list scanned at a glance reads better
     * rounded, and the seconds are noise next to a date.
     */
    function durationOf(session: any) {
        if (!session.updatedAt) return '—';
        const ms = new Date(session.updatedAt).getTime() - new Date(session.createdAt).getTime();
        if (!Number.isFinite(ms) || ms < 0) return formatSessionDuration(session.createdAt, session.updatedAt);
        const minutes = Math.round(ms / 60000);
        return minutes < 1 ? t('live-session.under-a-minute') : t('live-session.n-minutes', { n: minutes });
    }

    /**
     * "12 Aug, 14:20" — the timeline's left column. Day-first and 24-hour, pinned with an
     * explicit locale: the visitor's own would render "Aug 12, 02:20 PM" in en-US and break
     * the column's fixed width.
     */
    function formatWhen(value: string | Date) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${day}, ${time}`;
    }

    const modeFilters = computed(() => [
        { value: 'all', label: t('live-session.filter.all') },
        { value: 'voice', label: t('live-practice.mode.voice') },
        { value: 'text', label: t('live-practice.mode.text') },
    ]);

    const visibleSessions = computed(() => {
        const needle = search.value.trim().toLowerCase();
        return sessionList.value.filter((s) => {
            if (modeFilter.value === 'text' && !isText(s)) return false;
            if (modeFilter.value === 'voice' && isText(s)) return false;
            return needle ? String(titleOf(s)).toLowerCase().includes(needle) : true;
        });
    });

    function resetFilters() {
        search.value = '';
        modeFilter.value = 'all';
    }

    // Full session history is a Learner+ entitlement. The gated list-live-sessions
    // RPC merges voice + text and paginates server-side; for free/Reader it throws
    // TIER_LIMIT_REACHED (the global interceptor shows the upgrade modal) and we
    // render a locked state instead of the list.
    async function loadSessions(page = 1) {
        isLoading.value = true;
        try {
            const res = await functionProvider.run<{ items: any[]; pages: number; total: number }>({
                name: 'list-live-sessions',
                args: { userId: authUser.value?.id, page: page - 1, limit: perPage.value },
            });
            sessionList.value = res.items || [];
            currentPage.value = page;
            totalPages.value = res.pages || 1;
            total.value = res.total ?? sessionList.value.length;
            locked.value = false;
        } catch (e) {
            sessionList.value = [];
            locked.value = true;
        } finally {
            isLoading.value = false;
        }
    }

    onMounted(() => loadSessions(1));

    function goToBundles() {
        router.push('/bundles');
    }

    function goToNewSession() {
        router.push('/sessions/new');
    }

    function goToPlans() {
        router.push('/settings/subscription?suggest=learner&from=cap-hit-banner');
    }
</script>
