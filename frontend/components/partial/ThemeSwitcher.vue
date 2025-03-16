<template>
    <div :class="$attrs.class">
        <div class="flex items-center space-x-2">
            <IconButton size="md" icon="IconLaptop" v-show="store.theme === 'system'" @click="store.toggleTheme('light')" />
            <IconButton size="md" icon="IconMoon" v-show="store.theme === 'dark'" @click="store.toggleTheme('system')" />
            <IconButton size="md" icon="IconSun" v-show="store.theme === 'light'" @click="store.toggleTheme('dark')" />
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { useAppStore } from '@codebridger/lib-vue-components/store.ts';
    import { IconButton } from '@codebridger/lib-vue-components/elements.ts';

    const store = useAppStore();
</script>
