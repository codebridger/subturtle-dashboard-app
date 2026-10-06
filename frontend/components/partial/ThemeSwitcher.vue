<template>
    <StThemeSwitcher v-model="theme" size="md" variant="soft" persist-key="" :apply="false" :labels="labels" />
</template>

<script lang="ts" setup>
    import { StThemeSwitcher } from 'subturtle-ui';

    /**
     * The topbar theme control. Deliberately thin.
     *
     * `persist-key=""` and `:apply="false"` hand persistence and the `data-theme` attribute to
     * @nuxtjs/color-mode, which already owns both plus the pre-paint script that keeps a hard
     * reload from flashing. Two writers would fight over the same attribute and the same key.
     * The component still resolves `system` itself, because its tooltip and aria-label name what
     * `system` currently resolves to.
     */
    const { t } = useI18n();
    const { theme } = useAppTheme();

    // `aria` and `resolved` are passed as FORMATTERS, not as translated patterns. Handing
    // t('theme.aria') straight over would look right and be wrong: vue-i18n interpolates
    // {current}/{next} on the way out, so the placeholders arrive already blanked.
    const labels = computed(() => ({
        light: t('theme.light'),
        dark: t('theme.dark'),
        system: t('theme.system'),
        aria: (current: string, next: string) => t('theme.aria', { current, next }),
        resolved: (mode: string, resolved: string) => t('theme.resolved', { mode, resolved }),
    }));
</script>
