<template>
    <Card shape="curved" :color="props.newPhrase ? 'primary' : 'default'">
        <div class="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
            <div>{{ props.number }}</div>

            <div class="flex space-x-2">
                <transition name="fade">
                    <IconButton
                        icon="IconChecks"
                        rounded="full"
                        size="sm"
                        v-if="getSubmitButtonStatus()"
                        :color="props.newPhrase ? 'default' : 'warning'"
                        @click="onSubmit"
                    />
                </transition>

                <IconButton icon="IconTrash" rounded="full" size="sm" :disabled="isSubmitting" @click="removePhrase" />
            </div>
        </div>
        <div class="flex space-x-4 p-5">
            <div class="flex-1">
                <TextArea
                    type="text"
                    label="Phrase"
                    :placeholder="t('bundle.phrase_card.phrase_placeholder')"
                    v-model="phrase"
                    :error="!!error"
                    :error-message="error || ''"
                    :loading="!!props.newPhrase && isSubmitting"
                />
            </div>

            <div class="flex-1">
                <TextArea
                    type="text"
                    label="Translation"
                    :placeholder="t('bundle.phrase_card.translation_placeholder')"
                    v-model="translation"
                    :error="!!error"
                    :error-message="error || ''"
                    :loading="!!props.newPhrase && isSubmitting"
                />
            </div>
        </div>
    </Card>
</template>

<script setup lang="ts">
    import { Card, IconButton, TextArea } from '@tiny-ideas-ir/lib-vue-components/elements.ts';
    import { useForm } from 'vee-validate';
    import { useBundleStore } from '~/stores/bundle';
    import * as yup from 'yup';
    import type { NewPhraseType, PhraseType } from '~/types/database.type';

    const { t } = useI18n();

    const bundleStore = useBundleStore();
    const isSubmitting = ref(false);
    const error = ref<string | null>(null);

    const props = defineProps({
        newPhrase: {
            type: Object as PropType<NewPhraseType | null>,
        },
        phrase: {
            type: Object as PropType<PhraseType | null>,
        },
        number: {
            type: Number as PropType<number>,
        },
    });

    const { defineField, errors, handleSubmit, resetForm, meta, isFieldDirty, validate } = useForm({
        validationSchema: yup.object({
            phrase: yup.string().required('Phrase is required'),
            translation: yup.string().required('Translation is required'),
        }),
        initialTouched: {
            phrase: false,
            translation: false,
        },
        initialValues: {
            phrase: props.phrase?.phrase || '',
            translation: props.phrase?.translation || '',
        },
    });

    const [phrase] = defineField('phrase');
    const [translation] = defineField('translation');

    function getSubmitButtonStatus() {
        const conditions = [isFieldDirty('phrase'), isFieldDirty('translation'), Object.keys(errors.value).length > 0];

        return conditions.some((condition) => condition);
    }

    const onSubmit = handleSubmit(async () => {
        const validated = await validate();

        if (!validated.valid || !meta.value.dirty) return;

        isSubmitting.value = true;

        // Update phrase
        if (props.phrase) {
            bundleStore
                .updatePhrase(props.phrase._id, {
                    phrase: phrase.value,
                    translation: translation.value,
                })
                .finally(() => {
                    isSubmitting.value = false;
                });

            resetForm({
                values: {
                    phrase: phrase?.value || '',
                    translation: translation?.value || '',
                },
            });
        }

        // Create new phrase
        else if (props.newPhrase) {
            bundleStore
                .createPhrase({
                    phrase: phrase.value,
                    translation: translation.value,
                    id: props.newPhrase.id,
                })
                .finally(() => {
                    isSubmitting.value = false;
                });
        }
    });

    function removePhrase() {
        isSubmitting.value = true;

        if (props.phrase) {
            bundleStore.removePhrase(props.phrase!._id).finally(() => {
                isSubmitting.value = false;
            });
        }

        // Remove new phrase
        else if (props.newPhrase) {
            bundleStore.removeTemporarilyPhrase(props.newPhrase.id);
        }
    }
</script>
