<template>
    <span
        v-if="language.enabled"
        class="inline-flex items-center rounded-full px-2 py-px text-[11px] font-extrabold leading-5"
        :class="scope === 'all' ? 'bg-st-ink-100 text-st-ink-700' : 'bg-st-info-soft text-st-sky-600'"
        :data-testid="`scope-${scope}`"
    >
        {{ scope === 'all' ? t('languages.scope.all') : t('languages.scope.only', { language: language.nameOf(language.activeLanguage) }) }}
    </span>
</template>

<script setup lang="ts">
    import { useLanguageStore } from '~/stores/language';

    /**
     * Which languages a setting applies to (D-15): "All languages" (the review hour) or
     * "German only" (box chain, intake, Pool size). Hidden while multilingual is off — with one
     * language there is nothing to tell apart.
     */
    defineProps<{ scope: 'all' | 'language' }>();
    const { t } = useI18n();
    const language = useLanguageStore();
</script>
