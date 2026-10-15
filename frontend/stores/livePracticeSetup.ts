/**
 * Transient holder for a live-practice session's resolved inputs.
 *
 * The `/practice/live-session` dispatcher parses the `?session=` request, fetches
 * the phrases, stashes them here, and then redirects to the voice or text page.
 * Those pages read from this store instead of re-fetching. On a hard refresh
 * (Pinia state is gone), a page calls `resolve()` again with the same `?session=`
 * param, so deep-links still work.
 *
 * Phrase *selection* (range/random over a bundle) happens upstream at the entry
 * point, so the request carries a concrete `phraseIds` list and resolution here
 * is a single `findByIds`.
 */
import { defineStore } from 'pinia';
import { dataProvider } from '@modular-rest/client';
import { COLLECTIONS, DATABASE, type PhraseType } from '~/types/database.type';
import type { LiveSessionRequest } from '~/types/live-session-request';
import { decodeSessionRequest } from '~/utils/livePractice';
import { prepareRequestLanguage } from '~/utils/requestLanguage';
import { useLanguageStore } from '~/stores/language';

function parseSessionRequest(raw?: string): LiveSessionRequest | null {
    if (!raw) return null;
    try {
        return decodeSessionRequest(raw);
    } catch {
        return null;
    }
}

export const useLivePracticeSetupStore = defineStore('livePracticeSetup', () => {
    const request = ref<LiveSessionRequest | null>(null);
    const selectedPhrases = ref<PhraseType[]>([]);
    // i18n key (not a translated string) so pages translate in their own context.
    const errorKey = ref<string | null>(null);

    const isResolved = computed(() => !!request.value && selectedPhrases.value.length > 0);

    /**
     * Parse the encoded request and fetch its phrases. Idempotent: returns the
     * parsed request (or null) and leaves `errorKey` set on failure.
     */
    async function resolve(raw?: string, queryLanguage?: string | null): Promise<LiveSessionRequest | null> {
        clear();

        const decoded = parseSessionRequest(raw);
        if (!decoded) {
            errorKey.value = 'live-practice.toast.no-session-data';
            return null;
        }

        // Run in the request's language (the extension's Practice now carries it, D-16).
        const language = useLanguageStore();
        const { request: parsed, switchTo } = prepareRequestLanguage(decoded, language, queryLanguage);
        if (switchTo) {
            try {
                await language.switchLanguage(switchTo);
            } catch (error) {
                console.error('Switching to the practice language failed:', error);
            }
        }
        request.value = parsed;

        const ids = parsed.source?.phraseIds ?? [];
        if (!ids.length) {
            errorKey.value = 'live-practice.toast.fetch-failed';
            return parsed;
        }

        try {
            const phrases = await dataProvider.findByIds<PhraseType>({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PHRASE,
                ids,
                accessQuery: { refId: authUser.value?.id },
            });
            // Preserve the requested order — findByIds may return DB order.
            const byId = new Map((phrases || []).map((p) => [p._id, p]));
            selectedPhrases.value = ids
                .map((id) => byId.get(id))
                .filter((p): p is PhraseType => !!p);
        } catch {
            errorKey.value = 'live-practice.toast.fetch-failed';
            return parsed;
        }

        if (!selectedPhrases.value.length) {
            errorKey.value = 'live-practice.toast.fetch-failed';
        }
        return parsed;
    }

    function clear() {
        request.value = null;
        selectedPhrases.value = [];
        errorKey.value = null;
    }

    return { request, selectedPhrases, errorKey, isResolved, resolve, clear };
});
