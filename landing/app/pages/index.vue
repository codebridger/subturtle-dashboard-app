<template>
    <HomeHero />
    <HomeProblem />
    <HomeLoop />
    <HomeFilm />
    <HomeUseCases />
    <HomeProof />
    <HomePricing />
    <HomeFaq />
    <HomeFinalCta />
    <StickyCta watch="hero-cta" />
</template>

<script setup lang="ts">
    import allPlans from '#plans';
    import { CHROME_WEB_STORE_URL, CONTACT_EMAIL, COMPANY_URL, DESCRIPTION, SITE_NAME } from '~/data/site';

    usePageSeo({
        title: 'Subturtle: learn English from YouTube and Netflix, then speak it',
        description:
            'Select text on any web page, or hover a YouTube or Netflix subtitle, to see it in your language. Then review it and practice it out loud with an AI coach.',
        path: '/',
    });

    /**
     * Structured data. Offers are the live plan prices (monthly, GBP). There is deliberately no
     * aggregateRating: the only ratings are on the Chrome Web Store, and Google's rules do not allow
     * marking up ratings collected on another site.
     */
    const { siteUrl } = useRuntimeConfig().public;
    const plans = allPlans as { id: string; name: string; status: string; pricing: { monthly: { gbp?: number } } | null }[];
    const orgId = `${siteUrl}/#organization`;
    useHead({
        script: [
            {
                type: 'application/ld+json',
                innerHTML: JSON.stringify({
                    '@context': 'https://schema.org',
                    '@graph': [
                        { '@type': 'Organization', '@id': orgId, name: 'CodeBridger Ltd', url: COMPANY_URL, email: CONTACT_EMAIL },
                        { '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: SITE_NAME, url: `${siteUrl}/`, publisher: { '@id': orgId } },
                        {
                            '@type': 'SoftwareApplication',
                            name: SITE_NAME,
                            url: `${siteUrl}/`,
                            description: DESCRIPTION,
                            applicationCategory: 'EducationalApplication',
                            operatingSystem: 'Chrome',
                            downloadUrl: CHROME_WEB_STORE_URL,
                            image: `${siteUrl}/og.jpg`,
                            publisher: { '@id': orgId },
                            offers: plans
                                .filter((p) => p.status === 'live')
                                .map((p) => ({
                                    '@type': 'Offer',
                                    name: p.name,
                                    price: (p.pricing?.monthly.gbp ?? 0).toFixed(2),
                                    priceCurrency: 'GBP',
                                })),
                        },
                    ],
                }),
            },
        ],
    });
</script>
