<template>
    <StCard class="flex flex-col" data-testid="starter-pack-card">
        <span
            class="inline-flex items-center justify-center rounded-st-md bg-st-accent-soft text-st-jade-600"
            :class="prominent ? 'mb-[18px] h-[54px] w-[54px]' : 'mb-4 h-12 w-12'"
        >
            <StIcon name="solar:stars-bold-duotone" :size="prominent ? 29 : 26" />
        </span>
        <h3 class="font-extrabold text-st-strong" :class="prominent ? 'mb-1.5 text-st-md' : 'mb-[5px] text-st-base'">
            {{ t('languages.board.pack-title-lang', { language: name }) }}
        </h3>
        <p class="text-st-sm font-semibold text-st-muted [text-wrap:pretty]" :class="prominent ? 'mb-[18px]' : 'mb-4'">{{ body }}</p>
        <div class="mt-auto">
            <StButton v-if="prominent" variant="soft" color="accent" data-testid="starter-pack-start" @click="router.push('/practice/starter-pack')">
                {{ started ? t('languages.board.pack-continue') : t('languages.board.pack-start') }}
            </StButton>
            <StButton v-else variant="ghost" color="neutral" size="sm" @click="router.push('/practice/starter-pack')">
                {{ started ? t('languages.board.pack-continue') : t('languages.board.pack-cta') }}
            </StButton>
        </div>
    </StCard>
</template>

<script setup lang="ts">
    import { StButton, StCard, StIcon } from 'subturtle-ui';
    import { useLanguageStore } from '~/stores/language';

    /**
     * The starter pack as an offer on the board (D-11, Q5): optional, never a gate.
     * `prominent` is the new-language board, where it sits beside "Save your first phrase"
     * as an equal card with a Start button (Board design, state "new language").
     */
    const props = withDefaults(defineProps<{ prominent?: boolean }>(), { prominent: false });

    const { t } = useI18n();
    const router = useRouter();
    const language = useLanguageStore();

    const name = computed(() => language.nameOf(language.activeLanguage));
    const pack = computed(() => language.activeSummary?.starterPack ?? { state: 'none', heard: 0, total: 0 });
    const started = computed(() => pack.value.heard > 0 && pack.value.total > 0);

    const body = computed(() => {
        if (started.value) return t('languages.board.pack-progress', { heard: pack.value.heard, total: pack.value.total });
        if (!props.prominent) return t('languages.board.pack-body', { language: name.value });
        return pack.value.total > 0 ? t('languages.board.pack-body-new', { total: pack.value.total }) : t('languages.board.pack-body-new-nocount');
    });
</script>
