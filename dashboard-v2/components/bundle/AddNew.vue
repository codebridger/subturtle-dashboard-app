<template>
    <Button color="primary" class="w-full" @click="openForm">
        <Icon name="plus" />
        {{ t('bundle.add_new.action_add_new') }}
    </Button>

    <Modal v-model="isFormOpen">
        <template #header>
            <!-- Header -->
            <div class="flex w-full items-center justify-between p-4 md:p-6">
                <h3 class="font-heading text-lg font-medium leading-6 text-gray-900 dark:text-white">
                    {{ t('bundle.add_new.title') }}
                </h3>
            </div>
        </template>

        <div class="flex flex-col space-y-2 p-4">
            <Input :placeholder="t('bundle.add_new.title_placeholder')" v-model="title" :error="!!error" :error-message="error || ''" />
            <TextArea :placeholder="t('bundle.add_new.desc_placeholder')" v-model="description" :error="!!error" :error-message="error || ''" />
        </div>

        <template #footer="{ toggleModal }">
            <!-- Footer -->
            <div class="flex justify-end space-x-2">
                <Button @click="closeForm">
                    {{ t('bundle.add_new.action_cancel') }}
                </Button>

                <Button color="primary" @click="createBundle" :loading="isPending" :disabled="!isValidForm">
                    {{ t('bundle.add_new.action_create') }}
                </Button>
            </div>
        </template>
    </Modal>
</template>

<script setup lang="ts">
    import { Button, Icon, Input, TextArea } from '@tiny-ideas-ir/lib-vue-components/elements.ts';
    import { Modal } from '@tiny-ideas-ir/lib-vue-components/complex.ts';
    import { dataProvider } from '@modular-rest/client';
    import { useForm } from 'vee-validate';
    import * as yup from 'yup';
    import { COLLECTIONS, DATABASE } from '~/types/database.type';
    const { t } = useI18n();

    const router = useRouter();

    const error = ref<string | null>(null);
    const isFormOpen = ref(false);
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

    function closeForm() {
        isFormOpen.value = false;
    }

    function openForm() {
        resetForm();
        isFormOpen.value = true;
    }

    function createBundle() {
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
                isPending.value = false;
                router.push({ path: '/dashboard/bundles/' + _id });
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
