import { SITE_NAME } from '~/data/site';

/**
 * Title, description, canonical, Open Graph and Twitter tags for one page, all built from
 * NUXT_PUBLIC_SITE_URL, so a dev build describes the dev host. A non-production build is `noindex`
 * (see `indexable` in nuxt.config.ts).
 */
export function usePageSeo(page: { title: string; description: string; path: string }) {
    const { siteUrl, indexable } = useRuntimeConfig().public;
    const url = siteUrl + page.path;
    const image = `${siteUrl}/og.jpg`;

    useSeoMeta({
        title: page.title,
        description: page.description,
        robots: indexable ? 'index, follow' : 'noindex, nofollow',
        ogType: 'website',
        ogSiteName: SITE_NAME,
        ogTitle: page.title,
        ogDescription: page.description,
        ogUrl: url,
        ogImage: image,
        ogImageWidth: 1200,
        ogImageHeight: 630,
        ogImageAlt: 'Subturtle: from watching English to speaking it.',
        ogLocale: 'en_GB',
        twitterCard: 'summary_large_image',
        twitterTitle: page.title,
        twitterDescription: page.description,
        twitterImage: image,
    });
    useHead({ link: [{ rel: 'canonical', href: url }] });
}
