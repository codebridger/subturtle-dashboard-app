/** Removed languages and kept phrases are held for 30 days (Q2, Q6). */
export const KEEP_DAYS = 30;

/** "14 November" — the day a removed language or a kept phrase is deleted. */
export function formatLanguageDate(iso?: string | null, locale = 'en-GB'): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
}

/** The purge date a removal made now would get, for the confirm dialog before the server answers. */
export function purgeDateFromNow(now = new Date()): string {
    return new Date(now.getTime() + KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
