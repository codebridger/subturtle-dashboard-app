<template>
    <div class="flex max-w-[760px] flex-col gap-[22px]">
        <StPageHeader :overline="overline" :title="title" :subtitle="subtitle" />

        <div v-if="showSteps" class="flex flex-wrap items-center gap-2 text-st-xs font-extrabold text-st-muted">
            <span class="rounded-st-pill bg-st-primary-soft px-2.5 py-[3px] text-st-rose-700">{{ t('languages.add.step', { n: Math.min(step, 2) }) }}</span>
            <span v-if="language.ownLanguage">
                {{ t('languages.add.own-note', { language: language.nameOf(language.ownLanguage) }) }}
                <NuxtLink to="/settings/profile" class="text-st-link">{{ t('languages.add.own-note-link') }}</NuxtLink>.
            </span>
        </div>

        <!-- At the plan limit, step 1 is replaced by the upgrade card (D-25). Starter never swaps. -->
        <PlanLimitCard v-if="atLimit" />

        <!-- Step 1: pick one of the ready languages the learner does not have yet (Q13). -->
        <div v-else-if="step === 1" class="flex flex-col gap-3">
            <div v-if="waitingForPick" class="flex items-center gap-2.5 rounded-st-md bg-st-info-soft px-4 py-3 text-st-sm font-bold text-st-sky-600" data-testid="kept-notice">
                <StIcon name="solar:inbox-line-bold-duotone" :size="22" />
                <span>
                    {{ t('languages.add.waiting', { n: waitingForPick.count, language: language.nameOf(waitingForPick.language), date: formatLanguageDate(waitingForPick.expiresAt) }, waitingForPick.count) }}
                </span>
            </div>

            <!-- First run: the own language, when the server does not know it yet. -->
            <label v-if="isFirstRun && !language.ownLanguage" class="flex flex-col gap-1.5">
                <span class="text-st-sm font-extrabold text-st-body">{{ t('languages.add.first-run-own') }}</span>
                <OwnLanguagePicker v-model="ownPick" />
                <span class="text-st-xs font-semibold text-st-muted">{{ t('languages.add.first-run-own-sub') }}</span>
            </label>

            <h2 class="text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">{{ t('languages.add.ready-now') }}</h2>
            <p v-if="!choices.length" class="text-st-base font-semibold text-st-muted">{{ t('languages.add.nothing-left') }}</p>
            <div role="radiogroup" :aria-label="t('languages.add.step1-title')" class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                    v-for="c in choices"
                    :key="c.code"
                    type="button"
                    role="radio"
                    :aria-checked="pick === c.code"
                    :data-testid="`pick-${c.code}`"
                    class="st-focus-ring flex min-h-[72px] cursor-pointer items-center gap-3.5 rounded-st-lg px-4 text-left font-st-sans text-st-strong"
                    :class="pick === c.code ? 'border-2 border-st-jade-500 bg-st-accent-tint' : 'border border-st-line bg-st-card'"
                    @click="pick = c.code"
                >
                    <LanguageChip :code="c.code" :on="pick === c.code" />
                    <span class="flex flex-grow flex-col">
                        <span class="text-st-base font-extrabold">{{ c.label }}</span>
                        <span class="text-st-xs font-semibold text-st-muted">{{ t('languages.add.ready-note') }}</span>
                    </span>
                    <StIcon v-if="pick === c.code" name="solar:check-circle-bold" :size="26" class="text-st-jade-600" />
                </button>
            </div>

            <template v-if="language.comingLater.length">
                <h2 class="mt-1.5 text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">{{ t('languages.add.coming-later') }}</h2>
                <ComingLaterRow />
            </template>
        </div>

        <!-- Step 2: the chat test or A1 (Q12). No hand-picked level. -->
        <div v-else-if="step === 2" role="radiogroup" :aria-label="title" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
                v-for="o in hows"
                :key="o.id"
                type="button"
                role="radio"
                :aria-checked="how === o.id"
                :data-testid="`how-${o.id}`"
                class="st-focus-ring flex min-h-[120px] cursor-pointer flex-col items-start gap-2.5 rounded-st-lg p-[18px] text-left font-st-sans text-st-strong"
                :class="how === o.id ? 'border-2 border-st-jade-500 bg-st-accent-tint' : 'border border-st-line bg-st-card'"
                @click="how = o.id"
            >
                <span class="flex w-full items-center justify-between">
                    <span class="flex h-11 w-11 items-center justify-center rounded-st-md" :class="how === o.id ? 'bg-st-card text-st-jade-700' : 'bg-st-ink-100 text-st-ink-700'">
                        <StIcon :name="o.icon" :size="24" />
                    </span>
                    <StIcon v-if="how === o.id" name="solar:check-circle-bold" :size="24" class="text-st-jade-600" />
                </span>
                <span class="text-st-md font-extrabold">{{ o.title }}</span>
                <span class="text-st-sm font-semibold leading-snug text-st-muted">{{ o.text }}</span>
            </button>
        </div>

        <!-- Step 3: done. A1 ends here, on the starter pack offer or Today. -->
        <section v-else class="flex flex-col gap-3.5 rounded-st-xl border border-st-jade-500 bg-st-accent-tint px-6 py-[26px]" data-testid="add-done">
            <span class="flex h-14 w-14 items-center justify-center rounded-full bg-st-card text-st-jade-600">
                <StIcon name="solar:check-circle-bold" :size="34" />
            </span>
            <h2 class="text-st-xl font-black text-st-strong">{{ t('languages.add.done-title', { language: pickName }) }}</h2>
            <p class="text-st-base font-semibold leading-normal text-st-body">{{ doneBody }}</p>
            <p v-if="keptJoined" class="text-st-sm font-bold text-st-sky-600">{{ t('languages.add.done-kept', { n: keptJoined, language: pickName }, keptJoined) }}</p>
        </section>

        <p v-if="error" role="alert" class="flex items-center gap-1.5 text-st-sm font-bold text-st-danger">
            <StIcon name="solar:danger-triangle-bold" :size="15" />
            {{ error }}
        </p>

        <div v-if="!atLimit" class="flex flex-wrap items-center gap-2.5">
            <template v-if="step === 1">
                <StButton color="primary" :disabled="!pick || busy || (isFirstRun && !language.ownLanguage && !ownPick)" data-testid="add-next" @click="toStep2">
                    {{ pick ? t('languages.add.next', { language: pickName }) : t('languages.add.step1-title') }}
                </StButton>
                <NuxtLink v-if="!isFirstRun" to="/settings/languages" class="text-st-sm font-bold text-st-link">{{ t('languages.add.cancel') }}</NuxtLink>
            </template>
            <template v-else-if="step === 2">
                <StButton variant="ghost" color="neutral" :disabled="busy" @click="step = 1">{{ t('languages.add.back') }}</StButton>
                <StButton v-if="how === 'test'" color="primary" icon="solar:chat-round-dots-bold-duotone" :disabled="busy" data-testid="start-test" @click="startTest">
                    {{ t('languages.add.start-test') }}
                </StButton>
                <StButton v-else color="primary" :disabled="busy" data-testid="start-a1" @click="startAtA1">{{ t('languages.add.start-a1') }}</StButton>
                <span class="text-st-sm font-semibold text-st-muted">{{ how === 'test' ? t('languages.add.how-test-note') : t('languages.add.how-a1-note') }}</span>
            </template>
            <template v-else>
                <StButton v-if="fromExtension" color="primary" data-testid="back-to-video" @click="backToVideo">{{ t('languages.add.back-to-video') }}</StButton>
                <StButton v-else-if="hasPack" color="primary" data-testid="open-pack" @click="router.push('/practice/starter-pack')">{{ t('languages.add.open-pack') }}</StButton>
                <StButton v-else color="primary" data-testid="go-today" @click="router.push('/board')">{{ t('languages.add.go-today') }}</StButton>
                <NuxtLink v-if="fromExtension || hasPack" to="/board" class="text-st-sm font-bold text-st-link">
                    {{ fromExtension ? t('languages.add.go-today-instead') : t('languages.add.go-today') }}
                </NuxtLink>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';
    import { StButton, StIcon } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import LanguageChip from '~/components/language/LanguageChip.vue';
    import PlanLimitCard from '~/components/language/PlanLimitCard.vue';
    import ComingLaterRow from '~/components/language/ComingLaterRow.vue';
    import OwnLanguagePicker from '~/components/language/OwnLanguagePicker.vue';
    import { useLanguageStore, trackLanguageEvent } from '~/stores/language';
    import { usePageCrumb } from '~/composables/usePageCrumb';
    import { formatLanguageDate } from '~/utils/languageDates';
    import { LanguageApiError } from '~/utils/languageApi';
    import { toCode } from '~/utils/languages';

    /**
     * Add a language (D-07): three steps in one screen — pick, how to start (chat test or A1),
     * done. `/settings/languages/add?language=de&from=extension` (Q7) preselects German and ends
     * on "Back to my video". `?first=1` is the first-run gate (D-20): no way out until a language
     * is added, and the learner's own language is asked for when the server does not know it.
     */
    definePageMeta({
        layout: 'default',
        // @ts-ignore
        middleware: ['auth', 'multilingual'],
    });

    const { t } = useI18n();
    const route = useRoute();
    const router = useRouter();
    const language = useLanguageStore();

    usePageCrumb(() => ({ section: t('nav.account'), label: t('languages.add.overline') }));

    const step = ref<1 | 2 | 3>(1);
    const pick = ref<string | null>(null);
    const how = ref<'test' | 'a1'>('test');
    const busy = ref(false);
    const error = ref('');
    const ownPick = ref<string | null>(null);
    const keptJoined = ref(0);

    const fromExtension = computed(() => route.query.from === 'extension');
    const isFirstRun = computed(() => language.needsLanguage || route.query.first === '1');

    /** Ready languages the learner does not have yet, plus ones removed in the last 30 days. */
    const choices = computed(() => {
        const removed = language.removedLanguages.map((r) => r.code);
        const codes = [...language.addable.map((c) => c.code), ...removed.filter((code) => !language.addable.some((c) => c.code === code))];
        return codes.map((code) => {
            const name = language.nameOf(code);
            const native = language.nativeNameOf(code);
            return { code, label: native && native !== name ? `${name} · ${native}` : name };
        });
    });

    // A removed language comes back without counting as a new one only if the server says so;
    // the limit card shows whenever the learner has no free place (Q14).
    const atLimit = computed(() => !isFirstRun.value && !language.canAdd && step.value !== 3);

    const pickName = computed(() => (pick.value ? language.nameOf(pick.value) : ''));
    const pickFeatures = computed(() => language.features(pick.value));
    const hasPack = computed(() => !!pick.value && pickFeatures.value.starterPack);
    const waitingForPick = computed(() => language.pending.find((p) => p.language === pick.value) ?? null);

    const hows = computed(() => {
        const list: { id: 'test' | 'a1'; icon: string; title: string; text: string }[] = [];
        if (pickFeatures.value.levelTest) {
            list.push({ id: 'test', icon: 'solar:chat-round-dots-bold-duotone', title: t('languages.add.how-test-title'), text: t('languages.add.how-test-text') });
        }
        list.push({
            id: 'a1',
            icon: 'solar:stars-bold-duotone',
            title: t('languages.add.how-a1-title'),
            text: hasPack.value ? t('languages.add.how-a1-text', { language: pickName.value }) : t('languages.add.how-a1-text-nopack'),
        });
        return list;
    });

    const overline = computed(() => {
        if (fromExtension.value && step.value === 3) return t('languages.add.overline-back');
        return isFirstRun.value ? t('languages.add.overline-first') : t('languages.add.overline');
    });
    const title = computed(() => {
        if (atLimit.value) return t('languages.add.upgrade-title');
        if (step.value === 1) return t('languages.add.step1-title');
        if (step.value === 2) return t('languages.add.step2-title', { language: pickName.value });
        return t('languages.add.done-title', { language: pickName.value });
    });
    const subtitle = computed(() => {
        if (atLimit.value || step.value === 3) return '';
        if (step.value === 2) return t('languages.add.step2-sub');
        return language.maxLanguages > 1 ? t('languages.add.step1-sub', { max: language.maxLanguages }) : t('languages.add.step1-sub-one');
    });
    const showSteps = computed(() => !atLimit.value && step.value < 3);

    const doneBody = computed(() => {
        if (fromExtension.value) return t('languages.add.done-body-ext', { language: pickName.value });
        return hasPack.value ? t('languages.add.done-body', { language: pickName.value }) : t('languages.add.done-body-nopack');
    });

    // Preselect from the URL (?language=de), or the language kept phrases wait for.
    watchEffect(() => {
        if (pick.value) return;
        const wanted = toCode(route.query.language?.toString()) ?? language.pending[0]?.language;
        if (wanted && choices.value.some((c) => c.code === wanted)) pick.value = wanted;
        else if (choices.value.length === 1) pick.value = choices.value[0].code;
    });

    // The chat test is not ready for every language; A1 is then the only choice.
    watch(pickFeatures, (f) => {
        if (!f.levelTest) how.value = 'a1';
    });

    async function saveOwnLanguage() {
        if (!ownPick.value || language.ownLanguage) return;
        await language.setOwnLanguage(ownPick.value);
    }

    async function toStep2() {
        if (!pick.value) return;
        error.value = '';
        try {
            busy.value = true;
            await saveOwnLanguage();
        } catch (e) {
            console.error('Saving the own language failed:', e);
        } finally {
            busy.value = false;
        }
        if (!pickFeatures.value.levelTest) how.value = 'a1';
        step.value = 2;
    }

    function startTest() {
        if (!pick.value) return;
        trackLanguageEvent(ANALYTICS_EVENTS.LEVEL_TEST_STARTED, { language: pick.value, from: isFirstRun.value ? 'first_run' : 'add' });
        const query: Record<string, string> = { language: pick.value };
        if (fromExtension.value) query.from = 'extension';
        if (isFirstRun.value) query.first = '1';
        router.push({ path: '/settings/languages/test', query });
    }

    function messageFor(e: unknown) {
        const name = pickName.value;
        if (e instanceof LanguageApiError) {
            if (e.code === 'not_available') return t('languages.add.error-not-available', { language: name });
            if (e.code === 'purging') return t('languages.add.error-purging', { language: name });
        }
        return t('languages.add.error', { language: name });
    }

    async function startAtA1() {
        if (!pick.value) return;
        busy.value = true;
        error.value = '';
        const keptBefore = waitingForPick.value?.count ?? 0;
        try {
            await language.addLanguage({ language: pick.value, startLevel: 'A1', startLevelSource: 'default' });
            keptJoined.value = keptBefore;
            if (isFirstRun.value) trackLanguageEvent(ANALYTICS_EVENTS.FIRST_RUN_DONE, { language: pick.value, start_level_source: 'default' });
            step.value = 3;
        } catch (e) {
            // The limit can be reached in another tab; the card then takes over step 1.
            if (e instanceof LanguageApiError && e.code === 'upgrade_needed') {
                await language.refreshState();
                step.value = 1;
            } else {
                error.value = messageFor(e);
            }
        } finally {
            busy.value = false;
        }
    }

    /** The extension opened this tab; closing it returns the learner to their video. */
    function backToVideo() {
        window.close();
        // A tab the script did not open cannot be closed; Today is the next best place.
        setTimeout(() => router.push('/board'), 150);
    }
</script>
