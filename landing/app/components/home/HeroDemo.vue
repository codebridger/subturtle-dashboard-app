<template>
    <!-- The extension's two moments, as a small live demo: hovering a subtitle line, and selecting text on
         any web page. It plays both once when it scrolls into view (or shows the end state at once under
         reduced motion), then the visitor drives it: switch the place, hover or tap the phrase, change the
         language, save. Everything is real text. -->
    <figure ref="root" class="demo" aria-label="Demo: Subturtle on a video and on a web page">
        <div class="modes" role="group" aria-label="Where Subturtle works">
            <button type="button" class="mode" :aria-pressed="mode === 'video'" @click="pickMode('video')">
                <StIcon name="solar:play-bold" :size="16" />
                On a video
            </button>
            <button type="button" class="mode" :aria-pressed="mode === 'page'" @click="pickMode('page')">
                <StIcon name="solar:global-bold-duotone" :size="18" />
                On any web page
            </button>
        </div>

        <div ref="screen" class="screen" :class="`screen--${mode}`">
            <!-- A video: an invented show at dusk, with a generic player bar. Never a real player's UI. -->
            <template v-if="mode === 'video'">
                <div class="scene" aria-hidden="true">
                    <span class="sun"></span>
                    <span class="city city--back">
                        <i v-for="(b, n) in CITY_BACK" :key="n" :style="{ height: b[0], width: b[1] }"></i>
                    </span>
                    <span class="city city--front">
                        <i v-for="(b, n) in CITY_FRONT" :key="n" :style="{ height: b[0], width: b[1] }"></i>
                    </span>
                </div>
                <p class="source">{{ VIDEO_STORY.source }} <span class="source__note">· an invented show</span></p>
                <p class="caption" lang="en">
                    <template v-for="(group, g) in groups" :key="g"
                        ><span :class="{ chunk: group.chunk }"
                            ><template v-for="(i, k) in group.words" :key="i"
                                ><span
                                    :ref="(el) => (wordEls[i] = el as HTMLElement)"
                                    class="word"
                                    :class="wordClass(i, group.chunk)"
                                    @mouseenter="group.chunk && hover('pointer')"
                                    @click="group.chunk && hover('tap')"
                                    >{{ story.words[i] }}</span
                                ><span v-if="k < group.words.length - 1" class="gap" :class="{ 'gap--lit': gapLit(i) }">{{ ' ' }}</span></template
                            ></span
                        >{{ g < groups.length - 1 ? ' ' : '' }}</template
                    >
                </p>
                <div class="player" aria-hidden="true">
                    <span class="player__play"></span>
                    <span class="player__track"><span class="player__done"></span></span>
                    <span class="player__time mono">12:04 / 24:30</span>
                </div>
            </template>

            <!-- A web page: an invented newsletter article in a generic browser window. -->
            <template v-else>
                <div class="browser" aria-hidden="true">
                    <span class="browser__dots"><i></i><i></i><i></i></span>
                    <span class="browser__url"><StIcon name="solar:global-bold-duotone" :size="14" /> Any web page</span>
                </div>
                <div class="article">
                    <p class="article__mast">{{ PAGE_STORY.source }}</p>
                    <p class="article__title">What we learned from a one-week launch</p>
                    <p ref="pageText" class="article__text" lang="en">
                        <template v-for="(group, g) in groups" :key="g"
                            ><span :class="{ chunk: group.chunk }"
                                ><template v-for="(i, k) in group.words" :key="i"
                                    ><span
                                        :ref="(el) => (wordEls[i] = el as HTMLElement)"
                                        class="word"
                                        :class="wordClass(i, group.chunk)"
                                        @mouseenter="group.chunk && hover('pointer')"
                                        @click="group.chunk && hover('tap')"
                                        >{{ story.words[i] }}</span
                                    ><span v-if="k < group.words.length - 1" class="gap" :class="{ 'gap--lit': gapLit(i) }">{{ ' ' }}</span></template
                                ></span
                            >{{ g < groups.length - 1 ? ' ' : '' }}</template
                        >
                    </p>
                    <span class="article__line" aria-hidden="true"></span>
                    <span class="article__line article__line--short" aria-hidden="true"></span>
                </div>
            </template>

            <div
                ref="cardEl"
                class="card"
                :class="[`card--${mode}`, { 'card--on': stage >= 4 }]"
                :style="mode === 'page' ? { top: `${cardTop}px` } : undefined"
                :aria-hidden="stage < 4"
            >
                <div class="card__head">
                    <p class="card__phrase" lang="en">{{ story.phrase }}</p>
                    <div class="card__tags">
                        <StBadge color="primary">idiom</StBadge>
                        <StBadge>informal</StBadge>
                    </div>
                </div>
                <p class="card__label">In {{ shown.name }}</p>
                <p :key="mode + shown.code + flips" class="card__meaning" :lang="shown.code" :dir="shown.dir" aria-hidden="true">
                    {{ story.byLanguage[shown.code]?.meaning }}
                </p>
                <p class="card__gloss">{{ story.gloss }}</p>
                <p class="card__say">
                    <span :lang="shown.code" :dir="shown.dir">{{ story.byLanguage[shown.code]?.say }}</span>
                    <span class="card__say-label">said in your alphabet</span>
                </p>
                <div class="card__save">
                    <StButton
                        size="sm"
                        :variant="saved ? 'soft' : 'solid'"
                        :color="saved ? 'accent' : 'primary'"
                        :icon="saved ? 'solar:check-circle-bold' : 'solar:bookmark-bold-duotone'"
                        @click="save"
                    >
                        {{ saved ? story.savedLabel : 'Save' }}
                    </StButton>
                </div>
            </div>

            <span
                class="cursor"
                :class="[`cursor--${mode}`, { 'cursor--on': cursor.on }]"
                :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }"
                aria-hidden="true"
            ></span>
        </div>

        <figcaption class="langs">
            <span id="demo-langs" class="langs__label">Your language</span>
            <div class="langs__chips" role="group" aria-labelledby="demo-langs">
                <button
                    v-for="lang in DEMO_LANGUAGES"
                    :key="lang.code"
                    type="button"
                    class="chip"
                    :class="{ 'chip--on': lang.code === chosen.code }"
                    :aria-pressed="lang.code === chosen.code"
                    :lang="lang.code"
                    @click="choose(lang)"
                >
                    {{ lang.native }}
                </button>
            </div>
            <span class="sr-only">Pick a language to see the meaning and the pronunciation change.</span>
            <span class="sr-only" aria-live="polite">{{ announcement }}</span>
        </figcaption>
    </figure>
