import type { SidebarGroupType } from '@tiny-ideas-ir/lib-vue-components/types.ts';

export const useDashboardNavigatorItems = (): Array<SidebarGroupType> => {
  const { t } = useI18n();

  return [
    {
      title: '',
      children: [
        {
          title: t('dashboard'),
          icon: 'IconMenuDashboard',
          child: [
            { title: t('statistic'), to: '/statistic' },
            { title: t('membership-plans'), to: '/membership-plans' },
            // { title: t('settings'), to: '' },
          ],
        },
        {
          title: t('automation'),
          icon: 'IconMenuDatatables',
          child: [{ title: t('scenario-list'), to: '/automation/scenario-list' }],
        },
      ],
    },
  ];
};
