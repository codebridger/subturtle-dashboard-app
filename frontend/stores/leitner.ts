import { defineStore } from 'pinia';
import { functionProvider } from '@modular-rest/client';
import { type BoardActivityType, type LeitnerItemType } from '~/types/database.type';
import { analytic } from '~/plugins/mixpanel';

export const useLeitnerStore = defineStore('leitner', () => {
	// State
	// State
	const boardActivities = ref<BoardActivityType[]>([]);
	const reviewSessionItems = ref<LeitnerItemType[]>([]);
	const customReviewSessionItems = ref<LeitnerItemType[]>([]);
	const pendingBundleReviewIds = ref<string[]>([]);

	// Actions

	async function fetchBoard() {
		try {
			// functionProvider.run calls the server-side function 'get-board'
			// Using kebab-case as defined in functions.ts permissions/name
			const activities = await functionProvider.run({
				name: 'get-board',
				args: {
					userId: authUser.value?.id
				}
			}) as BoardActivityType[];

			boardActivities.value = activities || [];
		} catch (error) {
			console.error('Failed to fetch board:', error);
			boardActivities.value = [];
		}
	}

	async function consumeActivity(type: string, refId?: string) {
		try {
			await functionProvider.run({
				name: 'consume-activity',
				args: { type, refId, userId: authUser.value?.id }
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
				args: { limit, userId: authUser.value?.id }
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
				args: { phraseIds, userId: authUser.value?.id }
			}) as LeitnerItemType[];

			customReviewSessionItems.value = items || [];
			return items;
		} catch (error) {
			console.error('Failed to fetch custom review session:', error);
			return [];
		}
	}

	async function submitReview(phraseId: string, isCorrect: boolean) {
		try {
			await functionProvider.run({
				name: 'submit-review',
				args: { phraseId, isCorrect, userId: authUser.value?.id }
			});

			// Remove from local session to show progress (if needed)
			// Or just keep it. Typically we move to next card.

			analytic.track('leitner_review_submitted', { isCorrect });
		} catch (error) {
			console.error('Failed to submit review:', error);
		}
	}

	function setPendingBundleReview(phraseIds: string[]) {
		pendingBundleReviewIds.value = phraseIds;
	}

	return {
		boardActivities,
		reviewSessionItems,
		customReviewSessionItems,
		pendingBundleReviewIds,
		fetchBoard,
		consumeActivity,
		fetchReviewSession,
		fetchCustomReviewSession,
		submitReview,
		setPendingBundleReview
	};
});