</template>

<script setup lang="ts">
    import { StBadge, StButton, StIcon } from 'subturtle-ui';
    import { DEFAULT_LANGUAGE, DEMO_LANGUAGES, PAGE_STORY, VIDEO_STORY, type DemoLanguage } from '~/data/demo';

    type Mode = 'video' | 'page';

    /** The skyline at dusk: [height, width] per building, back row then front row (with lit windows). */
    const CITY_BACK = [
        ['58%', '13%'],
        ['84%', '9%'],
        ['50%', '15%'],
        ['72%', '10%'],
        ['62%', '14%'],
        ['88%', '11%'],
    ];
    const CITY_FRONT = [
        ['70%', '20%'],
        ['96%', '15%'],
        ['60%', '22%'],
        ['84%', '18%'],
    ];

    /**
     * stage 0 idle · 1–3 the phrase lights up word by word · 4 the card is open. On the video it grows
     * from "fence" back to "on" (the extension's "+" handles); on the page it is a drag selection, left
     * to right. The prerendered HTML is the video at stage 0, so the line reads without JavaScript.
     */
    const mode = ref<Mode>('video');
    const stage = ref(0);
    const chosen = ref<DemoLanguage>(DEFAULT_LANGUAGE);
    const shown = ref<DemoLanguage>(DEFAULT_LANGUAGE);
    const flips = ref(0);
    const saved = ref(false);
    const cardTop = ref(0);
    const cursor = reactive({ x: 0, y: 0, on: false });

    const root = ref<HTMLElement>();
    const screen = ref<HTMLElement>();
    const cardEl = ref<HTMLElement>();
    const pageText = ref<HTMLElement>();
    const wordEls: HTMLElement[] = [];

    const story = computed(() => (mode.value === 'video' ? VIDEO_STORY : PAGE_STORY));
    const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k);
    // The phrase is its own no-wrap group, so its highlight never splits across two lines.
    const groups = computed(() => {
        const [s, e] = story.value.chunk;
        return [
            { chunk: false, words: range(0, s - 1) },
            { chunk: true, words: range(s, e) },
            { chunk: false, words: range(e + 1, story.value.words.length - 1) },
        ].filter((g) => g.words.length);
    });
    const litWords = computed(() => {
        const [s, e] = story.value.chunk;
        const size = e - s + 1;
        const n = stage.value >= 3 ? size : Math.min(stage.value, size);
        if (n <= 0) return [];
        return mode.value === 'video' ? range(e - n + 1, e) : range(s, s + n - 1);
    });
    function wordClass(i: number, chunk: boolean) {
        const lit = litWords.value;
        return {
            'word--chunk': chunk,
            'word--lit': lit.includes(i),
            'word--first': lit.length > 0 && i === Math.min(...lit),
            'word--last': lit.length > 0 && i === Math.max(...lit),
        };
    }
    /** The space between two lit words is lit too, so the marker is one continuous block, not a row of chips. */
    const gapLit = (i: number) => litWords.value.includes(i) && litWords.value.includes(i + 1);
    // The meaning flips through scripts visually; assistive tech hears only where it lands.
    const announcement = computed(() =>
        stage.value >= 4 ? `${story.value.phrase}, in ${chosen.value.name}: ${story.value.byLanguage[chosen.value.code]?.meaning}` : '',
    );

    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const clearTimers = () => timers.splice(0).forEach((t) => window.clearTimeout(t));

    function pointAt(i: number, edge: 'mid' | 'left' | 'right' = 'mid') {
        const el = wordEls[i];
        const box = screen.value;
        if (!el || !box) return;
        const a = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        const x = edge === 'left' ? 0.05 : edge === 'right' ? 0.98 : 0.55;
        cursor.x = a.left - b.left + a.width * x;
        cursor.y = a.top - b.top + a.height * 0.6;
    }

    /** On the page the card opens under the paragraph, like the extension's popup, kept inside the window. */
    function placeCard() {
        if (mode.value !== 'page') return;
        const text = pageText.value;
        const box = screen.value;
        if (!text || !box) return;
        const below = text.getBoundingClientRect().bottom - box.getBoundingClientRect().top + 12;
        const height = cardEl.value?.offsetHeight || 220;
        cardTop.value = Math.max(16, Math.min(below, box.clientHeight - height - 14));
    }

    /** The meaning flips through a few scripts before it lands on the chosen language, like the film. */
    function flipTo(target: DemoLanguage, steps: number) {
        const others = DEMO_LANGUAGES.filter((l) => l.code !== target.code);
        for (let s = 0; s < steps; s++) {
            later(s * 210, () => {
                shown.value = others[(s * 3) % others.length]!;
                flips.value++;
            });
        }
        later(steps * 210, () => {
            shown.value = target;
            flips.value++;
        });
    }

    async function enter(next: Mode) {
        clearTimers();
        mode.value = next;
        stage.value = 0;
        saved.value = false;
        await nextTick();
    }

    async function playVideo(then?: () => void) {
        await enter('video');
        const [, e] = VIDEO_STORY.chunk;
        cursor.on = true;
        pointAt(0);
        later(450, () => pointAt(e));
        later(1250, () => (stage.value = 1));
        later(1600, () => (stage.value = 2));
        later(1900, () => (stage.value = 3));
        later(2350, () => {
            stage.value = 4;
            flipTo(chosen.value, 5);
        });
        later(4200, () => (cursor.on = false));
        if (then) later(6400, then);
    }

    async function playPage() {
        await enter('page');
        const [s, e] = PAGE_STORY.chunk;
        placeCard();
        cursor.on = true;
        pointAt(s, 'left');
        later(500, () => {
            stage.value = 1;
            pointAt(s, 'right');
        });
        later(800, () => {
            stage.value = 2;
            pointAt(s + 1, 'right');
        });
        later(1100, () => {
            stage.value = 3;
            pointAt(e, 'right');
        });
        later(1550, () => {
            stage.value = 4;
            nextTick(placeCard);
            flipTo(chosen.value, 4);
        });
        later(3200, () => (cursor.on = false));
    }

    let reduceMotion = false;
    let observer: IntersectionObserver | null = null;
    /** The visitor took over: the first-view tour must not start (or carry on) after this. */
    function takeOver() {
        observer?.disconnect();
        observer = null;
    }
    async function showEnd(next: Mode = mode.value) {
        if (next !== mode.value) await enter(next);
        clearTimers();
        stage.value = 4;
        shown.value = chosen.value;
        cursor.on = false;
        await nextTick();
        placeCard();
    }

    const used = new Set<string>();
    function noteUse(action: string) {
        // One event per kind of use per visit: enough to learn what the demo is used for.
        if (used.has(action)) return;
        used.add(action);
        track('hero-demo_used', { action, mode: mode.value, language: chosen.value.code });
    }

    function pickMode(next: Mode) {
        takeOver();
        noteUse(`mode-${next}`);
        if (reduceMotion) void showEnd(next);
        else if (next === 'video') void playVideo();
        else void playPage();
    }

    function hover(kind: 'pointer' | 'tap') {
        takeOver();
        if (stage.value < 4) void showEnd();
        noteUse('hover');
        if (kind === 'tap') flipTo(chosen.value, 3);
    }

    function choose(lang: DemoLanguage) {
        takeOver();
        chosen.value = lang;
        clearTimers();
        cursor.on = false;
        if (stage.value < 4) void showEnd();
        shown.value = lang;
        flips.value++;
        noteUse('language');
        nextTick(placeCard);
    }

    function save() {
        saved.value = !saved.value;
        if (saved.value) noteUse('save');
    }

    onMounted(() => {
        reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion || !('IntersectionObserver' in window)) {
            void showEnd();
            return;
        }
        observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting || !observer) return;
                takeOver();
                // Both places, once: the subtitle, then the page. Any click stops the tour.
                void playVideo(() => void playPage());
            },
            { threshold: 0.45 },
        );
        if (root.value) observer.observe(root.value);
    });
    onBeforeUnmount(() => {
        observer?.disconnect();
        clearTimers();
    });
