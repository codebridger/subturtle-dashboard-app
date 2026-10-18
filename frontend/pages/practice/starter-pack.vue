<template>
    <div ref="rootRef" class="flex max-w-[760px] flex-col gap-[22px]">
        <StPageHeader :overline="t('languages.starter.overline', { language: name })" :title="t('languages.starter.title')" :subtitle="subtitle">
            <template v-if="items.length && !done" #actions>
                <StButton variant="ghost" color="neutral" size="sm" :disabled="busy" data-testid="pack-skip" @click="skip">{{ t('languages.starter.skip') }}</StButton>
            </template>
        </StPageHeader>

        <div v-if="loading" class="flex flex-col gap-3">
            <StSkeleton class="h-[72px]" />
            <StSkeleton class="h-[180px]" />
        </div>

        <StCard v-else-if="error && !items.length" padding="lg"><p class="text-st-base font-semibold text-st-body">{{ error }}</p></StCard>

        <p v-else-if="!items.length" class="text-st-base font-semibold text-st-muted">{{ t('languages.starter.empty', { language: name }) }}</p>

        <template v-else>
            <!-- Progress: "12 of 150 chunks heard" and the pace. -->
            <section class="flex flex-col gap-2.5 rounded-st-lg border border-st-line bg-st-card px-[22px] py-5 shadow-st-sm">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <span class="text-st-md font-extrabold text-st-strong" data-testid="pack-progress">{{ t('languages.starter.progress', { heard: heardCount, total }) }}</span>
                    <span class="text-st-sm font-bold text-st-muted">{{ done ? t('languages.starter.pace-done') : t('languages.starter.pace') }}</span>
                </div>
                <StProgressBar :value="heardCount" :max="total" color="accent" size="md" class="w-full" />
            </section>

            <!-- Finish state. -->
            <section v-if="done" class="flex flex-col gap-3 rounded-st-xl border border-st-jade-500 bg-st-accent-tint px-6 py-[26px]" data-testid="pack-done">
                <span class="flex h-14 w-14 items-center justify-center rounded-full bg-st-card text-st-jade-600"><StIcon name="solar:check-circle-bold" :size="34" /></span>
                <h2 class="text-st-xl font-black text-st-strong">{{ t('languages.starter.done-title') }}</h2>
                <p class="text-st-base font-semibold leading-normal text-st-body">{{ t('languages.starter.done-body', { language: name, total }) }}</p>
            </section>

            <!-- Over today's intake: the rest is offered again tomorrow. -->
            <section v-else-if="!current" role="status" class="flex flex-col gap-2 rounded-st-xl bg-st-info-soft px-6 py-5" data-testid="pack-deferred">
                <h2 class="text-st-md font-extrabold text-st-strong">{{ t('languages.starter.deferred-title') }}</h2>
                <p class="text-st-base font-semibold leading-normal text-st-body">{{ t('languages.starter.deferred') }}</p>
            </section>

            <!-- One chunk at a time, with its sound. -->
            <section v-else class="flex flex-col gap-3 rounded-st-xl border border-st-line bg-st-card p-6 shadow-st-md" :data-testid="`pack-item-${current.id}`">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">
                        {{ t('languages.starter.next-label') }}<template v-if="currentGroup"> · <span data-testid="pack-group">{{ currentGroup }}</span></template>
                    </span>
                    <StBadge :color="current.band === 1 ? 'accent' : current.band === 2 ? 'info' : 'neutral'" data-testid="pack-band">{{ t(`languages.starter.band-${current.band}`) }}</StBadge>
                </div>
                <div class="flex items-center gap-3.5">
                    <LangText :code="language.activeLanguage" class="min-w-0 flex-grow font-st-display text-st-2xl font-black tracking-st-tight text-st-strong [overflow-wrap:anywhere]" data-testid="pack-text">
                        {{ current.text }}
                    </LangText>
                    <StIconButton icon="solar:play-circle-bold" variant="solid" color="primary" size="lg" rounded="full" class="shrink-0" :aria-label="t('languages.starter.play')" @click="play(current)" />
                </div>
                <!-- The own language sits right under the phrase, in its own direction and font. -->
                <LangText :code="current.translationLanguage || language.ownLanguage" class="self-start text-st-md font-semibold text-st-body" data-testid="pack-translation">
                    {{ current.translation }}
                </LangText>
                <span v-if="current.lemma && current.form" class="text-st-sm font-semibold text-st-muted">{{ current.lemma }} · {{ current.form }}</span>
            </section>

            <p v-if="error" role="alert" class="text-st-sm font-bold text-st-danger">{{ error }}</p>

            <div class="flex flex-wrap items-center gap-3">
                <template v-if="done || !current">
                    <StButton color="primary" data-testid="pack-go-today" @click="router.push('/board')">{{ t('languages.starter.go-today') }}</StButton>
                </template>
                <template v-else>
                    <StButton color="primary" :disabled="busy" data-testid="pack-next" @click="next">{{ t('languages.starter.next') }}</StButton>
                    <NuxtLink to="/board" class="text-st-sm font-bold text-st-link" data-testid="pack-later">{{ t('languages.starter.later') }}</NuxtLink>
                </template>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
    import { StBadge, StButton, StCard, StIcon, StIconButton, StProgressBar, StSkeleton } from 'subturtle-ui';
    import { toastSuccess } from 'pilotui/toast';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import LangText from '~/components/language/LangText.vue';
    import { useLanguageStore } from '~/stores/language';
    import { usePageCrumb } from '~/composables/usePageCrumb';
    import { languageApi } from '~/utils/languageApi';
    import type { StarterPackItem } from '~/types/language.type';

    /**
     * The starter pack (D-19, B-21): about 150 short chunks of the active language, shown one
     * at a time with sound, a frequency band chip and its group. "Next chunk" marks the chunk
     * heard, which adds it to that language's review (within the intake cap), and shows the
     * next one. It has a finish state, "Skip for now" (it stays on Today) and a full skip;
     * saving from videos is open all along (Q5).
     */
    definePageMeta({
        layout: 'default',
        // @ts-ignore
        middleware: ['auth', 'multilingual'],
    });

    const { t } = useI18n();
    const router = useRouter();
    const language = useLanguageStore();

    const name = computed(() => language.nameOf(language.activeLanguage));
    usePageCrumb(() => ({ section: t('practice.title'), label: t('languages.starter.title'), badge: name.value }));

    const rootRef = ref<HTMLElement | null>(null);
    const loading = ref(true);
    const busy = ref(false);
    const error = ref('');
    const items = ref<StarterPackItem[]>([]);
    const packTotal = ref(0);
    const heard = ref(new Set<string>());
    /** Over today's intake (`deferred`): offered again tomorrow, so skipped for this visit. */
    const deferred = ref(new Set<string>());
    const groupNames = ref<Record<string, string>>({});
    const done = ref(false);

    const total = computed(() => packTotal.value || items.value.length);
    const heardCount = computed(() => Math.min(heard.value.size, total.value));

    /** The first chunk not heard yet and not held for tomorrow. */
    const current = computed(() => items.value.find((i) => !heard.value.has(i.id) && !deferred.value.has(i.id)) ?? null);
    const currentGroup = computed(() => (current.value ? groupNames.value[current.value.group] || groupLabel(current.value.group) : ''));

    const subtitle = computed(() => (done.value ? t('languages.starter.done-subtitle', { language: name.value }) : t('languages.starter.subtitle', { language: name.value })));

    /** "small-talk" → "Small talk". The pack's own group names are English ids. */
    function groupLabel(id: string) {
        const text = (id || '').replace(/[-_]+/g, ' ').trim();
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    let audio: HTMLAudioElement | null = null;
    const speechCache = new Map<string, string>();

    /**
     * The recorded file when the pack has one (B-22); otherwise the server's speech for the
     * language — `language` only, never the register's HD `ttsVoice`, which that function
     * refuses — and the browser's own voice as the last resort.
     */
    async function play(item: StarterPackItem) {
        audio?.pause();
        try {
            let src = item.audioUrl || speechCache.get(item.id);
            if (!src) {
                src = await languageApi.speak(item.text, language.activeLanguage);
                if (src) speechCache.set(item.id, src);
            }
            if (!src) throw new Error('no audio');
            audio = new Audio(src);
            await audio.play();
        } catch {
            speak(item.text);
        }
    }

    function speak(text: string) {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = language.activeLanguage;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        } catch {
            // No voice in this browser: the text is still on screen.
        }
    }

    async function load() {
        loading.value = true;
        error.value = '';
        try {
            const pack = await languageApi.getStarterPack(language.activeLanguage);
            items.value = pack.items ?? [];
            packTotal.value = pack.total ?? 0;
            heard.value = new Set(pack.heard ?? []);
            deferred.value = new Set();
            groupNames.value = Object.fromEntries((pack.groups ?? []).map((g) => [g.id, g.name]));
            done.value = pack.state === 'done' || (items.value.length > 0 && items.value.every((i) => heard.value.has(i.id)));
        } catch (e) {
            console.error('Starter pack failed to load:', e);
            error.value = t('languages.starter.error');
        } finally {
            loading.value = false;
        }
    }

    /** Chunks marked on this visit: the language state (and Today's card) is refreshed on leaving. */
    let markedThisVisit = false;
    onBeforeUnmount(() => {
        // "12 of 150 heard · Continue" on Today needs the new count; the state is otherwise
        // only refreshed when the pack is done.
        if (markedThisVisit) language.refreshState();
    });

    /** "Next chunk": mark the one on screen heard, then show and play the next one. */
    async function next() {
        const item = current.value;
        if (!item || busy.value) return;
        busy.value = true;
        error.value = '';
        markedThisVisit = true;
        try {
            const res = await languageApi.completeStarterPackItems(language.activeLanguage, [item.id]);
            if (res?.deferred?.includes(item.id)) {
                // Today's intake is full: every later chunk would wait too, so stop for today.
                deferred.value = new Set([...deferred.value, ...items.value.filter((i) => !heard.value.has(i.id)).map((i) => i.id)]);
                return;
            }
            heard.value = new Set([...heard.value, item.id]);
            if (typeof res?.total === 'number' && res.total > 0) packTotal.value = res.total;
            if (res?.done || !items.value.some((i) => !heard.value.has(i.id))) {
                done.value = true;
                language.refreshState();
                scrollToTop();
                return;
            }
            // The click is a user gesture, so the browser lets the next chunk's sound play.
            if (current.value) play(current.value);
        } catch (e) {
            console.error('Marking a starter pack chunk failed:', e);
            error.value = t('languages.starter.mark-error');
        } finally {
            busy.value = false;
        }
    }

    function scrollToTop() {
        nextTick(() => rootRef.value?.closest('main')?.scrollTo?.({ top: 0 }));
    }

    /** The full skip: the pack leaves Today (B-21). "Skip for now" is only a link to Today. */
    async function skip() {
        if (!window.confirm(t('languages.starter.skip-confirm'))) return;
        busy.value = true;
        try {
            language.setState(await languageApi.skipStarterPack(language.activeLanguage));
            toastSuccess(t('languages.starter.skipped'), { position: 'top-end' });
            router.push('/board');
        } catch (e) {
            console.error('Skipping the starter pack failed:', e);
            error.value = t('languages.starter.error');
        } finally {
            busy.value = false;
        }
    }

    onMounted(load);
    onUnmounted(() => audio?.pause());
    // A language switch while here shows that language's pack.
    watch(() => language.activeLanguage, load);
</script>
