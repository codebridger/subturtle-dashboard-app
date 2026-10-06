<template>
    <footer class="footer">
        <span id="contact" class="legacy-anchor" aria-hidden="true"></span>
        <div class="container footer__grid">
            <div class="footer__brand">
                <a href="/" class="brand" aria-label="Subturtle home">
                    <SiteMark :size="34" />
                    <span class="brand__name">Subturtle</span>
                </a>
                <p class="footer__line">{{ TAGLINE }}</p>
                <p class="footer__scope">
                    A Chrome extension for any web page, YouTube and Netflix. You practice English; explanations come in {{ LANGUAGE_COUNT }} languages.
                </p>
            </div>

            <nav class="footer__col" aria-labelledby="footer-product">
                <h2 id="footer-product" class="footer__head">Product</h2>
                <a :href="installHref" @click="track('install-cta_clicked', { location: 'footer' })">Add to Chrome</a>
                <a :href="dashboardHref('/')" @click="track('dashboard-cta_clicked', { location: 'footer' })">Open dashboard</a>
                <a href="/#pricing">Pricing</a>
                <a href="/#faq">FAQ</a>
            </nav>

            <nav class="footer__col" aria-labelledby="footer-company">
                <h2 id="footer-company" class="footer__head">Company</h2>
                <a :href="BLOG_URL">Blog</a>
                <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>
                <a :href="COMPANY_URL">CodeBridger Ltd</a>
            </nav>

            <nav class="footer__col" aria-labelledby="footer-legal">
                <h2 id="footer-legal" class="footer__head">Legal</h2>
                <a href="/privacy">Privacy policy</a>
                <a href="/terms">Terms of service</a>
                <button v-if="enabled" type="button" class="footer__button" @click="reopen">Cookie settings</button>
            </nav>
        </div>
        <div class="container footer__base">
            <p>© {{ year }} CodeBridger Ltd. Subturtle is not affiliated with YouTube or Netflix.</p>
        </div>
    </footer>
</template>

<script setup lang="ts">
    import { BLOG_URL, COMPANY_URL, CONTACT_EMAIL, LANGUAGE_COUNT, TAGLINE } from '~/data/site';

    const { installHref, dashboardHref } = useCta();
    const { enabled, reopen } = useAnalytics();
    // Baked at build time; the site is rebuilt on every deploy.
    const year = new Date().getFullYear();
</script>

<style scoped>
    .footer {
        background: rgb(var(--ink-100));
        color: rgb(var(--ink-700));
        padding-block: clamp(3.5rem, 7vw, 5rem) 2rem;
        font-size: 0.9375rem;
    }

    .footer__grid {
        display: grid;
        gap: 36px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .footer__brand {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 26rem;
    }

    .brand {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        text-decoration: none;
    }

    .brand__name {
        font-size: 1.3125rem;
        font-weight: 900;
        letter-spacing: -0.02em;
        color: rgb(var(--text-strong));
    }

    .footer__line {
        color: rgb(var(--text-strong));
        font-weight: 800;
        font-size: 1.0625rem;
    }

    .footer__scope {
        line-height: 1.55;
    }

    .footer__col {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }

    .footer__head {
        margin-bottom: 4px;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: rgb(var(--text-strong));
    }

    .footer__col a,
    .footer__button {
        color: rgb(var(--ink-700));
        text-decoration: none;
        font-weight: 600;
        word-break: break-word;
    }

    .footer__button {
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
    }

    .footer__col a:hover,
    .footer__button:hover {
        color: rgb(var(--rose-700));
        text-decoration: underline;
    }

    .footer__base {
        margin-top: 48px;
        padding-top: 20px;
        border-top: 1px solid rgb(var(--ink-200));
        font-size: 0.875rem;
        color: rgb(var(--ink-600));
    }

    @media (min-width: 860px) {
        .footer__grid {
            grid-template-columns: 2fr 1fr 1fr 1fr;
        }

        .footer__brand {
            grid-column: auto;
        }
    }
</style>
