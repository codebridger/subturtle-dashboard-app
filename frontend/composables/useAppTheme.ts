export type AppTheme = 'light' | 'dark' | 'system';

/**
 * The app's view of the theme switch: three states, with `system` following the OS.
 *
 * StThemeSwitcher binds to `theme` and is passed `persist-key=""` / `:apply="false"`, so
 * @nuxtjs/color-mode stays the single writer of both `subturtle:theme` and the `data-theme`
 * attribute.
 *
 * Thin on purpose. `@nuxtjs/color-mode` already persists the preference, resolves `system` from
 * `prefers-color-scheme`, keeps following it live via its own matchMedia listener, and stamps the
 * `data-theme` attribute on <html> before first paint. The side effects that are ours — the transition guard and the
 * pilotui mirror — are registered once in plugins/theme.client.ts, not here, so calling this from
 * several components is free.
 *
 * `theme` is what a switch binds to (the user's choice, which may be `system`); `resolved` is what
 * is actually on screen, for anything that has to branch on the real palette.
 */
export function useAppTheme() {
    const colorMode = useColorMode();

    const theme = computed<AppTheme>({
        get: () => colorMode.preference as AppTheme,
        set: (next) => {
            colorMode.preference = next;
        },
    });

    const resolved = computed<'light' | 'dark'>(() => (colorMode.value === 'dark' ? 'dark' : 'light'));

    return { theme, resolved };
}
