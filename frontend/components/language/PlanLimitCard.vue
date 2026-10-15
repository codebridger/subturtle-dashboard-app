<template>
    <!-- Compact: the row that replaces "Add a language" on the Languages page. -->
    <div
        v-if="compact"
        data-testid="plan-limit"
        class="flex min-h-[72px] flex-wrap items-center gap-3 rounded-st-lg bg-st-primary-tint px-[18px] py-3.5 text-st-sm font-semibold leading-normal text-st-body"
    >
        <StIcon name="solar:crown-bold-duotone" :size="22" class="text-st-rose-600" />
        <span class="min-w-[12rem] flex-1">{{ compactText }}</span>
        <StButton color="primary" size="sm" @click="router.push(plansUrl)">{{ isStarter ? t('languages.page.see-plans') : t('languages.page.upgrade') }}</StButton>
    </div>

    <!-- Full: step 1 of Add a language is replaced by this card at the limit (D-25). -->
    <section v-else data-testid="plan-limit" class="flex flex-col gap-3.5 rounded-st-xl border border-st-line bg-st-primary-tint px-6 py-[26px]">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-st-card text-st-rose-600">
            <StIcon name="solar:crown-bold-duotone" :size="32" />
        </span>
        <h2 class="text-st-xl font-black text-st-strong">{{ title }}</h2>
        <p class="text-st-base font-semibold leading-normal text-st-body">{{ body }}</p>
        <p v-for="p in language.pending" :key="p.language" class="text-st-sm font-bold text-st-sky-600">
            {{ t('languages.add.upgrade-waiting', { n: p.count, language: language.nameOf(p.language), date: formatLanguageDate(p.expiresAt) }, p.count) }}
        </p>
        <div class="flex flex-wrap items-center gap-2.5">
            <StButton color="primary" icon="solar:crown-bold" @click="router.push(plansUrl)">{{ isStarter ? t('languages.page.see-plans') : t('languages.page.upgrade') }}</StButton>
            <!-- Reader can make room by removing one; Starter has no swap (Q14). -->
            <StButton v-if="!isStarter" variant="ghost" color="neutral" @click="router.push('/settings/languages')">{{ t('languages.add.manage') }}</StButton>
            <NuxtLink to="/board" class="text-st-sm font-bold text-st-link">{{ t('languages.add.back-to-today') }}</NuxtLink>
        </div>
    </section>
</template>

<script setup lang="ts">
    import { StButton, StIcon } from 'subturtle-ui';
    import { useLanguageStore } from '~/stores/language';
    import { formatLanguageDate } from '~/utils/languageDates';

    /**
     * The plan limit (D-25, Q14): Starter 1 with no swap, Reader 3, Learner and Coach 10. Shown
     * instead of "Add a language" wherever the learner is at the limit. Upgrade goes to the
     * plans page with the next plan suggested.
     */
    withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

    const { t } = useI18n();
    const router = useRouter();
    const language = useLanguageStore();

    const isStarter = computed(() => language.plan === 'starter');
    const activeName = computed(() => language.nameOf(language.languages[0]?.code ?? language.activeLanguage));
    const plansUrl = computed(() => (isStarter.value ? '/settings/subscription?suggest=reader' : '/settings/subscription?suggest=learner'));

    const compactText = computed(() => {
        if (isStarter.value) return t('languages.page.limit-starter');
        if (language.plan === 'reader') return t('languages.page.limit-reader', { used: language.usedCount, max: language.maxLanguages });
        return t('languages.page.limit-other', { used: language.usedCount, max: language.maxLanguages });
    });

    const title = computed(() => {
        if (isStarter.value) return t('languages.add.upgrade-card-title');
        if (language.plan === 'reader') return t('languages.add.upgrade-card-title-reader', { max: language.maxLanguages });
        return t('languages.add.upgrade-card-title-full', { max: language.maxLanguages });
    });

    const body = computed(() => {
        if (isStarter.value) return t('languages.add.upgrade-card-body', { language: activeName.value });
        if (language.plan === 'reader') return t('languages.add.upgrade-card-body-reader', { used: language.usedCount, max: language.maxLanguages });
        return t('languages.add.upgrade-card-body-full');
    });
</script>
