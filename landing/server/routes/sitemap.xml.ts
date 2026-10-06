/** Prerendered to dist/sitemap.xml. Every indexable page; add new pages here. */
const PATHS = ['/', '/privacy', '/terms'];

export default defineEventHandler((event) => {
    const { siteUrl } = useRuntimeConfig(event).public;
    const lastmod = new Date().toISOString().slice(0, 10);
    setHeader(event, 'content-type', 'application/xml; charset=utf-8');
    const urls = PATHS.map((path) => `  <url><loc>${siteUrl}${path}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
});
