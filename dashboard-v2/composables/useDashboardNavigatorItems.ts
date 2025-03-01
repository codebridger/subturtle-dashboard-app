import type { SidebarGroupType } from '@codebridger/lib-vue-components/types.ts';

export const useDashboardNavigatorItems = (): Array<SidebarGroupType> => {
  const { t } = useI18n();

  return [
    {
      title: '',
      children: [
        {
          title: t('dashboard.nav'),
          icon: 'IconMenuDashboard',
          child: [
            { title: t('statistic'), to: '/statistic' },
            { title: t('membership-plans.title'), to: '/membership-plans' },
            // { title: t('settings'), to: '' },
          ],
        },
        {
          title: t('bundle.nav'),
          icon: 'IconMenuDatatables',
          child: [{ title: t('bundle.list'), to: '/bundles' }],
        },
      ],
    },
  ];
};
