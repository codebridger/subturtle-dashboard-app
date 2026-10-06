<template>
    <!-- Count-adaptive Pool card. Renders nothing when the pool is empty. -->
    <StCard v-if="poolCount > 0" class="flex flex-col">
        <span class="mb-5 inline-flex h-[54px] w-[54px] items-center justify-center rounded-st-md bg-st-accent-soft text-st-jade-600">
            <StIcon name="solar:inbox-in-bold-duotone" :size="29" />
        </span>

        <h3 class="mb-1.5 text-st-md font-extrabold text-st-strong">{{ t('pool.title') }}</h3>
        <p class="mb-[18px] text-st-sm font-semibold text-st-muted [text-wrap:pretty]">{{ cardCopy }}</p>

        <div class="mt-auto flex flex-col gap-[10px]">
            <StButton color="primary" icon="solar:play-bold" block @click="start()">{{ t('pool.start') }}</StButton>
            <StButton v-if="poolCount > chunkSize" variant="outline" color="primary" block @click="doNext()">
                {{ t('pool.do_next', { chunk: chunkSize }) }}
            </StButton>
        </div>
    </StCard>
</template>

<script setup lang="ts">
    import { usePoolStore } from '~/stores/pool';
    import { useProfileStore } from '~/stores/profile';
    import { storeToRefs } from 'pinia';
    import { StButton, StCard, StIcon } from 'subturtle-ui';

    const { t } = useI18n();
    const router = useRouter();
    const poolStore = usePoolStore();
    const profileStore = useProfileStore();
    const { poolCount } = storeToRefs(poolStore);
    const { userDetail } = storeToRefs(profileStore);

    // Chunk size for "Do the next N" — user-configurable on the profile (default 10).
    const chunkSize = computed(() => (userDetail.value as any)?.poolChunkSize || 10);

    // ~15s per word, matching the spec's examples (8 words ≈ 2 min, 23 words ≈ 6 min).
    const estMinutes = computed(() => Math.max(1, Math.round(poolCount.value * 0.25)));

    // Copy adapts to how big the backlog is (spec's four ranges; 0 renders no card).
    const cardCopy = computed(() => {
        const count = poolCount.value;
        if (count <= 15) return t('pool.card_small', { count, mins: estMinutes.value });
        if (count <= 30) return t('pool.card_medium', { count, mins: estMinutes.value, chunk: chunkSize.value });
        return t('pool.card_large', { count, chunk: chunkSize.value });
    });

    function start() {
        poolStore.startSession();
        router.push('/practice/pool');
    }

    function doNext() {
        poolStore.startSession(chunkSize.value);
        router.push('/practice/pool');
    }
</script>
