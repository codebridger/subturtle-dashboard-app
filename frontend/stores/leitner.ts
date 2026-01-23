import { defineStore } from 'pinia';
import { functionProvider } from '@modular-rest/client';
import { type BoardActivityType, type LeitnerItemType } from '~/types/database.type';
import { analytic } from '~/plugins/mixpanel';

export const useLeitnerStore = defineStore('leitner', () => {
	// State
	const boardActivities = ref<BoardActivityType[]>([]);
	const reviewSessionItems = ref<LeitnerItemType[]>([]);

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
			// Optimistic update: remove from local state
			boardActivities.value = boardActivities.value.filter(a =>
				!(a.type === type && a.refId === refId)
			);
		} catch (error) {
			console.error('Failed to consume activity:', error);
		}
	}

	async function fetchReviewSession(limit: number = 20) {
		try {
			const items = await functionProvider.run({
				name: 'get-review-session',
				args: { limit }
			}) as LeitnerItemType[];

			reviewSessionItems.value = items || [];
			return items;
		} catch (error) {
			console.error('Failed to fetch review session:', error);
			return [];
		}
	}

	async function submitReview(phraseId: string, isCorrect: boolean) {
		try {
			await functionProvider.run({
				name: 'submit-review',
				args: { phraseId, isCorrect }
			});

			// Remove from local session to show progress (if needed)
			// Or just keep it. Typically we move to next card.

			analytic.track('leitner_review_submitted', { isCorrect });
		} catch (error) {
			console.error('Failed to submit review:', error);
		}
	}

	return {
		boardActivities,
		reviewSessionItems,
		fetchBoard,
		consumeActivity,
		fetchReviewSession,
		submitReview
	};
});
