import type { SidebarGroupType } from '@codebridger/lib-vue-components/types.ts';

export const useDashboardNavigatorItems = (): Array<SidebarGroupType> => {
    const { t } = useI18n();

    return [
        {
            title: t('dashboard'),
            children: [
                {
                    title: t('statistic.your-statistic'),
                    icon: 'IconMenuDashboard',
                    to: '/statistic',
                },
                {
                    title: t('bundle.nav'),
                    icon: 'IconMenuDatatables',
                    to: '/bundles',
                },
            ],
        },
        {
            title: t('ai-coaching'),
            children: [
                {
                    title: t('live-session.session-history'),
                    icon: 'iconify solar--history-2-bold',
                    to: '/sessions',
                },
            ],
        },
    ] as Array<SidebarGroupType>;
};
