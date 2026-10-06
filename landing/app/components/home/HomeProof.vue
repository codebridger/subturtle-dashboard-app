<template>
    <!-- Real proof only: the store rating as it stands, the Featured badge, and the build history. No
         testimonials until real users have agreed to be quoted. -->
    <section class="proof" aria-label="What people say on the Chrome Web Store">
        <div class="container proof__row">
            <a class="item" :href="CHROME_WEB_STORE_URL">
                <span class="item__big">
                    {{ STORE_RATING.value }}
                    <span class="item__stars" aria-hidden="true"><StIcon v-for="n in 5" :key="n" name="solar:star-bold" :size="18" /></span>
                </span>
                <span class="item__small">from {{ STORE_RATING.count }} ratings on the Chrome Web Store</span>
            </a>
            <div class="item">
                <span class="item__big"><StIcon name="solar:verified-check-bold" :size="26" class="item__check" /> Featured</span>
                <span class="item__small">by the Chrome Web Store</span>
            </div>
            <div class="item">
                <span class="item__big">Since {{ SINCE_YEAR }}</span>
                <span class="item__small">first built as a small Netflix prototype, “Learn by subtitle”</span>
            </div>
            <a v-if="productHuntPostId" class="item item--ph" :href="productHuntUrl">
                <img
                    :src="`https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=${productHuntPostId}&theme=light`"
                    alt="Subturtle on Product Hunt"
                    width="250"
                    height="54"
                    loading="lazy"
                />
            </a>
        </div>
    </section>
</template>

<script setup lang="ts">
    import { StIcon } from 'subturtle-ui';
    import { CHROME_WEB_STORE_URL, SINCE_YEAR, STORE_RATING } from '~/data/site';

    const { productHuntPostId, productHuntPostSlug } = useRuntimeConfig().public;
    const productHuntUrl = `https://www.producthunt.com/posts/${productHuntPostSlug || 'subturtle'}?utm_source=badge-featured&utm_medium=badge`;
</script>

<style scoped>
    .proof {
        padding-block: clamp(2.5rem, 5vw, 3.5rem);
        border-block: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--surface-card));
    }

    .proof__row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
        gap: 24px 32px;
        align-items: center;
    }

    .item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: inherit;
        text-decoration: none;
    }

    a.item:hover .item__small {
        text-decoration: underline;
    }

    .item__big {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 1.75rem;
        font-weight: 900;
        letter-spacing: -0.02em;
        color: rgb(var(--text-strong));
    }

    .item__stars {
        display: inline-flex;
        color: rgb(var(--amber-500));
    }

    .item__check {
        color: rgb(var(--jade-600));
    }

    .item__small {
        font-size: 0.9375rem;
        color: rgb(var(--ink-600));
    }

    .item--ph {
        justify-self: start;
    }
</style>
