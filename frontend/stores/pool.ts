import { defineStore } from 'pinia';
import { functionProvider } from '@modular-rest/client';
import { type PoolItemType } from '~/types/database.type';
import { analytic } from '~/plugins/mixpanel';

/**
 * Pool RPC client — the first-encounter (encode) queue. New saves land here instead
 * of Leitner L1; the user works through them in chunks, and completing a session
 * promotes the reviewed phrases into L1. Mirrors the leitner store's shape.
 */
export const usePoolStore = defineStore('pool', () => {
	// State
	// Full pooled list, oldest first (from get-pool).
	const poolItems = ref<PoolItemType[]>([]);
	// The subset being worked through in the current encode session.
	const sessionItems = ref<PoolItemType[]>([]);

	const poolCount = computed(() => poolItems.value.length);

	// Actions

	async function fetchPool() {
		try {
			const items = await functionProvider.run({
				name: 'get-pool',
				args: { userId: authUser.value?.id }
			}) as PoolItemType[];

			poolItems.value = items || [];
			return poolItems.value;
		} catch (error) {
			console.error('Failed to fetch pool:', error);
			poolItems.value = [];
			return [];
		}
	}

	/**
	 * Load the next `size` pooled items (oldest first) into a session. `size`
	 * undefined runs the whole queue. Returns the loaded items.
	 */
	function startSession(size?: number): PoolItemType[] {
		const items = size ? poolItems.value.slice(0, size) : [...poolItems.value];
		sessionItems.value = items;
		if (items.length) {
			analytic.track('pool_session_started', { count: items.length });
		}
		return items;
	}

	/**
	 * Finish an encode session: promote the reviewed phrases into Leitner L1
	 * (encountered) and refresh the pool so the card reflects what's left.
	 */
	async function completeSession(phraseIds: string[]) {
		if (!phraseIds.length) return;
		try {
			await functionProvider.run({
				name: 'complete-pool-session',
				args: { phraseIds, userId: authUser.value?.id }
			});
			analytic.track('pool_session_completed', { count: phraseIds.length });
		} catch (error) {
			console.error('Failed to complete pool session:', error);
		} finally {
			await fetchPool();
		}
	}

	return {
		poolItems,
		sessionItems,
		poolCount,
		fetchPool,
		startSession,
		completeSession
	};
});
