<template>
    <div class="flex flex-col gap-2 rounded-st-lg bg-st-sunken px-[18px] py-3.5">
        <div v-for="lang in language.comingLater" :key="lang.code" class="flex items-center gap-3">
            <LanguageChip :code="lang.code" />
            <span class="flex flex-grow flex-col">
                <span class="text-st-base font-extrabold text-st-strong">{{ label(lang) }}</span>
                <span v-if="told[lang.code]" class="text-st-xs font-bold text-st-jade-700">{{ t('languages.page.told') }}</span>
            </span>
            <StButton variant="soft" :color="told[lang.code] ? 'accent' : 'neutral'" size="sm" :data-testid="`tell-me-${lang.code}`" @click="toggle(lang.code)">
                {{ told[lang.code] ? t('languages.page.got-it') : t('languages.page.tell-me') }}
            </StButton>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';
    import { StButton } from 'subturtle-ui';
    import LanguageChip from '~/components/language/LanguageChip.vue';
    import { useLanguageStore, trackLanguageEvent } from '~/stores/language';
    import { languageApi } from '~/utils/languageApi';
    import type { LearningLanguageCaps } from '~/types/language.type';

    /**
     * "Coming later" with Tell me (B-06): languages the register knows but has not switched on.
     * Tell me toggles; the server counts interest. The toggle is optimistic and rolls back if
     * the server says no.
     */
    const { t } = useI18n();
    const language = useLanguageStore();
    const told = reactive<Record<string, boolean>>({});

    const label = (lang: LearningLanguageCaps) => (lang.nativeName && lang.nativeName !== lang.name ? `${lang.name} · ${lang.nativeName}` : lang.name);

    async function toggle(code: string) {
        const on = !told[code];
        told[code] = on;
        try {
            const res = await languageApi.setLanguageInterest(code, on);
            if (typeof res?.on === 'boolean') told[code] = res.on;
            trackLanguageEvent(ANALYTICS_EVENTS.LANGUAGE_INTEREST, { language: code, on });
        } catch (error) {
            console.error('Tell me failed:', error);
            told[code] = !on;
        }
    }
</script>
