<template>
    <header class="header">
        <div class="container header__row">
            <a href="/" class="brand" aria-label="Subturtle home">
                <SiteMark :size="34" />
                <span class="brand__name">Subturtle</span>
            </a>

            <nav class="nav" aria-label="Main">
                <a href="/#how-it-works">How it works</a>
                <a href="/#pricing">Pricing</a>
                <a href="/#faq">FAQ</a>
                <a :href="BLOG_URL">Blog</a>
            </nav>

            <div class="header__actions">
                <a class="dash-link" :href="dashboardHref('/')" @click="track('dashboard-cta_clicked', { location: 'header' })">Open dashboard</a>
                <StButton :href="installHref" size="md" icon="solar:add-circle-bold" @click="track('install-cta_clicked', { location: 'header' })">
                    <span class="cta-long">Add to Chrome, it's free</span>
                    <span class="cta-short">Add to Chrome</span>
                </StButton>
            </div>
        </div>
    </header>
</template>

<script setup lang="ts">
    import { StButton } from 'subturtle-ui';
    import { BLOG_URL } from '~/data/site';

    const { installHref, dashboardHref } = useCta();
</script>

<style scoped>
    .header {
        position: sticky;
        top: 0;
        z-index: var(--z-sticky);
        background: rgb(var(--paper) / 0.86);
        -webkit-backdrop-filter: saturate(1.4) blur(14px);
        backdrop-filter: saturate(1.4) blur(14px);
        border-bottom: 1px solid rgb(var(--ink-200) / 0.7);
    }

    .header__row {
        display: flex;
        align-items: center;
        gap: 24px;
        height: var(--header-h);
    }

    .brand {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        text-decoration: none;
        flex-shrink: 0;
    }

    .brand__name {
        font-size: 1.3125rem;
        font-weight: 900;
        letter-spacing: -0.02em;
        color: rgb(var(--text-strong));
    }

    .nav {
        display: none;
        gap: 4px;
        margin-inline-start: 12px;
    }

    .nav a,
    .dash-link {
        padding: 8px 12px;
        border-radius: 10px;
        font-weight: 700;
        font-size: 0.9375rem;
        color: rgb(var(--ink-700));
        text-decoration: none;
        transition:
            background var(--dur-fast) var(--ease-out),
            color var(--dur-fast) var(--ease-out);
    }

    .nav a:hover,
    .dash-link:hover {
        background: rgb(var(--ink-100));
        color: rgb(var(--text-strong));
    }

    .header__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-inline-start: auto;
    }

    .dash-link {
        display: none;
    }

    .cta-long {
        display: none;
    }

    @media (min-width: 640px) {
        .dash-link {
            display: inline-block;
        }
    }

    @media (min-width: 920px) {
        .nav {
            display: flex;
        }

        .cta-long {
            display: inline;
        }

        .cta-short {
            display: none;
        }
    }
</style>
