<template>
    <Modal :title="modalTitle" size="md" :modelValue="modelValue" :preventClose="preventClose" :hideClose="hideClose" @close="handleClose">
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
                            <Icon :name="iconName" class="h-8 w-8 text-purple-700 dark:text-purple-200" />
                        </div>
                        <h3
                            class="mb-3 bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-xl font-bold text-transparent dark:from-purple-300 dark:to-blue-300"
                        >
                            {{ mainMessage }}
                        </h3>
                        <p class="mx-auto max-w-sm leading-relaxed text-purple-600 dark:text-purple-300">
                            {{ subMessage }}
                        </p>
                    </div>
                </div>
            </div>
        </template>

        <template #footer="{ toggleModal }">
            <div class="flex justify-end space-x-3 pt-2">
                <Button
                    v-if="showSecondaryButton"
                    @click="handleSecondaryAction(toggleModal)"
                    :label="secondaryButtonLabel"
                    class="border border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-600 dark:text-purple-300 dark:hover:bg-purple-900/20"
                />
                <Button
                    color="primary"
                    @click="handlePrimaryAction(toggleModal)"
                    :label="primaryButtonLabel"
                    :iconName="primaryButtonIcon"
                    class="border-none bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md transition-all duration-300 hover:from-pink-600 hover:to-purple-700 hover:shadow-lg"
                />
            </div>
        </template>
    </Modal>
</template>

<script setup lang="ts">
    import { Button, Icon } from '@codebridger/lib-vue-components/elements.ts';
    import { Modal } from '@codebridger/lib-vue-components/complex.ts';
    import { analytic } from '~/plugins/mixpanel';

    const router = useRouter();

    // Props for customization
    const props = withDefaults(
        defineProps<{
            // Modal behavior props
            modelValue?: boolean;
            preventClose?: boolean;
            hideClose?: boolean;

            // Content props
            modalTitle?: string;
            mainMessage?: string;
            subMessage?: string;
            iconName?: string;

            // Button props
            primaryButtonLabel?: string;
            primaryButtonIcon?: string;
            secondaryButtonLabel?: string;
            showSecondaryButton?: boolean;

            // Behavior props
            autoRedirectOnUpgrade?: boolean;
        }>(),
        {
            // Default values - plain strings, translations handled by parent
            modalTitle: 'Upgrade Required',
            mainMessage: 'No free spots left',
            subMessage: 'Upgrade to Pro to access unlimited features.',
            iconName: 'IconLock',
            primaryButtonLabel: 'Go Pro!',
            primaryButtonIcon: 'IconCrown',
            secondaryButtonLabel: 'Continue with limits',
            showSecondaryButton: true,
            autoRedirectOnUpgrade: true,
            modelValue: false,
            preventClose: false,
            hideClose: false,
        }
    );

    watch(
        () => props.modelValue,
        (value) => {
            if (value === true) {
                analytic.track('upgrade-modal_opened');
            }
        },
        { immediate: true }
    );

    const emit = defineEmits<{
        'update:modelValue': [value: boolean];
        close: [];
        upgrade: [];
        secondary: [];
    }>();

    function handleClose() {
        emit('update:modelValue', false);
        emit('close');
    }

    function handlePrimaryAction(toggleModal?: (value: boolean) => void) {
        if (toggleModal) {
            toggleModal(false);
        } else {
            handleClose();
        }

        emit('upgrade');

        // Default behavior: redirect to subscription page (can be overridden by parent)
        if (props.autoRedirectOnUpgrade) {
            router.push('/settings/subscription');
            analytic.track('upgrade-cta_clicked');
        }
    }

    function handleSecondaryAction(toggleModal?: (value: boolean) => void) {
        if (toggleModal) {
            toggleModal(false);
        } else {
            handleClose();
        }

        emit('secondary');
    }
</script>
