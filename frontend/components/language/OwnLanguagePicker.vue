<template>
    <span class="relative block">
        <StIcon name="solar:global-linear" :size="20" class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-st-faint" />
        <select
            :value="modelValue ?? ''"
            :disabled="disabled"
            :aria-label="ariaLabel || t('languages.profile.own-language')"
            data-testid="own-language-picker"
            class="st-focus-ring h-[52px] w-full appearance-none rounded-st-md border-[1.5px] border-st-line bg-st-card pl-[46px] pr-11 font-st-sans text-st-base font-bold text-st-strong transition duration-150 ease-out focus:border-st-primary disabled:opacity-60"
            @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value || null)"
        >
            <option value="" disabled>{{ t('languages.profile.own-language-choose') }}</option>
            <option v-for="o in options" :key="o.code" :value="o.code">{{ o.label }}</option>
        </select>
        <StIcon name="solar:alt-arrow-down-linear" :size="20" class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-st-faint" />
    </span>
</template>

<script setup lang="ts">
    import { StIcon } from 'subturtle-ui';
    import { useLanguageStore } from '~/stores/language';

    /**
     * Picker of own languages (D-08, D-16): every own language in the capability register —
     * the languages our learners have — with native names (Q13). With `showReviewed`, each
     * says whether a teacher or the AI checked the Coach's explanations in it (Q10).
     */
    const props = withDefaults(defineProps<{ modelValue: string | null; showReviewed?: boolean; disabled?: boolean; ariaLabel?: string }>(), {
        showReviewed: false,
        disabled: false,
        ariaLabel: '',
    });
    const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

    const { t } = useI18n();
    const language = useLanguageStore();

    const options = computed(() =>
        [...language.ownLanguages]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((o) => {
                const name = o.nativeName && o.nativeName !== o.name ? `${o.name} · ${o.nativeName}` : o.name;
                const checked = o.explanationReviewed === 'teacher' ? t('languages.profile.checked-teacher') : t('languages.profile.checked-ai');
                return { code: o.code, label: props.showReviewed ? `${name} — ${checked}` : name };
            })
    );
</script>
