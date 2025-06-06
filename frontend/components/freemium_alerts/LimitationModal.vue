<template>
    <Modal :title="t('freemium.limitation.title')" size="md">
        <template #trigger="{ toggleModal }">
            <slot name="trigger" :toggleModal="toggleModal" />
        </template>

        <template #default>
            <div
                class="rounded-lg bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 backdrop-blur-sm dark:from-pink-900/20 dark:via-purple-900/30 dark:to-blue-900/20"
            >
                <div class="flex flex-col space-y-4 p-6">
                    <div class="text-center">
                        <div
                            class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-pink-200 to-purple-300 shadow-lg dark:from-pink-800 dark:to-purple-700"
                        >
                            <Icon name="IconLock" class="h-8 w-8 text-purple-700 dark:text-purple-200" />
                        </div>
                        <h3
                            class="mb-3 bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-xl font-bold text-transparent dark:from-purple-300 dark:to-blue-300"
                        >
                            {{ t('freemium.limitation.no_free_spots_left') }}
                        </h3>
                        <p class="mx-auto max-w-sm leading-relaxed text-purple-600 dark:text-purple-300">
                            {{ t('freemium.limitation.upgrade_to_pro_message') }}
                        </p>
                    </div>
                </div>
            </div>
        </template>

        <template #footer="{ toggleModal }">
            <div class="flex justify-end space-x-3 pt-2">
                <Button
                    @click="toggleModal(false)"
                    :label="t('freemium.limitation.continue_with_limits')"
                    class="border border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-600 dark:text-purple-300 dark:hover:bg-purple-900/20"
                />
                <Button
                    color="primary"
                    @click="
                        toggleModal(false);
                        handleUpgrade();
                    "
                    :label="t('freemium.limitation.go_pro')"
                    iconName="IconCrown"
                    class="border-none bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md transition-all duration-300 hover:from-pink-600 hover:to-purple-700 hover:shadow-lg"
                />
            </div>
        </template>
    </Modal>
</template>

<script setup lang="ts">
    import { Button, Icon } from '@codebridger/lib-vue-components/elements.ts';
    import { Modal } from '@codebridger/lib-vue-components/complex.ts';

    const { t } = useI18n();
    const router = useRouter();

    const emit = defineEmits<{
        upgrade: [];
    }>();

    function handleUpgrade() {
        emit('upgrade');
        // Default behavior: redirect to subscription page
        // Parent component can override this by listening to the upgrade event
        router.push('/settings/subscription');
    }
</script>
