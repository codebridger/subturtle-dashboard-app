<template>
    <Card class="shadow-none" shape="curved" :color="props.newPhrase ? 'primary' : 'default'">
        <div class="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
            <div>{{ props.number }}</div>

            <GroupTransition name="fade" class="flex space-x-2">
                <IconButton
                    icon="IconChecks"
                    rounded="full"
                    size="sm"
                    v-if="getSubmitButtonStatus()"
                    :disabled="phrase.length === 0 || translation.length === 0"
                    :color="props.newPhrase ? 'default' : 'warning'"
                    @click="onSubmit"
                />

                <IconButton
                    icon="IconPlayCircle"
                    v-if="phrase.length > 0"
                    rounded="full"
                    size="sm"
                    @click="playPhraseAudio"
                    :disabled="isLoadingAudio || isPlayingAudio"
                />
                <!-- Delete Confirmation Modal -->
                <Modal :title="t('bundle.phrase_card.confirm_deletion')">
                    <template #trigger="{ toggleModal }">
                        <IconButton icon="IconTrash" rounded="full" size="sm" :disabled="isSubmitting" @click="toggleModal(true)" />
                    </template>

                    <template #default>
                        <div class="flex flex-col space-y-2 p-4">
                            <p>{{ t('bundle.phrase_card.confirm_deletion_message') }}</p>
                        </div>
                    </template>

                    <template #footer="{ toggleModal }">
                        <!-- Footer -->
                        <div class="flex justify-end space-x-2">
                            <Button @click="toggleModal(false)">Cancel</Button>
                            <Button color="danger" @click="confirmRemovePhrase(toggleModal)">Delete</Button>
                        </div>
                    </template>
                </Modal>
            </GroupTransition>
        </div>
        <div class="flex space-x-4 p-5">
            <div class="flex-1">
                <audio ref="phraseAudio" />
                <TextArea
                    type="text"
                    :label="t('phrase')"
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
                    :label="t('translation')"
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
    import { Card, IconButton, TextArea, Button } from '@codebridger/lib-vue-components/elements.ts';
    import { Modal } from '@codebridger/lib-vue-components/complex.ts';
    import { useForm } from 'vee-validate';
    import { useBundleStore } from '~/stores/bundle';
    import * as yup from 'yup';
    import type { NewPhraseType, PhraseType } from '~/types/database.type';
    import { useTemplateRef } from 'vue';
    import { functionProvider } from '@modular-rest/client';
    const { t } = useI18n();

    const bundleStore = useBundleStore();
    const isSubmitting = ref(false);
    const error = ref<string | null>(null);

    // Audio
    const isLoadingAudio = ref(false);
    const isPlayingAudio = ref(false);

    const phraseAudio = useTemplateRef<HTMLAudioElement>('phraseAudio');

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

    function confirmRemovePhrase(toggleModal: (state: boolean) => void) {
        toggleModal(false);
        removePhrase();
    }

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

    // Simple hash function for creating cache keys
    function simpleHash(str: string): string {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    async function playPhraseAudio() {
        isLoadingAudio.value = true;

        // Create a unique key for this audio content
        const voiceName = 'en-US-Wavenet-A';
        const cacheKey = `audio-${voiceName}-${simpleHash(phrase.value.toLocaleLowerCase())}`;

        // Check if audio is already cached
        let audioContent = localStorage.getItem(cacheKey);

        if (!audioContent) {
            // Audio not in cache, fetch from server
            audioContent = await functionProvider
                .run<string>({
                    name: 'textToSpeechBase64',
                    args: {
                        text: phrase.value,
                        voiceName: voiceName,
                    },
                })
                .catch((err) => null);

            // Store in localStorage if we got valid content
            if (audioContent) {
                try {
                    localStorage.setItem(cacheKey, audioContent);
                } catch (e) {
                    // Handle localStorage quota exceeded or other errors
                    console.warn('Failed to cache audio content:', e);
                }
            }
        }

        isLoadingAudio.value = false;

        if (!audioContent) return;

        phraseAudio.value!.src = audioContent;
        phraseAudio.value!.play();

        phraseAudio.value!.onplay = () => {
            isPlayingAudio.value = true;
        };

        phraseAudio.value!.onpause = () => {
            isPlayingAudio.value = false;
        };
    }
</script>
