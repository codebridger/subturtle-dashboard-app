<template>
    <section v-if="isVisible" class="w-full">
        <Card
            class="border border-pink-200/50 bg-gradient-to-r from-pink-100 via-purple-50 to-blue-100 shadow-none backdrop-blur-sm transition-all duration-300 dark:border-purple-500/30 dark:from-pink-900/20 dark:via-purple-900/30 dark:to-blue-900/20"
        >
            <div class="flex items-center gap-4">
                <div class="flex flex-1 items-center gap-3">
                    <div
                        class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-200 to-purple-300 shadow-inner dark:from-pink-800 dark:to-purple-700"
                    >
                        <Icon name="IconBolt" class="h-5 w-5 text-purple-700 dark:text-purple-200" />
                    </div>
                    <div class="flex-1">
                        <div
                            class="bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-sm font-semibold text-transparent dark:from-purple-300 dark:to-blue-300"
                        >
                            {{ t('extension.nudge.title') }}
                        </div>
                        <div class="text-xs text-purple-600 dark:text-purple-300">
                            {{ t('extension.nudge.description') }}
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <Button
                        color="primary"
                        size="md"
                        iconName="IconPlay"
                        :label="t('extension.nudge.cta')"
                        @click="install"
                        class="border-none bg-gradient-to-r from-pink-500 to-purple-600 shadow-md transition-all duration-300 hover:from-pink-600 hover:to-purple-700 hover:shadow-lg"
                    />
                    <button
                        type="button"
                        :aria-label="t('extension.nudge.dismiss')"
                        @click="dismiss"
                        class="flex h-8 w-8 items-center justify-center rounded-full text-purple-700 transition-colors hover:bg-purple-200/60 dark:text-purple-200 dark:hover:bg-purple-800/60"
                    >
                        <Icon name="IconX" class="h-4 w-4" />
                    </button>
                </div>
            </div>
        </Card>
    </section>
</template>

<script setup lang="ts">
    import { Button, Card, Icon } from 'pilotui/elements';

    const { t } = useI18n();
    const config = useRuntimeConfig();
    const { extensionPresent } = useExtensionPresence();

    const STORAGE_KEY = 'extensionNudgeDismissed';
    const dismissed = ref(false);

    onMounted(() => {
        dismissed.value = sessionStorage.getItem(STORAGE_KEY) === '1';
    });

    const isVisible = computed(() => extensionPresent.value === false && !dismissed.value);

    function dismiss() {
        sessionStorage.setItem(STORAGE_KEY, '1');
        dismissed.value = true;
    }

    function install() {
        const url = config.public.chromeWebStoreUrl as string;
        window.open(url, '_blank', 'noopener,noreferrer');
    }
</script>
