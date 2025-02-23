<template>
    <VeeForm :validation-schema="schema" @submit="onSubmit" v-slot="{ handleSubmit }">
        <Card class="flex items-start justify-between p-5">
            <div class="flex-1">
                <Field v-if="isEditMode" name="title" :model-value="props.bundleDetail.title" v-slot="{ field, errors }">
                    <Input
                        label="Title"
                        placeholder="Avengers - Season 1"
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
                <Button v-if="isSubmitting || isEditMode" color="primary" :loading="isSubmitting" @click="handleSubmit(onSubmit)">
                    {{ t('bundle.detail.card.submit') }}
                </Button>

                <Dropdown :loading="true" v-else variant="context" label="Options" placement="bottom-start">
                    <DropdownItem title="Edit" text="The title and description" rounded="sm" @click="isEditMode = true" />

                    <DropdownItem title="Remove" text="The Bundle and phrases" rounded="sm" @click="onRemove" />
                </Dropdown>
            </div>
        </Card>
    </VeeForm>
</template>

<script setup lang="ts">
    import { Button, Card, Input, Dropdown } from '@tiny-ideas-ir/lib-vue-components/elements.ts';
    import { functionProvider, dataProvider } from '@modular-rest/client';
    import { Field, Form as VeeForm } from 'vee-validate';
    import * as yup from 'yup';
    import { COLLECTIONS, DATABASE, type PhraseBundleType } from '~/types/database.type';

    const { t } = useI18n();

    const router = useRouter();

    const error = ref<string | null>(null);

    const props = defineProps({
        bundleDetail: {
            type: Object as PropType<PhraseBundleType>,
            required: true,
        },
    });

    const emit = defineEmits<{
        changed: [values: { [key: string]: any }];
        removed: [];
    }>();

    const isSubmitting = ref(false);
    const isEditMode = ref(false);
    const schema = yup.object({
        title: yup.string().required(t('bundle.detail.card.title_required')),
    });

    function onSubmit(values: any) {
        isSubmitting.value = true;
        isEditMode.value = false;

        dataProvider
            .updateOne({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PHRASE_BUNDLE,
                query: {
                    _id: props.bundleDetail._id,
                    refId: authUser.value?.id,
                },
                update: {
                    $set: {
                        title: values.title,
                    },
                },
            })
            .then(() => {
                emit('changed', values);
            })
            .finally(() => {
                isSubmitting.value = false;
            });
    }

    function onRemove() {
        functionProvider
            .run({
                name: 'removeBundle',
                args: {
                    _id: props.bundleDetail._id,
                    refId: authUser.value?.id,
                },
            })
            .then(() => {
                router.push('/bundles');
            })
            .catch((error) => {
                debugger;
                toastError({
                    title: 'Error',
                    message: error.error,
                });
            });
    }
</script>
