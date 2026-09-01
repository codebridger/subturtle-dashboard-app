<template>
    <StThemeSwitch v-model="theme" :labels="labels" />
</template>

<script lang="ts" setup>
    import { StThemeSwitch } from 'subturtle-ui';

    /**
     * The topbar's Light / Dark / System control, sitting immediately before the profile menu.
     * Thin by design: @nuxtjs/color-mode persists the preference and resolves `system`, and
     * plugins/theme.client.ts owns the transition guard and the pilotui mirror.
     */
    const { t } = useI18n();
    const { theme } = useAppTheme();

    const labels = computed(() => ({
        appearance: t('appearance.label'),
        light: t('appearance.light'),
        dark: t('appearance.dark'),
        system: t('appearance.system'),
    }));
</script>
