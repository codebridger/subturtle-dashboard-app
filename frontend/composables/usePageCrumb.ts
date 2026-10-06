import { onUnmounted, ref, watchEffect, type MaybeRefOrGetter, toValue } from 'vue';

/** What the topbar shows for a detail page: a section, the thing's own name, and an optional chip. */
export interface PageCrumb {
    /** Left-hand segment. Falls back to the nav group the route sits in when omitted. */
    section?: string;
    label: string;
    /** Small pill after the label — e.g. "42 phrases". */
    badge?: string;
}

/**
 * Page-level override for the topbar breadcrumb.
 *
 * The default layout derives the crumb from the nav itself, which is right for every list
 * screen ("Practice › Phrase bundles") but says nothing on a detail route: the design's bundle
 * detail wants "Library › Money Heist — s1e4  [42 phrases]". A module-level ref (SPA, no SSR)
 * lets the page publish that without the layout knowing about any particular route.
 */
const crumbOverride = ref<PageCrumb | null>(null);

/** Read side — the layout. */
export function usePageCrumbState() {
    return crumbOverride;
}

/**
 * Write side — a page. Takes a getter so the crumb follows loaded data (the bundle title
 * arrives after the fetch), and clears itself on unmount so the next route gets the nav crumb.
 */
export function usePageCrumb(crumb: MaybeRefOrGetter<PageCrumb | null>) {
    watchEffect(() => {
        crumbOverride.value = toValue(crumb);
    });

    onUnmounted(() => {
        crumbOverride.value = null;
    });
}
