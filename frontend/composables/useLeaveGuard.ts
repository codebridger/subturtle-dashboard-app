import { onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

export type LeaveChoice = 'save' | 'leave' | 'stay';

export interface LeaveGuardOptions {
    /** True while leaving would throw something away. Read on every navigation, so it can be a plain getter. */
    when: () => boolean;
    /**
     * Runs when the learner picks "save" in the dialog. Resolve `true` once it is saved, and
     * the navigation goes on; `false` keeps them on the page (the caller shows why).
     */
    save?: () => Promise<boolean>;
}

/**
 * Asks before the learner walks away from something unsaved.
 *
 * Covers every way out of the page: a route change (sidebar link, the browser's back button,
 * `router.push`) through `onBeforeRouteLeave` and the dialog it drives, and a reload or tab
 * close through the browser's own `beforeunload` prompt, which cannot be restyled or given
 * choices. The page renders `LeaveGuardModal` bound to `open` and `choose`.
 *
 * Call `when` false before navigating on purpose (after a save, or a decision the page already
 * asked about) and the guard stays out of the way.
 */
export function useLeaveGuard(options: LeaveGuardOptions) {
    const open = ref(false);
    let resolveChoice: ((choice: LeaveChoice) => void) | null = null;

    function choose(choice: LeaveChoice) {
        resolveChoice?.(choice);
        resolveChoice = null;
        open.value = false;
    }

    onBeforeRouteLeave(async () => {
        if (!options.when()) return true;

        // A second navigation while the dialog is up (a double click on a link) answers the
        // first with "stay"; the dialog then belongs to the new one.
        resolveChoice?.('stay');
        open.value = true;
        const choice = await new Promise<LeaveChoice>((resolve) => (resolveChoice = resolve));

        if (choice === 'stay') return false;
        if (choice === 'leave') return true;
        return (await options.save?.()) ?? false;
    });

    function onBeforeUnload(event: BeforeUnloadEvent) {
        if (!options.when()) return;
        event.preventDefault();
        // Older browsers only show their prompt when returnValue is set.
        event.returnValue = '';
    }

    onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
    onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

    return { open, choose };
}
