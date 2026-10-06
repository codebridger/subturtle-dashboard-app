export function getQueryParams() {
    return new URLSearchParams(window.location.search);
}

export function getQueryParam(key: string) {
    return getQueryParams().get(key);
}

/**
 * Where a phrase was captured, as the design's small caption under the card number
 * ("Netflix", "YouTube", "bbc.com"). Phrases carry only a `sourceUrl`, so the label is the
 * host: a known streaming/learning site gets its proper name, anything else keeps its
 * hostname minus `www.`. Returns null when there is no usable URL — a manually typed phrase
 * has no source, and inventing one would be worse than showing nothing.
 */
const HOST_LABELS: Record<string, string> = {
    'netflix.com': 'Netflix',
    'youtube.com': 'YouTube',
    'youtu.be': 'YouTube',
    'primevideo.com': 'Prime Video',
    'amazon.com': 'Prime Video',
    'disneyplus.com': 'Disney+',
    'hbomax.com': 'HBO Max',
    'max.com': 'Max',
    'ted.com': 'TED',
    'coursera.org': 'Coursera',
    'udemy.com': 'Udemy',
};

export function phraseSourceLabel(sourceUrl?: string | null): string | null {
    if (!sourceUrl) return null;

    let host: string;
    try {
        host = new URL(sourceUrl).hostname.toLowerCase();
    } catch {
        return null;
    }

    const bare = host.replace(/^www\./, '');
    // Match the registrable domain so `www.netflix.com` and `m.youtube.com` land on the same label.
    const known = Object.keys(HOST_LABELS).find((domain) => bare === domain || bare.endsWith(`.${domain}`));

    return known ? HOST_LABELS[known] : bare || null;
}

/** True when the source is a video site, which picks the card's camera icon over the link one. */
export function isVideoSource(sourceUrl?: string | null): boolean {
    const label = phraseSourceLabel(sourceUrl);
    return !!label && ['Netflix', 'YouTube', 'Prime Video', 'Disney+', 'HBO Max', 'Max', 'TED'].includes(label);
}
