<template>
    <section id="who-its-for" class="section uses" aria-labelledby="uses-title">
        <span id="benefits" class="legacy-anchor" aria-hidden="true"></span>
        <div class="container uses__inner">
            <div class="section-head">
                <p class="eyebrow">Who it’s for</p>
                <h2 id="uses-title" class="section-title">For people who watch English every day.</h2>
                <p class="lede">You read English well. Speaking takes more effort. Here is how people use Subturtle.</p>
            </div>
            <ul class="uses__grid">
                <li v-for="use in USES" :key="use.title">
                    <StCard class="use" padding="lg">
                        <span class="use__icon"><StIcon :name="use.icon" :size="26" /></span>
                        <h3 class="use__title">{{ use.title }}</h3>
                        <p>{{ use.body }}</p>
                    </StCard>
                </li>
            </ul>
        </div>
    </section>
</template>

<script setup lang="ts">
    import { StCard, StIcon } from 'subturtle-ui';

    const USES = [
        {
            icon: 'solar:document-text-bold-duotone',
            title: 'Reading the web',
            body: 'News, Reddit, newsletters: select a phrase on any page and it joins the same review.',
        },
        {
            icon: 'solar:tv-bold-duotone',
            title: 'Series nights',
            body: 'Turn your Netflix evenings into a phrase bank, without pausing the show to study.',
        },
        {
            icon: 'solar:code-square-bold-duotone',
            title: 'Tech talks and docs',
            body: 'Save phrasing from YouTube talks and articles, then practice it before your next meeting.',
        },
        {
            icon: 'solar:case-minimalistic-bold-duotone',
            title: 'Interview prep',
            body: 'Build an interview bundle, then talk it through with the coach before the real call.',
        },
        {
            icon: 'solar:translation-2-bold-duotone',
            title: 'Help in your own script',
            body: 'Persian, Arabic, Kurdish, Urdu or Turkish speaker? Meanings and pronunciation come in your own script.',
        },
        {
            icon: 'solar:chat-round-dots-bold-duotone',
            title: 'Shy speakers',
            body: 'Practice with a patient voice before you practice with people. Talk, or type instead.',
        },
    ];
</script>

<style scoped>
    .uses__inner {
        display: flex;
        flex-direction: column;
        gap: clamp(2rem, 4vw, 3rem);
    }

    .uses__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
        gap: 16px;
        padding: 0;
        list-style: none;
    }

    .uses__grid li {
        display: flex;
    }

    .use {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
    }

    .use__icon {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: rgb(var(--rose-50));
        color: rgb(var(--rose-600));
    }

    .use__title {
        font-size: 1.1875rem;
        font-weight: 900;
    }
</style>
