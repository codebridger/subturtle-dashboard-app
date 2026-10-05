<template>
    <section id="faq" class="section" aria-labelledby="faq-title">
        <div class="container faq">
            <div class="section-head">
                <p class="eyebrow">FAQ</p>
                <h2 id="faq-title" class="section-title">Questions, answered plainly.</h2>
                <p class="lede">
                    Something else? Write to <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a
                    >.
                </p>
            </div>
            <!-- Native <details>: works without JavaScript, and every answer is in the HTML for search. -->
            <div class="faq__list">
                <details v-for="(item, i) in FAQ" :key="item.id" class="qa" :open="i === 0" @toggle="onToggle($event, item.id)">
                    <summary class="qa__q">
                        <span>{{ item.q }}</span>
                        <StIcon name="solar:alt-arrow-down-linear" :size="22" class="qa__chevron" />
                    </summary>
                    <p class="qa__a">{{ item.a }}</p>
                </details>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
    import { StIcon } from 'subturtle-ui';
    import { CONTACT_EMAIL, LANGUAGE_COUNT } from '~/data/site';

    /** Every answer must be true today. Scope questions come first: they are what people ask most. */
    const FAQ = [
        {
            id: 'free',
            q: 'Is Subturtle free?',
            a: 'Yes. The Starter plan is free, with no card and no time limit. It includes hover translation, up to 200 saved phrases a month, unlimited Smart Review and a taste of the AI tools. Paid plans add more saves, text chats and voice minutes.',
        },
        {
            id: 'languages',
            q: 'Which language can I practice?',
            a: `English. Subturtle is built for people who are learning English. Meanings and explanations come in your own language: we support ${LANGUAGE_COUNT} of them, including right-to-left languages like Persian and Arabic.`,
        },
        {
            id: 'where',
            q: 'Where does it work?',
            a: 'In Chrome on a computer. On any web page, select text to see what it means. On YouTube and Netflix, hover the captions. You review and practice in the Subturtle dashboard.',
        },
        {
            id: 'coach',
            q: 'How is the AI coach different from a chatbot?',
            a: 'The coach practices the phrases you saved, in the sentences where you found them. It moves through your cards by itself, and when you get stuck it helps in your language for a moment. It does not give you scores. It is a patient partner for practice.',
        },
        {
            id: 'trial',
            q: 'How does the 3-day free trial work?',
            a: 'The trial is for the Learner plan and needs a card. If you cancel before the trial ends, you pay nothing. If you keep it, your card is charged for Learner. You can cancel any time from your account.',
        },
        {
            id: 'privacy',
            q: 'Do you collect my viewing history?',
            a: 'No. The extension only uses the subtitles and text you interact with, to translate them and to save your phrases. We do not collect your viewing history, and we do not sell your data.',
        },
        {
            id: 'company',
            q: 'Who makes Subturtle?',
            a: 'CodeBridger Ltd, a small company in the UK. Payments go through Stripe, so your card details never reach our servers.',
        },
        {
            id: 'other-browsers',
            q: 'Is there a mobile app, or a version for Firefox or Safari?',
            a: 'Not yet. Today, Subturtle is a Chrome extension.',
        },
    ];

    function onToggle(event: Event, id: string) {
        if ((event.target as HTMLDetailsElement).open) track('faq-item_opened', { question: id });
    }
</script>

<style scoped>
    .faq {
        display: grid;
        gap: clamp(2rem, 4vw, 3.5rem);
    }

    .faq__list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .qa {
        border-radius: var(--radius-md);
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--surface-card));
        transition: box-shadow var(--dur-base) var(--ease-out);
    }

    .qa[open] {
        box-shadow: var(--shadow-md);
    }

    .qa__q {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 56px;
        padding: 14px 20px;
        font-weight: 800;
        font-size: 1.0625rem;
        color: rgb(var(--text-strong));
        cursor: pointer;
        list-style: none;
    }

    .qa__q::-webkit-details-marker {
        display: none;
    }

    .qa__chevron {
        flex-shrink: 0;
        color: rgb(var(--ink-600));
        transition: transform var(--dur-base) var(--ease-out);
    }

    .qa[open] .qa__chevron {
        transform: rotate(180deg);
    }

    .qa__a {
        padding: 0 20px 18px;
        line-height: 1.65;
    }

    @media (min-width: 960px) {
        .faq {
            grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
            align-items: start;
        }
    }
</style>
