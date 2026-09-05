<template>
    <StCard padding="none" elevation="none" :class="isNew ? 'border-st-primary/40' : ''">
        <!-- Header: the phrase's number in the bundle, where it was captured, and the row's
             actions. The design shows only the number and the source; the actions are ours, so
             they sit quietly at the end of the row and come up to full strength on hover. -->
        <div class="flex items-center gap-3 px-[18px] pt-[18px]">
            <span class="rounded-st-pill bg-st-ink-100 px-2.5 py-1 text-st-2xs font-extrabold tracking-[0.04em] text-st-ink-700">
                {{ isNew ? t('bundle.phrase_card.new_badge') : numberLabel }}
            </span>

            <span v-if="sourceLabel" class="flex min-w-0 items-center gap-1.5 text-st-sm font-semibold text-st-faint">
                <StIcon :name="sourceIcon" :size="16" class="flex-none" />
                <span class="truncate">{{ sourceLabel }}</span>
            </span>

            <span class="ml-auto flex items-center gap-1 opacity-70 transition-opacity duration-200 focus-within:opacity-100 hover:opacity-100">
                <!-- Saving is explicit: it appears only once a field actually changed. -->
                <StIconButton
                    v-if="isDirty && !isLinguisticPhrase"
                    icon="solar:diskette-bold"
                    variant="ghost"
                    color="primary"
                    size="sm"
                    :disabled="!canSubmit"
                    :aria-label="t('bundle.phrase_card.save')"
                    @click="onSubmit"
                />

                <StIconButton
                    v-if="phrase.length > 0"
                    icon="solar:volume-loud-bold"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    :disabled="isLoadingAudio || isPlayingAudio"
                    :aria-label="t('bundle.phrase_card.play')"
                    @click="playPhraseAudio"
                />

                <StIconButton
                    icon="solar:trash-bin-minimalistic-bold"
                    variant="ghost"
                    color="danger"
                    size="sm"
                    :disabled="isSubmitting"
                    :aria-label="t('bundle.phrase_card.delete')"
                    @click="isNew ? removePhrase() : (isConfirmingDelete = true)"
                />
            </span>
        </div>

        <audio ref="phraseAudio" />

        <div class="grid grid-cols-1 gap-4 p-[18px] md:grid-cols-2">
            <StTextarea
                v-model="phrase"
                :label="t('phrase')"
                :placeholder="t('bundle.phrase_card.phrase_placeholder')"
                :error="error || errors.phrase"
                :disabled="isLinguisticPhrase || isSubmitting"
                :rows="2"
            />

            <StTextarea
                v-model="translation"
                :label="t('translation')"
                :placeholder="t('bundle.phrase_card.translation_placeholder')"
                :error="errors.translation"
                :disabled="isLinguisticPhrase || isSubmitting"
                :rows="2"
            />
        </div>
    </StCard>

    <StModal
        :open="isConfirmingDelete"
        size="sm"
        :title="t('bundle.phrase_card.confirm_deletion')"
        :description="t('bundle.phrase_card.confirm_deletion_message')"
        @close="isConfirmingDelete = false"
    >
        <template #actions>
            <StButton variant="ghost" color="neutral" @click="isConfirmingDelete = false">{{ t('cancel') }}</StButton>
            <StButton
                color="danger"
                @click="
                    isConfirmingDelete = false;
                    removePhrase();
                "
            >
                {{ t('remove') }}
            </StButton>
        </template>
    </StModal>
</template>

<script setup lang="ts">
    /**
     * One row of the bundle detail screen, rebuilt on subturtle-ui.
     *
     * The design draws a card with the phrase's position, its capture source and the two
     * editable fields. Editing keeps the behaviour it had on pilotui: a save button that only
     * appears once something changed, audio playback of the phrase, and deletion behind a
     * confirmation (for a saved phrase — an unsaved draft just disappears).
     */
    import { StButton, StCard, StIcon, StIconButton, StModal, StTextarea } from 'subturtle-ui';
    import { useForm } from 'vee-validate';
    import { useBundleStore } from '~/stores/bundle';
    import * as yup from 'yup';
    import type { NewPhraseType, PhraseType } from '~/types/database.type';
    import { useTemplateRef } from 'vue';
    import { functionProvider } from '@modular-rest/client';
    import { isVideoSource, phraseSourceLabel } from '~/utils/url';

    const { t } = useI18n();

    const bundleStore = useBundleStore();
    const isSubmitting = ref(false);
    const isConfirmingDelete = ref(false);
    const error = ref<string>('');

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

    const isNew = computed(() => !!props.newPhrase);

    /** Zero-padded like the design's "05" — but only while the bundle is small enough for it to read as one. */
    const numberLabel = computed(() => String(props.number ?? 0).padStart(2, '0'));

    const isLinguisticPhrase = computed(() => props.phrase?.type === 'linguistic');

    const sourceLabel = computed(() => phraseSourceLabel(props.phrase?.sourceUrl));
    const sourceIcon = computed(() => (isVideoSource(props.phrase?.sourceUrl) ? 'solar:videocamera-record-bold' : 'solar:link-minimalistic-2-linear'));

    // Show the same translation the user saw in the extension (translation.phrase),
    // not linguistic_data.definition (a whole-phrase explanation never shown on save).
    const translationValue = computed(() => props.phrase?.translation || '');

    const { defineField, errors, handleSubmit, resetForm, meta, isFieldDirty, validate } = useForm({
        validationSchema: yup.object({
            phrase: yup.string().required(t('bundle.phrase_card.phrase_required')),
            translation: yup.string().required(t('bundle.phrase_card.translation_required')),
        }),
        initialTouched: {
            phrase: false,
            translation: false,
        },
        initialValues: {
            phrase: props.phrase?.phrase || '',
            translation: translationValue.value,
        },
    });

    const [phrase] = defineField('phrase');
    const [translation] = defineField('translation');

    /** A linguistic phrase is read-only, so it never offers a save button. */
    const isDirty = computed(() => isFieldDirty('phrase') || isFieldDirty('translation') || Object.keys(errors.value).length > 0);

    const canSubmit = computed(() => !isSubmitting.value && !!phrase.value?.length && !!translation.value?.length);

    const onSubmit = handleSubmit(async () => {
        if (isLinguisticPhrase.value) return;

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
