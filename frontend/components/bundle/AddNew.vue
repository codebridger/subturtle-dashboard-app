<template>
    <Modal :title="t('bundle.add_new.title')">
        <template #trigger="{ toggleModal }">
            <Button
                color="primary"
                rounded="lg"
                class="w-full"
                @click="openForm(toggleModal)"
                iconName="IconPlus"
                :label="t('bundle.add_new.action_add_new')"
            />
        </template>

        <template #default>
            <div class="flex flex-col space-y-2 p-4">
                <Input :placeholder="t('bundle.add_new.title_placeholder')" v-model="title" :error="!!error" :error-message="error || ''" />
                <TextArea :placeholder="t('bundle.add_new.desc_placeholder')" v-model="description" :error="!!error" :error-message="error || ''" />
            </div>
        </template>

        <template #footer="{ toggleModal }">
            <!-- Footer -->
            <div class="flex justify-end space-x-2">
                <Button @click="closeForm(toggleModal)" :label="t('bundle.add_new.action_cancel')" />
                <Button
                    color="primary"
                    @click="createBundle(toggleModal)"
                    :loading="isPending"
                    :disabled="!isValidForm"
                    :label="t('bundle.add_new.action_create')"
                />
            </div>
        </template>
    </Modal>
</template>

<script setup lang="ts">
    import { Button, Input, TextArea } from '@codebridger/lib-vue-components/elements.ts';
    import { Modal } from '@codebridger/lib-vue-components/complex.ts';
    import { dataProvider } from '@modular-rest/client';
    import { useForm } from 'vee-validate';
    import * as yup from 'yup';
    import { COLLECTIONS, DATABASE } from '~/types/database.type';
    import { analytic } from '~/plugins/mixpanel';
    const { t } = useI18n();

    const router = useRouter();

    const error = ref<string | null>(null);
    const isPending = ref(false);

    const { errors, values, defineField, resetForm } = useForm({
        validationSchema: yup.object({
            title: yup.string().required(t('bundle.add_new.title_required')),
            description: yup.string().max(130, t('bundle.add_new.desc_max')),
        }),
    });

    const [title] = defineField('title', values.title);
    const [description] = defineField('description', values.description);

    const isValidForm = computed(() => {
        return title.value?.length && Object.keys(errors.value).length === 0;
    });

    function closeForm(toggleModal: (state: boolean) => void) {
        toggleModal(false);
    }

    function openForm(toggleModal: (state: boolean) => void) {
        resetForm();
        toggleModal(true);
    }

    function createBundle(toggleModal: (state: boolean) => void) {
        if (!isValidForm) return;

        isPending.value = true;

        dataProvider
            .insertOne({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PHRASE_BUNDLE,
                doc: {
                    title: title.value,
                    desc: description.value,
                    refId: authUser.value?.id,
                },
            })
            .then(({ _id }) => {
                analytic.track('phrase-bundle_created');

                isPending.value = false;
                toggleModal(false);
                router.push({ path: '/bundles/' + _id });
            })
            .catch(({ error }) => {
                isPending.value = false;

                if (error.includes('duplicate key error')) {
                    return toastError({
                        title: t('bundle.add_new.duplicate_title'),
                        message: t('bundle.add_new.duplicate_title_desc'),
                    });
                } else {
                    toastError({
                        title: t('bundle.add_new.error'),
                        message: error,
                    });
                }
            });
    }
</script>

<style>
    [role='dialog'] {
        /* 
    decrease the z-index of the modal to avoid overlapping with toast
   */
        z-index: 199 !important;
    }
</style>
