import type { SidebarGroupType } from '@codebridger/lib-vue-components/types.ts';

export const useDashboardNavigatorItems = (): Array<SidebarGroupType> => {
  const { t } = useI18n();

  return [
    {
      title: t('dashboard.nav'),
      children: [
        {
          title: t('statistic'),
          icon: 'IconMenuDashboard',
          to: '/statistic',
          // child: [
          //   { title: t('statistic'), to: '/statistic' },
          //   // { title: t('membership-plans.title'), to: '/membership-plans' },
          //   // { title: t('settings'), to: '' },
          // ],
        },

      ],
    },
    {
      title: t('practice.nav'),
      children: [
        {
          title: t('bundle.nav'),
          icon: 'IconMenuDatatables',
          to: '/bundles',
          // child: [{ title: t('bundle.list'), to: '/bundles' }],
        },
      ]
    }
  ] as Array<SidebarGroupType>;
};
