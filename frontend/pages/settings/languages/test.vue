<template>
    <div ref="rootRef" class="flex max-w-[760px] flex-col gap-[18px]">
        <StPageHeader
            :overline="t('languages.test.overline', { language: langName })"
            :title="result ? t('languages.test.result-title') : t('languages.test.title')"
            :subtitle="result ? '' : t('languages.test.subtitle')"
        />

        <!-- The chat (L11 on the web): six short questions, easy first, own-language help. -->
        <template v-if="!result">
            <div class="flex items-center gap-3">
                <StProgressBar :value="index" :max="total" color="accent" size="sm" class="flex-grow" />
                <span class="text-st-xs font-extrabold text-st-muted" data-testid="test-progress">{{ t('languages.test.progress', { index, total }) }}</span>
            </div>

            <section class="flex min-h-[340px] flex-col justify-end gap-3 rounded-st-xl bg-st-sunken p-5" aria-live="polite">
                <div class="self-center rounded-st-pill bg-st-card px-3 py-1.5 text-center text-st-xs font-bold text-st-muted">
                    {{ ownName ? t('languages.test.hint-own', { language: langName, own: ownName }) : t('languages.test.hint', { language: langName }) }}
                </div>

                <template v-for="(m, i) in log" :key="i">
                    <div v-if="m.ai" class="flex max-w-[78%] flex-col gap-1 self-start rounded-[var(--radius-lg)_var(--radius-lg)_var(--radius-lg)_var(--radius-xs)] border border-st-line bg-st-card px-4 py-3">
                        <LangText :code="lang" class="text-st-base font-bold text-st-strong">{{ m.text }}</LangText>
                        <LangText v-if="m.help" :code="runLanguage(m.help, language.ownLanguage)" class="text-st-sm text-st-muted">{{ m.help }}</LangText>
                    </div>
                    <div v-else class="max-w-[78%] self-end rounded-[var(--radius-lg)_var(--radius-lg)_var(--radius-xs)_var(--radius-lg)] bg-st-primary-soft px-4 py-3 font-semibold text-st-strong">
                        <LangText :code="lang">{{ m.text }}</LangText>
                    </div>
                </template>

                <div v-if="thinking" class="self-start text-st-sm font-bold text-st-muted">{{ t('languages.test.loading') }}</div>
                <p v-if="failed" role="alert" class="rounded-st-md bg-st-card px-4 py-3 text-st-sm font-bold text-st-body">{{ failed }}</p>
            </section>

            <form class="flex items-center gap-2.5" @submit.prevent="send">
                <input
                    v-model="answer"
                    :lang="lang"
                    dir="auto"
                    :disabled="!testId || thinking"
                    :placeholder="t('languages.test.placeholder', { language: langName })"
                    data-testid="test-answer"
                    class="st-focus-ring h-11 min-w-0 flex-grow rounded-st-pill border border-st-line bg-st-card px-4 text-st-base font-semibold text-st-strong"
                />
                <StButton type="submit" color="primary" icon="solar:plain-2-bold" :disabled="!answer.trim() || !testId || thinking" data-testid="test-send">
                    {{ t('languages.test.send') }}
                </StButton>
            </form>

            <div class="flex flex-wrap items-center gap-4">
                <button type="button" class="text-st-sm font-bold text-st-link" :disabled="busy" data-testid="test-stop" @click="startAtA1">{{ t('languages.test.stop') }}</button>
                <NuxtLink v-if="!isManage" :to="backToSteps" class="text-st-sm font-bold text-st-muted">{{ t('languages.test.back') }}</NuxtLink>
            </div>
        </template>

        <!-- The result: a start point, never "your level" (Q12). -->
        <template v-else>
            <section class="flex items-start gap-5 rounded-st-xl border border-st-line bg-st-card px-6 py-[26px] shadow-st-sm" data-testid="test-result">
                <span class="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-st-accent-soft text-st-xl font-black text-st-jade-700">{{ result.startLevel }}</span>
                <div class="flex flex-col gap-2">
                    <h2 class="text-st-xl font-black text-st-strong">{{ t('languages.test.starting-at', { level: result.startLevel }) }}</h2>
                    <p class="text-st-base font-semibold leading-normal text-st-body">{{ result.reason }}</p>
                    <p class="text-st-sm font-semibold leading-normal text-st-muted">{{ t('languages.test.result-note') }}</p>
                </div>
            </section>
            <p v-if="failed" role="alert" class="text-st-sm font-bold text-st-danger">{{ failed }}</p>
            <div class="flex flex-wrap items-center gap-2.5">
                <StButton color="primary" :disabled="busy" data-testid="test-accept" @click="accept">
                    {{ isManage ? t('languages.add.manage') : t('languages.test.go-today', { language: langName }) }}
                </StButton>
                <StButton variant="soft" color="neutral" :disabled="busy" data-testid="test-retake" @click="retake">{{ t('languages.test.retake') }}</StButton>
                <button v-if="!isManage" type="button" class="text-st-sm font-bold text-st-link" :disabled="busy" @click="startAtA1">{{ t('languages.test.a1-instead') }}</button>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
    import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';
    import { StButton, StProgressBar } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import LangText from '~/components/language/LangText.vue';
    import { useLanguageStore, trackLanguageEvent } from '~/stores/language';
    import { usePageCrumb } from '~/composables/usePageCrumb';
    import { languageApi } from '~/utils/languageApi';
    import { runLanguage, toCode } from '~/utils/languages';
    import type { CefrStart } from '~/types/language.type';

    /**
     * The chat test (D-24, B-31): `/settings/languages/test?language=de`. A short text chat with
     * the Coach that sets the start level. Every step has a way out: "Stop and start at A1",
     * "Back to the steps", and on the result Today, Retake, or A1. A failure never blocks
     * adding the language: the learner starts at A1 (Q12).
     *
     * `?manage=1` is the retake from the Languages page: the language is already added, so the
     * result only updates its start level and returns to Languages.
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

    const lang = computed(() => toCode(route.query.language?.toString()) ?? '');
    const langName = computed(() => language.nameOf(lang.value));
    const ownName = computed(() => (language.ownLanguage ? language.nameOf(language.ownLanguage) : ''));
    const isManage = computed(() => route.query.manage === '1');
    const isFirstRun = computed(() => route.query.first === '1');
    const backToSteps = computed(() => ({ path: '/settings/languages/add', query: { ...route.query, manage: undefined, step: '2' } }));

    usePageCrumb(() => ({ section: t('nav.account'), label: t('languages.test.title'), badge: langName.value || undefined }));

    const testId = ref<string | null>(null);
    const index = ref(1);
    const total = ref(6);
    const log = ref<{ ai: boolean; text: string; help?: string }[]>([]);
    const answer = ref('');
    const thinking = ref(false);
    const busy = ref(false);
    const failed = ref('');
    const result = ref<{ startLevel: CefrStart; reason: string } | null>(null);
    const rootRef = ref<HTMLElement | null>(null);

    /**
     * The chat is taller than the result, so the shell's scroll area is still scrolled down
     * when the result replaces it, and "Your start point" sat under the top bar. Start the
     * result (and a retake) from the top.
     */
    watch(result, (value, before) => {
        if (!!value === !!before) return;
        nextTick(() => {
            const scroller = rootRef.value?.closest('main');
            if (scroller) scroller.scrollTop = 0;
            else window.scrollTo(0, 0);
        });
    });

    async function begin() {
        testId.value = null;
        result.value = null;
        failed.value = '';
        log.value = [];
        index.value = 1;
        if (!lang.value || !language.features(lang.value).levelTest) {
            failed.value = t('languages.test.unavailable', { language: langName.value });
            return;
        }
        thinking.value = true;
        try {
            const start = await languageApi.startLevelTest(lang.value);
            testId.value = start.testId;
            index.value = start.index ?? 1;
            total.value = start.total ?? 6;
            log.value.push({ ai: true, text: start.turn.ai, help: start.turn.help });
        } catch (error) {
            console.error('Level test failed to start:', error);
            failed.value = t('languages.test.failed');
        } finally {
            thinking.value = false;
        }
    }

    async function send() {
        const text = answer.value.trim();
        if (!text || !testId.value || thinking.value) return;
        log.value.push({ ai: false, text });
        answer.value = '';
        thinking.value = true;
        try {
            const res = await languageApi.answerLevelTest(testId.value, text);
            index.value = res.index ?? index.value + 1;
            total.value = res.total ?? total.value;
            if (res.done) {
                // A finished test with no result is a failure: start at A1 (B-31).
                result.value = res.result ?? { startLevel: 'A1', reason: t('languages.test.failed') };
            } else if (res.turn) {
                log.value.push({ ai: true, text: res.turn.ai, help: res.turn.help });
            }
        } catch (error) {
            console.error('Level test answer failed:', error);
            failed.value = t('languages.test.failed');
        } finally {
            thinking.value = false;
        }
    }

    /** Make sure the language is in the learner's list with this start level. */
    async function ensureAdded(startLevel: CefrStart, startLevelSource: 'test' | 'default') {
        if (language.summaryFor(lang.value)?.status === 'active') {
            if (language.activeLanguage !== lang.value) await language.switchLanguage(lang.value);
            return;
        }
        await language.addLanguage({ language: lang.value, startLevel, startLevelSource });
    }

    async function accept() {
        if (!result.value) return;
        busy.value = true;
        failed.value = '';
        try {
            let applied: boolean | undefined;
            let level = result.value.startLevel;
            if (testId.value) {
                const res = await languageApi.finishLevelTest(testId.value, true).catch((e) => {
                    console.error('finish-level-test failed:', e);
                    return null;
                });
                if (res?.state) language.setState(res.state);
                applied = res?.applied;
                if (res?.result?.startLevel) level = res.result.startLevel;
            }
            if (isManage.value) {
                await language.refreshState();
                router.push('/settings/languages');
                return;
            }
            // `applied: false` means the language is not added yet; add it with the test's level.
            if (applied !== true || language.summaryFor(lang.value)?.status !== 'active') await ensureAdded(level, 'test');
            else if (language.activeLanguage !== lang.value) await language.switchLanguage(lang.value);
            if (isFirstRun.value) trackLanguageEvent(ANALYTICS_EVENTS.FIRST_RUN_DONE, { language: lang.value, start_level_source: 'test' });
            router.push('/board');
        } catch (error: any) {
            // Starter's place is held by a removed language (B-33): the steps offer the upgrade
            // and the restore.
            if (error?.code === 'upgrade_needed') {
                router.push({ path: '/settings/languages/add', query: isFirstRun.value ? { first: '1' } : {} });
                return;
            }
            console.error('Accepting the level test failed:', error);
            failed.value = t('languages.add.error', { language: langName.value });
        } finally {
            busy.value = false;
        }
    }

    function retake() {
        if (testId.value) languageApi.finishLevelTest(testId.value, false).catch(() => {});
        begin();
    }

    /** "Stop and start at A1" and "Start at A1 instead": the starter pack when there is one. */
    async function startAtA1() {
        busy.value = true;
        failed.value = '';
        try {
            if (testId.value) await languageApi.finishLevelTest(testId.value, false).catch(() => null);
            if (isManage.value) {
                router.push('/settings/languages');
                return;
            }
            await ensureAdded('A1', 'default');
            if (isFirstRun.value) trackLanguageEvent(ANALYTICS_EVENTS.FIRST_RUN_DONE, { language: lang.value, start_level_source: 'default' });
            router.push(language.features(lang.value).starterPack ? '/practice/starter-pack' : '/board');
        } catch (error: any) {
            if (error?.code === 'upgrade_needed') router.push({ path: '/settings/languages/add', query: isFirstRun.value ? { first: '1' } : {} });
            else failed.value = t('languages.add.error', { language: langName.value });
        } finally {
            busy.value = false;
        }
    }

    onMounted(begin);
</script>
