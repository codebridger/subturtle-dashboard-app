/** Prerendered to dist/robots.txt. Only the production build lets crawlers in (see `indexable`). */
export default defineEventHandler((event) => {
    const { siteUrl, indexable } = useRuntimeConfig(event).public;
    setHeader(event, 'content-type', 'text/plain; charset=utf-8');
    return indexable ? `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n';
});
