import { defineStore } from 'pinia';
import { functionProvider } from '@modular-rest/client';
import { type BoardActivityType, type LeitnerItemType } from '~/types/database.type';
import { analytic } from '~/plugins/mixpanel';
import { scopedLanguage, withLanguage } from '~/utils/languageScope';
import { onLanguageSwitch, useLanguageStore } from '~/stores/language';
import type { ReviewResult } from '~/types/language.type';

export const useLeitnerStore = defineStore('leitner', () => {
	// State
	// State
	const boardActivities = ref<BoardActivityType[]>([]);
	const reviewSessionItems = ref<LeitnerItemType[]>([]);
	const customReviewSessionItems = ref<LeitnerItemType[]>([]);
	const pendingBundleReviewIds = ref<string[]>([]);
	const stats = ref<any>(null);
	/** get-board's `newLanguage`: the active language has no phrases yet (D-11). */
	const newLanguage = ref(false);
	const boardLanguage = ref<string | null>(null);

	// Actions

	async function fetchBoard() {
		try {
			// functionProvider.run calls the server-side function 'get-board'
			// Using kebab-case as defined in functions.ts permissions/name
			const res = await functionProvider.run({
				name: 'get-board',
				args: withLanguage({
					userId: authUser.value?.id
				})
			}) as BoardActivityType[] | { language?: string; newLanguage?: boolean; activities?: BoardActivityType[] };

			// Today's server answers the activity list; the multilingual one wraps it with the
			// board's language and `newLanguage` (contract section 3). Read both.
			if (Array.isArray(res)) {
				boardActivities.value = res;
				newLanguage.value = false;
				boardLanguage.value = null;
			} else {
				boardActivities.value = res?.activities ?? [];
				newLanguage.value = !!res?.newLanguage;
				boardLanguage.value = res?.language ?? null;
			}
		} catch (error) {
			console.error('Failed to fetch board:', error);
			boardActivities.value = [];
		}
	}

	async function consumeActivity(type: string, refId?: string) {
		try {
			await functionProvider.run({
				name: 'consume-activity',
				args: withLanguage({ type, refId, userId: authUser.value?.id })
			});
			// Optimistic update
			boardActivities.value = boardActivities.value
				.map((a) => {
					if (a.type === type && a.refId === refId) {
						if (a.persistent) {
							return { ...a, state: 'idle' as const };
						}
						return null;
					}
					return a;
				})
				.filter((a): a is BoardActivityType => a !== null);
		} catch (error) {
			console.error('Failed to consume activity:', error);
		}
	}

	async function fetchReviewSession(limit: number = 20) {
		try {
			const items = await functionProvider.run({
				name: 'get-review-session',
				args: withLanguage({ limit, userId: authUser.value?.id })
			}) as LeitnerItemType[];

			reviewSessionItems.value = items || [];
			return items;
		} catch (error) {
			console.error('Failed to fetch review session:', error);
			return [];
		}
	}

	async function fetchCustomReviewSession(phraseIds: string[]) {
		try {
			const items = await functionProvider.run({
				name: 'get-custom-review-session',
				args: withLanguage({ phraseIds, userId: authUser.value?.id })
			}) as LeitnerItemType[];

			customReviewSessionItems.value = items || [];
			return items;
		} catch (error) {
			console.error('Failed to fetch custom review session:', error);
			return [];
		}
	}

	/**
	 * `result` is the three-way answer (Q4). `isCorrect` stays for servers that predate it:
	 * "close" keeps the card in its box on the new server and counts as right on the old one,
	 * which is the kinder of the two readings for a learner who had the right word.
	 */
	/** Answers still on their way to the server; `finishReviewSession` waits for them. */
	const pendingSubmits = new Set<Promise<unknown>>();
	let answeredSinceRefresh = 0;

	async function submitReview(phraseId: string, isCorrect: boolean, result?: ReviewResult) {
		answeredSinceRefresh++;
		const call = functionProvider.run({
			name: 'submit-review',
			// `result` only to a multilingual server; today's server reads `isCorrect` alone.
			args: withLanguage({ phraseId, isCorrect, ...(result && scopedLanguage() ? { result } : {}), userId: authUser.value?.id })
		});
		pendingSubmits.add(call);
		try {
			await call;

			// Remove from local session to show progress (if needed)
			// Or just keep it. Typically we move to next card.

			analytic.track('leitner_review_submitted', { isCorrect, ...(result ? { result } : {}) });
		} catch (error) {
			console.error('Failed to submit review:', error);
		} finally {
			pendingSubmits.delete(call);
		}
	}

	/**
	 * A review session is over (finished, or left half-way): the "due" and phrase counts in the
	 * language state (Languages page, header menu) moved with every answer, so reload them. Waits
	 * for the last answers to land first, or the refresh would read the old numbers. Does nothing
	 * when no card was answered since the last refresh, so a second call (a page unmounting after
	 * the session already ended) costs nothing.
	 */
	async function finishReviewSession() {
		if (!answeredSinceRefresh) return;
		answeredSinceRefresh = 0;
		await Promise.allSettled([...pendingSubmits]);
		await useLanguageStore().refreshState();
	}

	function setPendingBundleReview(phraseIds: string[]) {
		pendingBundleReviewIds.value = phraseIds;
	}

	async function fetchStats() {
		try {
			const res = await functionProvider.run({
				name: 'get-stats',
				args: withLanguage({ userId: authUser.value?.id })
			});
			stats.value = res;
		} catch (error) {
			console.error('Failed to fetch stats:', error);
		}
	}

	/** Everything here belongs to one language; a switch empties it and reloads the board. */
	function reset() {
		boardActivities.value = [];
		reviewSessionItems.value = [];
		customReviewSessionItems.value = [];
		pendingBundleReviewIds.value = [];
		stats.value = null;
		newLanguage.value = false;
		boardLanguage.value = null;
	}

	onLanguageSwitch(async () => {
		reset();
		await fetchBoard();
	});

	return {
		boardActivities,
		newLanguage,
		boardLanguage,
		reset,
		reviewSessionItems,
		customReviewSessionItems,
		pendingBundleReviewIds,
		fetchBoard,
		consumeActivity,
		fetchReviewSession,
		fetchCustomReviewSession,
		submitReview,
		finishReviewSession,
		setPendingBundleReview,
		stats,
		fetchStats
	};
});
