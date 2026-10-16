<template>
    <div class="flex flex-col gap-6">
        <StPageHeader :overline="t('languages.page.overline')" :title="t('languages.page.title')" :subtitle="t('languages.page.subtitle')" />

        <div v-if="toast" role="status" class="flex max-w-[900px] items-center gap-2.5 rounded-st-md bg-st-accent-soft px-4 py-3 text-st-sm font-extrabold text-st-jade-700">
            <StIcon name="solar:check-circle-bold" :size="20" />
            {{ toast }}
        </div>

        <!-- One card per language (active and paused). "What is ready" is listed here and only
             here: everywhere else a feature that is not ready is hidden (contract section 5). -->
        <div class="grid max-w-[900px] gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
            <section
                v-for="lang in cards"
                :key="lang.code"
                :data-testid="`language-card-${lang.code}`"
                class="flex flex-col gap-3.5 rounded-st-lg bg-st-card p-5 shadow-st-sm"
                :class="lang.active ? 'border-2 border-st-jade-500' : 'border border-st-line'"
            >
                <div class="flex items-center gap-3.5">
                    <LanguageChip :code="lang.code" :on="lang.active" size="lg" />
                    <span class="flex min-w-0 flex-grow flex-col">
                        <span class="text-st-md font-extrabold text-st-strong">{{ lang.label }}</span>
                        <span class="text-st-sm font-semibold text-st-muted">{{ lang.meta }}</span>
                    </span>
                    <StBadge v-if="lang.active" color="accent">{{ t('languages.page.active') }}</StBadge>
                </div>

                <div v-if="lang.caps.length" class="flex flex-col">
                    <div v-for="cap in lang.caps" :key="cap.key" class="flex min-h-10 items-center gap-2.5 border-t border-st-line">
                        <StIcon :name="cap.ready ? 'solar:check-circle-bold' : 'solar:clock-circle-bold-duotone'" :size="18" :class="cap.ready ? 'text-st-jade-700' : 'text-st-muted'" />
                        <span class="flex-grow text-st-sm font-bold text-st-strong">{{ cap.label }}</span>
                        <span class="text-st-xs font-bold" :class="cap.ready ? 'text-st-jade-700' : 'text-st-muted'">
                            {{ cap.ready ? t('languages.page.cap.ready') : t('languages.page.cap.not-yet') }}
                        </span>
                    </div>
                </div>

                <div class="mt-auto flex flex-wrap gap-2">
                    <StButton v-if="lang.canActivate" color="primary" size="sm" :disabled="busy" @click="makeActive(lang.code)">
                        {{ t('languages.page.make-active') }}
                    </StButton>
                    <StButton v-if="lang.paused" color="primary" size="sm" icon="solar:crown-bold" @click="router.push('/settings/subscription')">
                        {{ t('languages.page.upgrade-to-continue') }}
                    </StButton>
                    <!-- Where you start: retake the chat test from here; the result returns here. -->
                    <StButton v-if="lang.canRetake" variant="soft" color="neutral" size="sm" @click="router.push(`/settings/languages/test?language=${lang.code}&manage=1`)">
                        {{ t('languages.page.retake') }}
                    </StButton>
                    <StButton variant="ghost" color="danger" size="sm" :disabled="busy" @click="confirmCode = lang.code">
                        {{ t('languages.page.remove') }}
                    </StButton>
                </div>
            </section>
        </div>

        <div class="grid max-w-[900px] gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
            <!-- Add a language, or the plan-limit card in its place (D-25). Starter never swaps. -->
            <NuxtLink
                v-if="language.canAdd"
                to="/settings/languages/add"
                class="flex min-h-[72px] items-center gap-3.5 rounded-st-lg border-[1.5px] border-dashed border-st-line-strong px-[18px] text-st-strong no-underline"
            >
                <StIcon name="solar:add-circle-bold" :size="26" class="text-st-rose-600" />
                <span class="flex flex-grow flex-col">
                    <span class="text-st-base font-extrabold">{{ t('languages.page.add-title') }}</span>
                    <span v-if="addableNames" class="text-st-sm font-semibold text-st-muted">{{ addableNames }}</span>
                </span>
                <span class="text-st-sm font-bold text-st-muted">{{ t('languages.menu.used', { used: language.usedCount, max: language.maxLanguages }) }}</span>
            </NuxtLink>
            <PlanLimitCard v-else compact />

            <!-- The own language: shared by every learning language, edited in Profile. -->
            <NuxtLink to="/settings/profile" class="flex min-h-[72px] items-center gap-3.5 rounded-st-lg bg-st-sunken px-[18px] py-3 text-st-strong no-underline">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-st-md bg-st-card text-st-sm font-bold">
                    <LangText v-if="language.ownLanguage" :code="language.ownLanguage">{{ language.nativeNameOf(language.ownLanguage).slice(0, 2) }}</LangText>
                    <StIcon v-else name="solar:global-linear" :size="20" />
                </span>
                <span class="flex flex-grow flex-col">
                    <span class="text-st-base font-extrabold">
                        {{ language.ownLanguage ? t('languages.page.you-speak-title', { language: language.nameOf(language.ownLanguage) }) : t('languages.page.you-speak-unset') }}
                    </span>
                    <span class="text-st-sm font-semibold text-st-muted">{{ t('languages.page.you-speak-sub') }}</span>
                </span>
                <span class="text-st-sm font-extrabold text-st-link">{{ t('languages.page.change-in-profile') }}</span>
            </NuxtLink>

            <!-- Kept phrases (Q6): one card per language they wait for. -->
            <NuxtLink
                v-for="p in language.pending"
                :key="p.language"
                :to="`/settings/languages/add?language=${p.language}`"
                :data-testid="`kept-${p.language}`"
                class="flex min-h-[72px] items-center gap-3.5 rounded-st-lg bg-st-info-soft px-[18px] py-3 text-st-strong no-underline"
            >
                <StIcon name="solar:inbox-line-bold-duotone" :size="26" class="text-st-sky-600" />
                <span class="flex flex-grow flex-col">
                    <span class="text-st-base font-extrabold">{{ t('languages.page.kept-title', { n: p.count, language: language.nameOf(p.language) }, p.count) }}</span>
                    <span class="text-st-sm font-semibold text-st-muted">
                        {{ t('languages.page.kept-sub', { language: language.nameOf(p.language), date: formatDate(p.expiresAt) }) }}
                    </span>
                </span>
                <span class="text-st-sm font-extrabold text-st-link">{{ t('languages.page.kept-cta', { language: language.nameOf(p.language) }) }}</span>
            </NuxtLink>

            <!-- Removed in the last 30 days: adding it again brings everything back (Q2). -->
            <div
                v-for="r in language.removedLanguages"
                :key="r.code"
                :data-testid="`removed-${r.code}`"
                class="flex min-h-[72px] items-center gap-3.5 rounded-st-lg bg-st-sunken px-[18px] py-3"
            >
                <LanguageChip :code="r.code" />
                <span class="flex flex-grow flex-col">
                    <span class="text-st-base font-extrabold text-st-strong">{{ pickerName(r.code) }}</span>
                    <span class="text-st-sm font-semibold text-st-muted">{{ t('languages.page.removed-meta', { date: formatDate(r.purgeAt) }) }}</span>
                </span>
                <StButton v-if="language.canRestore" variant="soft" color="neutral" size="sm" :disabled="busy" @click="restore(r)">
                    {{ t('languages.page.restore') }}
                </StButton>
            </div>
        </div>

        <!-- Coming later (B-06): every learning language the register lists as not enabled yet. -->
        <section v-if="language.comingLater.length" class="flex max-w-[900px] flex-col gap-2.5" data-testid="languages-coming-later">
            <h2 class="text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">{{ t('languages.page.coming-later-title') }}</h2>
            <p class="text-st-sm font-semibold text-st-muted">{{ t('languages.page.coming-later-note') }}</p>
            <ComingLaterRow />
        </section>

        <StModal
            v-if="confirmCode"
            :title="t('languages.page.remove-confirm.title', { language: confirmName })"
            size="sm"
            @close="confirmCode = null"
        >
            <p class="text-st-base font-semibold leading-normal text-st-body">
                {{ t('languages.page.remove-confirm.body', { language: confirmName, date: formatDate(purgeDate) }) }}
            </p>
            <p class="mt-3 text-st-sm font-semibold leading-normal text-st-muted">{{ t('languages.page.remove-confirm.note') }}</p>
            <template #actions>
                <StButton variant="ghost" color="neutral" @click="confirmCode = null">{{ t('languages.page.remove-confirm.keep', { language: confirmName }) }}</StButton>
                <StButton color="danger" :disabled="busy" @click="doRemove">{{ t('languages.page.remove-confirm.remove', { language: confirmName }) }}</StButton>
            </template>
        </StModal>
    </div>
