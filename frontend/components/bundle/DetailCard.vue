<template>
    <VeeForm :validation-schema="schema" @submit="onSubmit" v-slot="{ handleSubmit }">
        <Card class="flex items-start justify-between p-5 shadow-none">
            <div class="flex-1">
                <Field v-if="isEditMode" name="title" :model-value="props.bundleDetail.title" v-slot="{ field, errors }">
                    <Input
                        :label="t('title')"
                        placeholder=""
                        :model-value="field.value"
                        :error="!!error"
                        :error-message="error || ''"
                        :disabled="isSubmitting"
                        type="text"
                        v-bind="field"
                    />
                </Field>
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white" v-else>{{ bundleDetail.title }}</h2>
                <p class="mt-2 text-gray-600 dark:text-gray-300">{{ bundleDetail.desc }}</p>
            </div>

            <div class="flex flex-1 justify-end">
                <Button
                    v-if="isSubmitting || isEditMode"
                    type="primary"
                    :loading="isSubmitting"
                    @click="handleSubmit(onSubmit)"
                    :label="t('bundle.detail_card.submit')"
                />

                <Dropdown v-else>
                    <template #trigger>
                        <IconButton size="sm" rounded="full" icon="IconHorizontalDots" />
                    </template>

                    <template #body="{ close }">
                        <ul class="w-[200px] !py-0 font-semibold text-dark dark:text-white-dark">
                            <li class="cursor-pointer">
                                <a
                                    class="flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    @click="
                                        isEditMode = true;
                                        close();
                                    "
                                >
                                    <div>
                                        <div class="font-semibold">{{ t('edit') }}</div>
                                        <div class="text-sm text-gray-400 dark:text-gray-300">{{ t('title_description') }}</div>
                                    </div>
                                </a>
                            </li>

                            <li class="cursor-pointer">
                                <!-- Delete Confirmation Modal -->
                                <Modal :title="t('bundle.detail_card.confirm_deletion')">
                                    <template #trigger="{ toggleModal }">
                                        <a
                                            class="flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                                            @click="
                                                toggleModal(true);
                                                close();
                                            "
                                        >
                                            <div>
                                                <div class="font-semibold">{{ t('remove') }}</div>
                                                <div class="text-sm text-gray-400 dark:text-gray-300">{{ t('bundle_pharase') }}</div>
                                            </div>
                                        </a>
                                    </template>

                                    <template #default>
                                        <div class="flex flex-col space-y-2 p-4">
                                            <p>{{ t('bundle.detail_card.confirm_deletion_message') }}</p>
                                        </div>
                                    </template>

                                    <template #footer="{ toggleModal }">
                                        <!-- Footer -->
                                        <div class="flex justify-end space-x-2">
                                            <Button @click="toggleModal(false)" :label="t('cancel')" />
                                            <Button color="danger" @click="confirmRemoveBundle(toggleModal)" :label="t('remove')" />
                                        </div>
                                    </template>
                                </Modal>
                            </li>
                        </ul>
                    </template>
                </Dropdown>
            </div>
        </Card>
    </VeeForm>
</template>

<script setup lang="ts">
    import { IconButton, Card, Input, Dropdown, Button } from '@codebridger/lib-vue-components/elements.ts';
    import { Modal } from '@codebridger/lib-vue-components/complex.ts';
    import { functionProvider, dataProvider } from '@modular-rest/client';
    import { Field, Form as VeeForm } from 'vee-validate';
    import * as yup from 'yup';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';
    import { analytic } from '~/plugins/mixpanel';
    import { useBundleStore } from '~/stores/bundle';

    const { t } = useI18n();

    const router = useRouter();

    const error = ref<string | null>(null);

    const props = defineProps({
        bundleDetail: {
            type: Object as PropType<PhraseBundleType>,
            required: true,
        },
    });

    const bundleStore = useBundleStore();

    const isSubmitting = ref(false);
    const isEditMode = ref(false);
    const schema = yup.object({
        title: yup.string().required(t('bundle.detail_card.title_required')),
    });

    function onSubmit(values: any) {
        if (isSubmitting.value) {
            return;
        }

        isSubmitting.value = true;
        isEditMode.value = false;

        bundleStore
            .updateBundleDetail(props.bundleDetail._id, {
                title: values.title,
            })
            .finally(() => {
                isSubmitting.value = false;
            });
    }

    function confirmRemoveBundle(toggleModal: (state: boolean) => void) {
        toggleModal(false);
        onRemove();
    }

    function onRemove() {
        bundleStore
            .removeBundle(props.bundleDetail._id)
            .then(() => {
                router.push('/bundles');
            })
            .catch((error) => {
                toastError({
                    title: 'Error',
                    message: error.error,
                });
            });
    }
</script>
