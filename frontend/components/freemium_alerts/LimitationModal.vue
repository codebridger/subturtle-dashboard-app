<template>
    <Modal :title="t('freemium.limitation.title')" size="md">
        <template #trigger="{ toggleModal }">
            <slot name="trigger" :toggleModal="toggleModal" />
        </template>

        <template #default>
            <div class="flex flex-col space-y-2 p-4">
                <div class="text-center">
                    <Icon name="IconLock" class="mx-auto mb-4 h-12 w-12 text-gray-400" />
                    <h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {{ t('freemium.limitation.no_free_spots_left') }}
                    </h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        {{ t('freemium.limitation.upgrade_to_pro_message') }}
                    </p>
                </div>
            </div>
        </template>

        <template #footer="{ toggleModal }">
            <div class="flex justify-end space-x-2">
                <Button @click="toggleModal(false)" :label="t('freemium.limitation.continue_with_limits')" />
                <Button
                    color="primary"
                    @click="
                        toggleModal(false);
                        handleUpgrade();
                    "
                    :label="t('freemium.limitation.go_pro')"
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
