<template>
    <div class="flex flex-col gap-2 rounded-st-lg border border-st-line bg-st-card px-[18px] py-3.5" data-testid="coming-later">
        <div v-for="lang in language.comingLater" :key="lang.code" class="flex min-h-[44px] items-center gap-3" :data-testid="`coming-later-${lang.code}`">
            <LanguageChip :code="lang.code" />
            <span class="flex min-w-0 flex-grow flex-col">
                <span class="text-st-base font-extrabold text-st-strong">{{ label(lang) }}</span>
                <span v-if="language.isInterested(lang.code)" class="text-st-xs font-bold text-st-jade-700">{{ t('languages.page.told') }}</span>
            </span>
            <StButton
                variant="soft"
                :color="language.isInterested(lang.code) ? 'accent' : 'neutral'"
                size="sm"
                :aria-pressed="language.isInterested(lang.code)"
                :data-testid="`tell-me-${lang.code}`"
                @click="toggle(lang.code)"
            >
                {{ language.isInterested(lang.code) ? t('languages.page.got-it') : t('languages.page.tell-me') }}
            </StButton>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { StButton } from 'subturtle-ui';
    import LanguageChip from '~/components/language/LanguageChip.vue';
    import { useLanguageStore } from '~/stores/language';
    import type { LearningLanguageCaps } from '~/types/language.type';

    /**
     * "Coming later" with Tell me (B-06): learning languages the register lists with
     * `enabled: false`. Tell me toggles; the server counts interest and returns the learner's
     * presses in get-language-state (`interests`), so "Got it" survives a reload. The toggle is
     * optimistic and rolls back if the server says no.
     */
    const { t } = useI18n();
    const language = useLanguageStore();

    const label = (lang: LearningLanguageCaps) => (lang.nativeName && lang.nativeName !== lang.name ? `${lang.name} · ${lang.nativeName}` : lang.name);

    async function toggle(code: string) {
        const on = !language.isInterested(code);
        try {
            await language.setInterest(code, on);
        } catch (error) {
            console.error('Tell me failed:', error);
        }
    }
</script>
