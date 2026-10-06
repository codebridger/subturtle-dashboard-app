<template>
    <StButton :variant="variant" color="primary" icon="solar:add-circle-bold" @click="openForm">
        {{ t('bundle.add_new.action_add_new') }}
    </StButton>

    <StModal
        :open="isOpen"
        size="sm"
        :title="t('bundle.add_new.title')"
        :description="t('bundle.add_new.description')"
        :dismissible="!isPending"
        @close="closeForm"
    >
        <form class="flex flex-col gap-4" @submit.prevent="createBundle">
            <StInput
                v-model="title"
                :label="t('bundle.add_new.title_label')"
                :placeholder="t('bundle.add_new.title_placeholder')"
                :error="errors.title || submitError"
                autofocus
            />
            <StTextarea
                v-model="description"
                :label="t('bundle.add_new.desc_label')"
                :optional-label="t('bundle.add_new.desc_optional')"
                :placeholder="t('bundle.add_new.desc_placeholder')"
                :error="errors.description"
            />
            <!-- Enter submits; the visible button lives in the modal's actions slot, outside this form. -->
            <button type="submit" class="hidden" />
        </form>

        <template #actions>
            <StButton variant="ghost" color="neutral" :disabled="isPending" @click="closeForm">
                {{ t('bundle.add_new.action_cancel') }}
            </StButton>
            <StButton color="primary" :disabled="!isValidForm || isPending" @click="createBundle">
                {{ t('bundle.add_new.action_create') }}
            </StButton>
        </template>
    </StModal>
</template>

<script setup lang="ts">
    import { StButton, StInput, StModal, StTextarea } from 'subturtle-ui';
    import { dataProvider } from '@modular-rest/client';
    import { useForm } from 'vee-validate';
    import * as yup from 'yup';
    import { COLLECTIONS, DATABASE } from '~/types/database.type';
    import { analytic } from '~/plugins/mixpanel';
    const { t } = useI18n();

    const router = useRouter();

    withDefaults(defineProps<{ variant?: 'solid' | 'outline' }>(), { variant: 'solid' });

    const isOpen = ref(false);
    const isPending = ref(false);

    // Server-side rejection shown on the Name field. The toast below is the briefed feedback, but
    // pilotui's toaster resolves a `TairoToaster` component this app never registers, so it renders
    // nothing — without this the duplicate-title case would fail silently.
    const submitError = ref('');

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
        if (isPending.value) return;
        isOpen.value = false;
    }

    function openForm() {
        resetForm();
        submitError.value = '';
        isOpen.value = true;
    }

    function createBundle() {
        if (!isValidForm.value || isPending.value) return;

        isPending.value = true;
        submitError.value = '';

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
                // Analytics is best-effort: with no Mixpanel token (CI, e2e, local dev) track()
                // throws, and an unguarded call here lands in the .catch below — so a bundle that
                // was created fine reported an error and never navigated. Same guard as the
                // subscription page's pricing-page_viewed.
                try {
                    analytic.track('phrase-bundle_created');
                } catch (e) {
                    console.error('Failed to track phrase-bundle_created:', e);
                }

                isPending.value = false;
                isOpen.value = false;
                router.push({ path: '/bundles/' + _id });
            })
            .catch((err) => {
                isPending.value = false;

                // Rejections from the data provider carry `{ error }`; anything else (a thrown
                // TypeError, a network failure) does not, and blind destructuring hid the real one.
                const error: string = typeof err?.error === 'string' ? err.error : String(err?.message || err);

                if (error.includes('duplicate key error')) {
                    submitError.value = t('bundle.add_new.duplicate_title_desc');
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
