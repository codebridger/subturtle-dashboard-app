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
                    title: t('live-session.start-new-session'),
                    icon: 'IconMenuDatatables',
                    to: '/sessions/new',
                },
                {
                    title: t('live-session.session-history'),
                    icon: 'iconify solar--history-2-bold',
                    to: '/sessions',
                },
            ],
        },
        {
            title: t('settings'),
            children: [
                {
                    title: t('profile.profile'),
                    icon: 'IconUser',
                    to: '/settings/profile',
                },
                {
                    title: t('subscription.title'),
                    icon: 'IconCreditCard',
                    to: '/settings/subscription',
                },
                // {
                //     title: t('billing.billing'),
                //     icon: 'IconClipboardText',
                //     to: '/settings/billing',
                // },
            ],
        },
    ] as Array<SidebarGroupType>;
};
