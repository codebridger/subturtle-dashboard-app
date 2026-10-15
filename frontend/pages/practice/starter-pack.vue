<template>
    <div class="flex max-w-[900px] flex-col gap-5">
        <StPageHeader :overline="t('languages.starter.overline', { language: name })" :title="t('languages.starter.title')" :subtitle="t('languages.starter.subtitle', { language: name })">
            <template v-if="items.length && !done" #actions>
                <StButton variant="ghost" color="neutral" :disabled="busy" data-testid="pack-skip" @click="skip">{{ t('languages.starter.skip') }}</StButton>
            </template>
        </StPageHeader>

        <div v-if="loading" class="flex flex-col gap-3">
            <StSkeleton v-for="n in 4" :key="n" class="h-[64px]" />
        </div>

        <StCard v-else-if="error" padding="lg"><p class="text-st-base font-semibold text-st-body">{{ error }}</p></StCard>

        <!-- Finish state. -->
        <section v-else-if="done" class="flex flex-col gap-3.5 rounded-st-xl border border-st-jade-500 bg-st-accent-tint px-6 py-[26px]" data-testid="pack-done">
            <span class="flex h-14 w-14 items-center justify-center rounded-full bg-st-card text-st-jade-600"><StIcon name="solar:check-circle-bold" :size="34" /></span>
            <h2 class="text-st-xl font-black text-st-strong">{{ t('languages.starter.done-title') }}</h2>
            <p class="text-st-base font-semibold leading-normal text-st-body">{{ t('languages.starter.done-body', { language: name }) }}</p>
            <div><StButton color="primary" @click="router.push('/board')">{{ t('languages.starter.go-today') }}</StButton></div>
        </section>

        <template v-else>
            <div class="flex items-center gap-3">
                <StProgressBar :value="heard.size" :max="items.length" color="accent" size="sm" class="flex-grow" />
                <span class="text-st-xs font-extrabold text-st-muted" data-testid="pack-progress">{{ t('languages.starter.progress', { heard: heard.size, total: items.length }) }}</span>
            </div>

            <section v-for="group in groups" :key="group.id" class="flex flex-col gap-2">
                <h2 class="text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">{{ group.label }}</h2>
                <div
                    v-for="item in group.items"
                    :key="item.id"
                    class="flex min-h-[64px] items-center gap-3 rounded-st-lg border border-st-line bg-st-card px-4 py-2.5"
                    :data-testid="`pack-item-${item.id}`"
                >
                    <StIconButton icon="solar:volume-loud-bold-duotone" variant="soft" color="neutral" :aria-label="t('languages.starter.play')" @click="play(item)" />
                    <span class="flex min-w-0 flex-grow flex-col">
                        <LangText :code="language.activeLanguage" class="text-st-base font-extrabold text-st-strong">{{ item.text }}</LangText>
                        <LangText :code="language.ownLanguage" class="text-st-sm font-semibold text-st-muted">{{ item.translation }}</LangText>
                    </span>
                    <StBadge :color="item.band === 1 ? 'accent' : item.band === 2 ? 'info' : 'neutral'">{{ t(`languages.starter.band-${item.band}`) }}</StBadge>
                    <StButton
                        size="sm"
                        :variant="heard.has(item.id) ? 'soft' : 'outline'"
                        :color="heard.has(item.id) ? 'accent' : 'neutral'"
                        :icon="heard.has(item.id) ? 'solar:check-circle-bold' : undefined"
                        :disabled="heard.has(item.id) || busy"
                        @click="markHeard(item)"
                    >
                        {{ heard.has(item.id) ? t('languages.starter.heard') : t('languages.starter.mark-heard') }}
                    </StButton>
                </div>
            </section>

            <p v-if="!items.length" class="text-st-base font-semibold text-st-muted">{{ t('languages.starter.empty', { language: name }) }}</p>
        </template>
    </div>
</template>

<script setup lang="ts">
    import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';
    import { StBadge, StButton, StCard, StIcon, StIconButton, StProgressBar, StSkeleton } from 'subturtle-ui';
    import { toastSuccess } from 'pilotui/toast';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import LangText from '~/components/language/LangText.vue';
    import { useLanguageStore, trackLanguageEvent } from '~/stores/language';
    import { usePageCrumb } from '~/composables/usePageCrumb';
    import { languageApi } from '~/utils/languageApi';
    import type { StarterPackItem } from '~/types/language.type';

    /**
     * The starter pack (D-19, B-21): about 150 short chunks of the active language with sound,
     * a frequency band and groups. Marking a chunk heard adds it to that language's review
     * (within the intake cap). It has a finish state and a skip; saving from videos is open
     * all along (Q5).
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

    const loading = ref(true);
    const busy = ref(false);
    const error = ref('');
    const items = ref<StarterPackItem[]>([]);
    const heard = ref(new Set<string>());
    const done = ref(false);

    const groups = computed(() => {
        const map = new Map<string, StarterPackItem[]>();
        for (const item of items.value) {
            if (!map.has(item.group)) map.set(item.group, []);
            map.get(item.group)!.push(item);
        }
        return [...map.entries()].map(([id, list]) => ({ id, label: groupLabel(id), items: list }));
    });

    /** "small-talk" → "Small talk". The pack's own group names are English ids. */
    function groupLabel(id: string) {
        const text = id.replace(/[-_]+/g, ' ').trim();
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    let audio: HTMLAudioElement | null = null;
    function play(item: StarterPackItem) {
        audio?.pause();
        if (item.audioUrl) {
            audio = new Audio(item.audioUrl);
            audio.play().catch(() => speak(item.text));
        } else {
            speak(item.text);
        }
    }

    /** No recorded audio yet (B-22 is separate): the browser voice for the language is the fallback. */
    function speak(text: string) {
        if (!('speechSynthesis' in window)) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language.capsFor()?.ttsVoice?.split('-').slice(0, 2).join('-') || language.activeLanguage;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }

    async function load() {
        loading.value = true;
        error.value = '';
        try {
            const pack = await languageApi.getStarterPack(language.activeLanguage);
            items.value = pack.items ?? [];
            heard.value = new Set(pack.heard ?? []);
            done.value = items.value.length > 0 && heard.value.size >= items.value.length;
        } catch (e) {
            console.error('Starter pack failed to load:', e);
            error.value = t('languages.starter.error');
        } finally {
            loading.value = false;
        }
    }

    async function markHeard(item: StarterPackItem) {
        heard.value = new Set([...heard.value, item.id]);
        try {
            const res = await languageApi.completeStarterPackItems(language.activeLanguage, [item.id]);
            if (res?.done) {
                done.value = true;
                trackLanguageEvent(ANALYTICS_EVENTS.STARTER_PACK_DONE, { language: language.activeLanguage });
                language.refreshState();
            }
        } catch (e) {
            console.error('Marking a starter pack item failed:', e);
            const next = new Set(heard.value);
            next.delete(item.id);
            heard.value = next;
        }
    }

    async function skip() {
        if (!window.confirm(t('languages.starter.skip-confirm'))) return;
        busy.value = true;
        try {
            language.setState(await languageApi.skipStarterPack(language.activeLanguage));
            trackLanguageEvent(ANALYTICS_EVENTS.STARTER_PACK_SKIPPED, { language: language.activeLanguage, heard: heard.value.size });
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
