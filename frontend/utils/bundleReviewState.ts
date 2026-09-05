/**
 * Per-bundle review state for the Start-a-session picker: the "N due" count on each tile
 * and the Due today / Never practised filters.
 *
 * `leitner_system` is an owner-access collection, so the client cannot read review state
 * directly; `get-phrase-management-info` hands back the two id sets these functions
 * intersect with a bundle's own phrase ids.
 */

/**
 * A bundle's phrase ids as strings, whether the document stores raw ObjectIds or populated
 * phrase documents. Both shapes occur: the picker's list query returns ids, while some
 * detail queries populate.
 */
export function bundlePhraseIds(bundle: { phrases?: any[] } | null | undefined): string[] {
    return (bundle?.phrases ?? []).map((p: any) => String(p?._id ?? p)).filter(Boolean);
}

/** How many of the bundle's phrases are due for review right now. */
export function dueCountFor(bundle: { phrases?: any[] } | null | undefined, duePhraseIds: Set<string>): number {
    if (!duePhraseIds.size) return 0;
    return bundlePhraseIds(bundle).filter((id) => duePhraseIds.has(id)).length;
}

/**
 * True when no phrase in the bundle has ever entered the review system.
 *
 * An empty bundle counts as never practised — there is nothing in it that could have been.
 */
export function isNeverPractised(bundle: { phrases?: any[] } | null | undefined, practisedPhraseIds: Set<string>): boolean {
    return !bundlePhraseIds(bundle).some((id) => practisedPhraseIds.has(id));
}
