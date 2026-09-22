import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import type { StNavGroup } from 'subturtle-ui';

/**
 * Route for each nav id. StAppShell is id-based (it emits `navigate(id)`), so the mapping
 * from id to route lives here rather than on the items themselves.
 */
export const DASHBOARD_NAV_ROUTES: Record<string, string> = {
    stats: '/statistic',
    board: '/board',
    bundles: '/bundles',
    prefs: '/settings/preferences',
    newsession: '/sessions/new',
    sessions: '/sessions',
    plans: '/settings/subscription',
};

/** Longest-prefix match, so /bundles/:id still highlights "Phrase bundles". */
export const activeNavId = (path: string): string | undefined =>
    Object.entries(DASHBOARD_NAV_ROUTES)
        .filter(([, to]) => path === to || path.startsWith(`${to}/`))
        .sort((a, b) => b[1].length - a[1].length)[0]?.[0];

export interface DashboardNavBadges {
    /** Phrases due for review today — the nudge the design puts on "Today's board". */
    board?: number | null;
}

export const useDashboardNavigatorItems = (badges?: MaybeRefOrGetter<DashboardNavBadges>): ComputedRef<Array<StNavGroup>> => {
    // useI18n has to run during setup, so the groups are rebuilt inside a computed rather
    // than the composable being re-invoked whenever a badge changes.
    const { t } = useI18n();

    return computed(() => {
        const badge = toValue(badges) ?? {};

        return [
            {
                section: t('nav.overview'),
                items: [{ id: 'stats', label: t('nav.your-progress'), icon: 'solar:chart-2-bold-duotone' }],
            },
            {
                section: t('practice.title'),
                items: [
                    {
                        id: 'board',
                        label: t('nav.todays-board'),
                        icon: 'solar:rocket-2-bold-duotone',
                        badge: badge.board || null,
                    },
                    { id: 'bundles', label: t('bundle.nav'), icon: 'solar:notebook-bold-duotone' },
                    { id: 'prefs', label: t('preferences.nav'), icon: 'solar:settings-bold-duotone' },
                ],
            },
            {
                section: t('ai-coaching'),
                items: [
                    { id: 'newsession', label: t('nav.start-a-session'), icon: 'solar:microphone-3-bold-duotone' },
                    { id: 'sessions', label: t('live-session.session-history'), icon: 'solar:history-2-bold-duotone' },
                ],
            },
            {
                section: t('nav.account'),
                items: [{ id: 'plans', label: t('subscription.title'), icon: 'solar:crown-bold-duotone' }],
            },
        ];
    });
};
