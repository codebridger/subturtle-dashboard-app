import { useAppStore } from 'pilotui/store';

/**
 * Session-wide theme side effects. `@nuxtjs/color-mode` owns the preference and the
 * `light`/`dark` class on <html>; this plugin adds the two things it does not do.
 *
 * 1. Suppress transitions for the frame in which the palette swaps, so the page repaints in the
 *    new theme instead of cross-fading every colour independently.
 * 2. Mirror the preference into pilotui's app store, so the screens still on pilotui follow the
 *    same switch. They keep their own `dark:` styling — this only keeps the two in sync.
 *
 * Both live here rather than in a composable because they must be registered exactly once, before
 * any component can flip the theme.
 */
export default defineNuxtPlugin((nuxtApp) => {
    const colorMode = useColorMode();

    /**
     * `flush: 'sync'` matters. The colour-mode plugin registers its own watcher on the same source
     * to swap the class on <html>; ours has to have already added `theme-switching` by the time
     * that runs, and a sync watcher is the only flush that is guaranteed to. It also covers both
     * ways the resolved value can change — a click on the Appearance row, and an OS-level
     * `prefers-color-scheme` flip while the preference is `system` (which the module's own
     * matchMedia listener applies directly to `value`, never touching `preference`).
     */
    watch(
        () => colorMode.value,
        () => {
            const root = document.documentElement;
            root.classList.add('theme-switching');
            // Force a style recalculation so the suppression is in effect for the swap itself
            // rather than being coalesced with the removal below.
            void window.getComputedStyle(root).opacity;
            requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
        },
        { flush: 'sync' }
    );

    // Pinia is ready by app:mounted, and so is pilotui's <App> — before that, writing to the store
    // races with <App>'s own restore-from-localStorage on mount and the value can be clobbered.
    nuxtApp.hook('app:mounted', () => {
        const appStore = useAppStore();
        // Watches the RESOLVED value as well as the preference. pilotui resolves `system` against
        // the media query itself, at the moment toggleTheme() is called — so an OS-level flip, which
        // leaves `preference` on `system` and only moves `value`, has to re-poke it or the pilotui
        // screens would stay on the old palette while the `st-` surfaces flipped.
        watch([() => colorMode.preference, () => colorMode.value], () => appStore.toggleTheme(colorMode.preference), { immediate: true });
    });
});
