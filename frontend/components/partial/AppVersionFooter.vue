<template>
    <div v-if="version" class="px-4 py-3 text-center text-xs text-gray-400 dark:text-gray-500">
        {{ t('app.version', { version }) }}
    </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const config = useRuntimeConfig();

// Baked in at build time from package.json (see nuxt.config.ts). Owned by
// semantic-release, so it reflects the latest released dashboard version.
const version = computed(() => config.public.APP_VERSION as string);
</script>
