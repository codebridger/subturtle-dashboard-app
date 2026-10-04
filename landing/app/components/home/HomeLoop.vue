<template>
    <section id="how-it-works" class="section" aria-labelledby="loop-title">
        <span id="featuresection" class="legacy-anchor" aria-hidden="true"></span>
        <div class="container loop">
            <div class="section-head">
                <p class="eyebrow">How it works</p>
                <h2 id="loop-title" class="section-title">From a subtitle line to a real conversation.</h2>
                <p class="lede">Every phrase you meet goes through the same five steps. You only do the watching and the talking.</p>
            </div>

            <HomeLoopRow :step="1" label="Source" art="A web page, a show and a talk, each with one phrase highlighted.">
                <template #title>Learn from what you <span class="hl">read and watch.</span></template>
                <p>
                    No extra study time. Select text on any web page, from the news to a work doc, or hover the captions on YouTube and Netflix. The English is
                    at your level, on topics you chose.
                </p>
                <template #art><ArtSources /></template>
            </HomeLoopRow>

            <HomeLoopRow :step="2" label="Meaning" flip art="A phrase card for 'on the fence': idiom, informal, pronunciation and the meaning in Spanish.">
                <template #title>Get it in <span class="hl">your language.</span></template>
                <p>
                    You get the meaning in context, not a dictionary list. Idioms and phrasal verbs stay together as one phrase, so “on the fence” means “not
                    decided yet”, not a fence.
                </p>
                <p>
                    Explanations come in your language, one of {{ LANGUAGE_COUNT }}, right-to-left included. The pronunciation is spelled in your own alphabet.
                </p>
                <template #art><ArtMeaning /></template>
            </HomeLoopRow>

            <HomeLoopRow
                :step="3"
                label="Context"
                art="A bundle named after a show, with each saved phrase tied back to the show, talk or article it came from."
            >
                <template #title>Every phrase keeps <span class="hl">its scene.</span></template>
                <p>
                    When you save a phrase, its sentence and its source come with it. Bundles name themselves after the show or page. Later, that sentence
                    becomes your review card.
                </p>
                <template #art><ArtScene /></template>
            </HomeLoopRow>

            <HomeLoopRow
                :step="4"
                label="Memory"
                flip
                badge="Unlimited on every plan"
                art="Review steps at 1, 2, 4, 8 and 16 days, with the phrase filled into the gaps of its own sentence."
            >
                <template #title>It comes back at <span class="hl">the right time.</span></template>
                <p>
                    New phrases start in the Pool. Then Smart Review brings each one back after 1, 2, 4, 8 and 16 days. From level 3, you fill in the gap in
                    your own sentence.
                </p>
                <p>A few minutes a day is enough.</p>
                <template #art><ArtReview /></template>
            </HomeLoopRow>

            <HomeLoopRow
                :step="5"
                label="Speaking"
                feature
                art="A voice coach asks 'So… did you take the new job?', gives a hint in Spanish, and you answer 'Honestly, I'm still on the fence.'"
            >
                <template #title>Then you say it <span class="hl">out loud.</span></template>
                <p>
                    Talk with an AI voice coach in real time. It practices the exact phrases you saved and moves through your cards for you. When you get stuck,
                    it helps in your language for a moment, then goes back to English.
                </p>
                <p>No scores, just practice. Prefer to type? Text chat with the coach works too.</p>
                <template #art><ArtCoach /></template>
            </HomeLoopRow>

            <p class="loop__proof">
                <strong>Free to start.</strong>
                <span>Chrome, on any web page, YouTube and Netflix.</span>
                <span>Explanations in {{ LANGUAGE_COUNT }} languages.</span>
            </p>
        </div>
    </section>
</template>

<script setup lang="ts">
    import { LANGUAGE_COUNT } from '~/data/site';
</script>

<style scoped>
    .loop {
        display: flex;
        flex-direction: column;
        gap: clamp(4rem, 9vw, 7rem);
    }

    .loop__proof {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px 18px;
        padding: 18px 24px;
        border-radius: var(--radius-pill);
        background: rgb(var(--surface-card));
        border: 1px solid rgb(var(--border-subtle));
        font-weight: 700;
        color: rgb(var(--ink-700));
        text-align: center;
    }

    .loop__proof strong {
        color: rgb(var(--rose-700));
        font-weight: 900;
    }
</style>
