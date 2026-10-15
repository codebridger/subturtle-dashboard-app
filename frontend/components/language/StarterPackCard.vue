<template>
    <StCard class="flex flex-col" data-testid="starter-pack-card">
        <span class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-st-md bg-st-accent-soft text-st-jade-600">
            <StIcon name="solar:stars-bold-duotone" :size="26" />
        </span>
        <h3 class="mb-[5px] text-st-base font-extrabold text-st-strong">{{ t('languages.board.pack-title-lang', { language: name }) }}</h3>
        <p class="mb-4 text-st-sm font-semibold text-st-muted [text-wrap:pretty]">
            {{ started ? t('languages.board.pack-progress', { heard: pack.heard, total: pack.total }) : t('languages.board.pack-body', { language: name }) }}
        </p>
        <div class="mt-auto">
            <StButton variant="ghost" color="neutral" size="sm" @click="router.push('/practice/starter-pack')">
                {{ started ? t('languages.board.pack-continue') : t('languages.board.pack-cta') }}
            </StButton>
        </div>
    </StCard>
</template>

<script setup lang="ts">
    import { StButton, StCard, StIcon } from 'subturtle-ui';
    import { useLanguageStore } from '~/stores/language';

    /** The starter pack as an offer on the board (D-11, Q5): optional, never a gate. */
    const { t } = useI18n();
    const router = useRouter();
    const language = useLanguageStore();

    const name = computed(() => language.nameOf(language.activeLanguage));
    const pack = computed(() => language.activeSummary?.starterPack ?? { state: 'none', heard: 0, total: 0 });
    const started = computed(() => pack.value.heard > 0 && pack.value.total > 0);
</script>
