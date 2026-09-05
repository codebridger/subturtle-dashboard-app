<template>
    <div class="flex flex-col gap-5">
        <!--
            Segmented tabs. The design draws Review settings as a single page, but Smart Review and
            the Pool are two independent domains with their own save affordances, and PoolSettings
            is still a pilotui screen awaiting its own PR — so the tab row stays and only the Smart
            Review side is migrated. Each section owns its page header, which is where the design
            puts the save controls.
        -->
        <div class="inline-flex w-fit gap-1 rounded-st-pill bg-st-ink-100 p-1">
            <button
                v-for="tab in tabs"
                :key="tab.key"
                type="button"
                class="st-focus-ring duration-fast inline-flex items-center gap-2 rounded-st-pill px-5 py-2 text-st-sm font-extrabold transition ease-out"
                :class="active === tab.key ? 'bg-st-card text-st-primary shadow-st-sm' : 'text-st-muted hover:text-st-body'"
                @click="active = tab.key"
            >
                <StIcon :name="tab.icon" :size="18" />
                {{ tab.label }}
            </button>
        </div>

        <div v-if="loading" class="flex flex-col gap-5">
            <div class="grid grid-cols-1 gap-[14px] sm:grid-cols-3">
                <StSkeleton v-for="n in 3" :key="n" class="h-[84px]" />
            </div>
            <div class="flex flex-wrap items-start gap-5">
                <div class="flex min-w-[288px] max-w-[328px] flex-[1_1_328px] flex-col gap-[14px]">
                    <StSkeleton class="h-[470px]" />
                    <StSkeleton class="h-[150px]" />
                </div>
                <div class="flex min-w-0 flex-[1_1_640px] flex-col gap-3">
                    <StSkeleton v-for="n in 5" :key="n" class="h-[100px]" />
                </div>
            </div>
        </div>

        <!-- Only the active section is mounted, so only its save bar shows. -->
        <template v-else>
            <LeitnerSettings v-if="active === 'review'" :stats="stats" @saved="onSaved" @reset="onReset" />
            <PoolSettings v-else-if="active === 'pool'" :stats="stats" @saved="onSaved" />
        </template>
    </div>
</template>

<script lang="ts" setup>
    import { StIcon, StSkeleton } from 'subturtle-ui';
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
        { key: 'review' as const, label: t('smart_review.title'), icon: 'solar:card-2-bold-duotone' },
        { key: 'pool' as const, label: t('pool.tab'), icon: 'solar:inbox-in-bold-duotone' },
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