</script>

<style scoped>
    .demo {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
    }

    /* Where it works: a segmented switch above the window. */
    .modes {
        display: inline-flex;
        align-self: flex-start;
        padding: 4px;
        border-radius: var(--radius-pill);
        background: rgb(var(--ink-150));
    }

    .mode {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 40px;
        padding: 6px 14px;
        border: 0;
        border-radius: var(--radius-pill);
        background: transparent;
        color: rgb(var(--ink-700));
        font-weight: 800;
        font-size: 0.875rem;
        cursor: pointer;
    }

    .mode[aria-pressed='true'] {
        background: rgb(var(--white));
        color: rgb(var(--text-strong));
        box-shadow: var(--shadow-sm);
    }

    .screen {
        position: relative;
        overflow: hidden;
        aspect-ratio: 4 / 3.45;
        min-height: 460px;
        border-radius: var(--radius-xl);
        border: 1px solid rgb(var(--border-subtle));
        box-shadow: var(--shadow-lg);
        isolation: isolate;
    }

    /* ---------- the video: a warm dusk, light enough to sit on the paper page ---------- */
    .screen--video {
        background: linear-gradient(180deg, #fde9f0 0%, #f7e6f0 42%, #ecdff0 100%);
    }

    .scene {
        position: absolute;
        inset: 0;
        z-index: -1;
    }

    .sun {
        position: absolute;
        top: 16%;
        right: 16%;
        width: 15%;
        aspect-ratio: 1;
        border-radius: 50%;
        background: radial-gradient(circle at 45% 40%, #fff7ec 0%, #ffe3c7 70%);
        box-shadow: 0 0 70px 26px rgb(255 214 189 / 0.55);
    }

    /* A skyline at dusk in the brand's mauve tints: a pale back row, and a front row with warm lit
       windows so the shapes read as buildings, not blocks. */
    .city {
        position: absolute;
        inset: auto 0 0 0;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        padding: 0 3%;
    }

    .city i {
        display: block;
        border-radius: 6px 6px 0 0;
    }

    .city--back {
        height: 50%;
    }

    .city--back i {
        background: #e9ddf0;
    }

    .city--front {
        height: 34%;
        padding: 0 1%;
    }

    .city--front i {
        background:
            radial-gradient(circle, rgb(255 226 190 / 0.95) 1.6px, transparent 2.2px) 7px 9px / 13px 15px,
            #d8c6e3;
    }

    .source {
        position: absolute;
        top: 14px;
        left: 14px;
        padding: 4px 12px;
        border-radius: var(--radius-pill);
        background: rgb(255 255 255 / 0.78);
        font-size: 0.75rem;
        font-weight: 800;
        color: rgb(var(--ink-800));
    }

    .source__note {
        font-weight: 600;
        color: rgb(var(--ink-600));
    }

    /* The subtitle itself keeps the classic dark caption bar: it is the one dark thing on screen. */
    .caption {
        position: absolute;
        left: 50%;
        bottom: 64px;
        transform: translateX(-50%);
        width: max-content;
        max-width: 92%;
        padding: 0.18em 0.5em;
        border-radius: 8px;
        background: rgb(39 31 45 / 0.8);
        color: #fff;
        font-weight: 800;
        font-size: clamp(0.9375rem, 2.1vw, 1.3125rem);
        line-height: 1.5;
        text-align: center;
        text-wrap: balance;
    }

    .player {
        position: absolute;
        inset: auto 12px 12px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        height: 36px;
        padding: 0 12px;
        border-radius: 12px;
        background: rgb(255 255 255 / 0.72);
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
    }

    .player__play {
        width: 0;
        height: 0;
        border-style: solid;
        border-width: 6px 0 6px 10px;
        border-color: transparent transparent transparent rgb(var(--ink-700));
    }

    .player__track {
        flex: 1;
        height: 4px;
        border-radius: 2px;
        background: rgb(var(--ink-200));
        overflow: hidden;
    }

    .player__done {
        display: block;
        width: 49%;
        height: 100%;
        background: rgb(var(--rose-500));
    }

    .player__time {
        font-size: 0.6875rem;
        color: rgb(var(--ink-700));
    }

    /* ---------- the page: a plain browser window and an article ---------- */
    .screen--page {
        background: rgb(var(--white));
    }

    .browser {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 42px;
        padding: 0 14px;
        border-bottom: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--ink-50));
    }

    .browser__dots {
        display: flex;
        gap: 6px;
    }

    .browser__dots i {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: rgb(var(--ink-200));
    }

    .browser__url {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        max-width: 260px;
        height: 26px;
        padding: 0 10px;
        border-radius: var(--radius-pill);
        background: rgb(var(--white));
        border: 1px solid rgb(var(--border-subtle));
        font-size: 0.75rem;
        font-weight: 700;
        color: rgb(var(--ink-600));
    }

    .article {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 20px clamp(18px, 4vw, 28px);
    }

    .article__mast {
        font-size: 0.6875rem;
        font-weight: 800;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: rgb(var(--ink-600));
    }

    .article__title {
        font-size: clamp(1.125rem, 2.2vw, 1.375rem);
        font-weight: 900;
        line-height: 1.25;
        color: rgb(var(--text-strong));
    }

    .article__text {
        font-size: clamp(0.9375rem, 1.7vw, 1.0625rem);
        line-height: 1.75;
        color: rgb(var(--ink-800));
    }

    .article__line {
        display: block;
        height: 8px;
        border-radius: 4px;
        background: rgb(var(--ink-100));
    }

    .article__line--short {
        width: 62%;
    }

    /* ---------- the phrase, lit ---------- */
    .chunk {
        white-space: nowrap;
    }

    .word {
        position: relative;
        display: inline-block;
        padding: 0 0.04em;
        border-radius: 5px;
        transition:
            background-color 0.18s var(--ease-out),
            box-shadow 0.18s var(--ease-out),
            color 0.18s var(--ease-out);
    }

    .word--chunk {
        cursor: pointer;
    }

    /* The spaces between words are elements too (same box as a word), so a lit phrase can be filled
       edge to edge. */
    .gap {
        display: inline-block;
        white-space: pre;
        transition: background-color 0.18s var(--ease-out);
    }

    .screen--video .word--lit,
    .screen--video .gap--lit {
        background: rgb(var(--rose-500));
        border-radius: 0;
    }

    /* On a page the phrase is a text selection, in the brand's tint rather than a solid block. */
    .screen--page .word--lit,
    .screen--page .gap--lit {
        background: rgb(var(--rose-100));
        color: rgb(var(--rose-800));
        border-radius: 0;
    }

    .word--lit.word--first {
        border-radius: 5px 0 0 5px;
    }

    .word--lit.word--last {
        border-radius: 0 5px 5px 0;
    }

    .word--lit.word--first.word--last {
        border-radius: 5px;
    }

    /* The extension's "+" handles that grow a word into a phrase (subtitles only). */
    .screen--video .word--lit.word--first::before,
    .screen--video .word--lit.word--last::after {
        content: '+';
        position: absolute;
        top: -0.55em;
        width: 1.05em;
        height: 1.05em;
        border-radius: 50%;
        background: #fff;
        color: rgb(var(--rose-600));
        font-size: 0.6em;
        line-height: 1.05em;
        text-align: center;
        font-weight: 900;
        box-shadow: var(--shadow-sm);
    }

    .screen--video .word--lit.word--first::before {
        left: -0.5em;
    }

    .screen--video .word--lit.word--last::after {
        right: -0.5em;
    }

    .cursor {
        position: absolute;
        top: 0;
        left: 0;
        width: 22px;
        height: 22px;
        margin: -11px 0 0 -11px;
        border-radius: 50%;
        background: rgb(249 30 90 / 0.3);
        box-shadow: 0 0 18px 6px rgb(249 30 90 / 0.25);
        opacity: 0;
        pointer-events: none;
        transition:
            transform 0.7s var(--ease-in-out),
            opacity 0.3s;
    }

    /* Dragging a selection: a text cursor rather than a glow. */
    .cursor--page {
        width: 3px;
        height: 24px;
        margin: -12px 0 0 -1px;
        border-radius: 2px;
        background: rgb(var(--rose-600));
        box-shadow: none;
        transition:
            transform 0.3s linear,
            opacity 0.3s;
    }

    .cursor--on {
        opacity: 1;
    }

    /* ---------- the phrase card, as the extension shows it ---------- */
    .card {
        position: absolute;
        left: 50%;
        width: min(88%, 330px);
        padding: 16px 18px 14px;
        border-radius: var(--radius-lg);
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--surface-card));
        box-shadow: var(--shadow-xl);
        transform: translate(-50%, 14px) scale(0.94);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        /* Hidden only once the fade is over, so its content never blinks out mid-fade. */
        transition:
            transform 0.45s var(--ease-spring),
            opacity 0.25s var(--ease-out),
            visibility 0s linear 0.25s;
    }

    .card--video {
        top: 13%;
    }

    .card--on {
        transform: translate(-50%, 0) scale(1);
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transition-delay: 0s;
    }

    .card__head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 6px 10px;
    }

    .card__phrase {
        font-size: 1.25rem;
        font-weight: 900;
        letter-spacing: -0.01em;
        color: rgb(var(--text-strong));
    }

    .card__tags {
        display: flex;
        gap: 6px;
    }

    .card__label {
        margin-top: 10px;
        font-size: 0.6875rem;
        font-weight: 800;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: rgb(var(--ink-600));
    }

    .card__meaning {
        font-size: clamp(1.5rem, 3.2vw, 1.875rem);
        font-weight: 900;
        line-height: 1.2;
        color: rgb(var(--text-strong));
        animation: flip 0.22s var(--ease-out);
    }

    .card__gloss {
        font-size: 0.875rem;
        color: rgb(var(--ink-600));
    }

    .card__say {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 10px;
        margin-top: 8px;
        font-weight: 800;
        color: rgb(var(--ink-800));
    }

    .card__say-label {
        font-family: var(--font-mono);
        font-size: 0.6875rem;
        font-weight: 500;
        color: rgb(var(--ink-600));
    }

    .card__save {
        margin-top: 12px;
    }

    @keyframes flip {
        from {
            transform: translateY(6px);
            opacity: 0.2;
        }
    }

    .langs {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
    }

    .langs__label {
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: rgb(var(--ink-600));
    }

    .langs__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .chip {
        min-height: 36px;
        padding: 4px 12px;
        border: 1.5px solid rgb(var(--border-subtle));
        border-radius: var(--radius-pill);
        background: rgb(var(--surface-card));
        color: rgb(var(--ink-800));
        font-weight: 700;
        font-size: 0.875rem;
        cursor: pointer;
        transition:
            border-color var(--dur-fast),
            background var(--dur-fast),
            color var(--dur-fast);
    }

    .chip:hover {
        border-color: rgb(var(--rose-300));
    }

    .chip--on {
        border-color: rgb(var(--rose-600));
        background: rgb(var(--rose-50));
        color: rgb(var(--rose-700));
    }
</style>