</template>

<script setup lang="ts">
    import { StBadge, StButton, StIcon, StModal } from 'subturtle-ui';
    import { toastError } from 'pilotui/toast';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import LanguageChip from '~/components/language/LanguageChip.vue';
    import LangText from '~/components/language/LangText.vue';
    import PlanLimitCard from '~/components/language/PlanLimitCard.vue';
    import ComingLaterRow from '~/components/language/ComingLaterRow.vue';
    import { useLanguageStore } from '~/stores/language';
    import { useLanguageSwitch } from '~/composables/useLanguageSwitch';
    import { usePageCrumb } from '~/composables/usePageCrumb';
    import { formatLanguageDate, purgeDateFromNow } from '~/utils/languageDates';
    import type { LanguageFeatures, LanguageSummary } from '~/types/language.type';

    definePageMeta({
        layout: 'default',
        // @ts-ignore
        middleware: ['auth', 'multilingual'],
    });

    const { t } = useI18n();
    const router = useRouter();
    const language = useLanguageStore();
    const { switchTo } = useLanguageSwitch();

    usePageCrumb(() => ({ section: t('nav.account'), label: t('languages.page.title') }));

    const busy = ref(false);
    const toast = ref('');
    const confirmCode = ref<string | null>(null);

    /** The capability rows each card lists, in the design's order. */
    const CAP_ROWS: (keyof LanguageFeatures)[] = ['save', 'review', 'coachText', 'coachVoice', 'starterPack', 'map'];

    const pickerName = (code: string) => {
        const name = language.nameOf(code);
        const native = language.nativeNameOf(code);
        return native && native !== name ? `${name} · ${native}` : name;
    };

    const formatDate = (iso?: string | null) => formatLanguageDate(iso);
    const purgeDate = computed(() => purgeDateFromNow());

    const cards = computed(() =>
        [...language.languages, ...language.pausedLanguages].map((l: LanguageSummary) => {
            const paused = l.status === 'paused';
            const active = !paused && l.code === language.activeLanguage;
            const features = language.features(l.code);
            return {
                code: l.code,
                label: pickerName(l.code),
                active,
                paused,
                canActivate: !active && !paused,
                canRetake: !paused && !!features.levelTest,
                meta: paused
                    ? l.phraseCount
                        ? t('languages.page.paused-meta', { n: l.phraseCount })
                        : t('languages.page.paused-meta-none')
                    : t('languages.page.card-meta', { level: l.startLevel, phrases: l.phraseCount, due: l.dueCount }),
                // A paused language has no board or reviews, so its card lists nothing ready.
                caps: paused ? [] : CAP_ROWS.map((key) => ({ key, label: t(`languages.page.cap.${key}`), ready: !!features[key] })),
            };
        })
    );

    const addableNames = computed(() => language.addable.map((c) => c.name).join(', '));
    const confirmName = computed(() => (confirmCode.value ? language.nameOf(confirmCode.value) : ''));

    async function makeActive(code: string) {
        busy.value = true;
        // Make active shows a confirmation here, then the learner can head to Today from the menu.
        const ok = await switchTo(code, { goToday: false });
        busy.value = false;
        if (ok) toast.value = t('languages.switched', { language: language.nameOf(code) });
    }

    async function doRemove() {
        const code = confirmCode.value;
        if (!code) return;
        busy.value = true;
        try {
            const { purgeAt } = await language.removeLanguage(code);
            toast.value = t('languages.page.removed-toast', { language: language.nameOf(code), date: formatDate(purgeAt ?? purgeDate.value) });
            confirmCode.value = null;
        } catch (error) {
            console.error('Remove language failed:', error);
            toastError(t('languages.page.error'), { position: 'top-end' });
        } finally {
            busy.value = false;
        }
    }

    /**
     * Adding a removed language again within 30 days restores it as it was (Q2). Its start level
     * is sent back unchanged, so a restore never asks the level question again.
     */
    async function restore(r: LanguageSummary) {
        busy.value = true;
        try {
            await language.addLanguage({ language: r.code, startLevel: r.startLevel, startLevelSource: r.startLevelSource });
            toast.value = t('languages.switched', { language: language.nameOf(r.code) });
        } catch (error: any) {
            if (error?.code === 'upgrade_needed') router.push('/settings/languages/add');
            else toastError(t('languages.page.error'), { position: 'top-end' });
        } finally {
            busy.value = false;
        }
    }
</script>
