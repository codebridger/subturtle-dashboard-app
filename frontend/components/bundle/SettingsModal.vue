<template>
    <StModal
        :open="open"
        size="sm"
        :title="t('bundle.settings.title')"
        :description="t('bundle.settings.description')"
        :dismissible="!isPending"
        @close="close"
    >
        <form class="flex flex-col gap-4" @submit.prevent="save">
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

        <!-- Deleting takes the bundle and its phrases with it, so it is kept away from Save:
             below the divider, and behind its own confirmation. -->
        <div class="mt-5 border-t border-st-line pt-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div class="text-st-sm font-extrabold text-st-strong">{{ t('bundle.settings.delete_title') }}</div>
                    <p class="mt-0.5 text-st-sm font-semibold text-st-muted">{{ t('bundle.settings.delete_description') }}</p>
                </div>
                <StButton
                    variant="outline"
                    color="danger"
                    size="sm"
                    icon="solar:trash-bin-minimalistic-bold"
                    :disabled="isPending"
                    @click="isConfirmingDelete = true"
                >
                    {{ t('remove') }}
                </StButton>
            </div>
        </div>

        <template #actions>
            <StButton variant="ghost" color="neutral" :disabled="isPending" @click="close">{{ t('cancel') }}</StButton>
            <StButton color="primary" :disabled="!isValidForm || isPending" @click="save">{{ t('bundle.settings.save') }}</StButton>
        </template>
    </StModal>

    <StModal
        :open="isConfirmingDelete"
        size="sm"
        :title="t('bundle.detail_card.confirm_deletion')"
        :description="t('bundle.detail_card.confirm_deletion_message')"
        :dismissible="!isPending"
        @close="isConfirmingDelete = false"
    >
        <template #actions>
            <StButton variant="ghost" color="neutral" :disabled="isPending" @click="isConfirmingDelete = false">{{ t('cancel') }}</StButton>
            <StButton color="danger" :disabled="isPending" @click="remove">{{ t('remove') }}</StButton>
        </template>
    </StModal>
</template>

<script setup lang="ts">
    /**
     * Rename or delete one bundle.
     *
     * The redesigned detail screen puts the bundle's name in the page header rather than in an
     * editable card, so the edit affordances that used to live on `DetailCard.vue` moved here,
     * behind the header's overflow button.
     */
    import { StButton, StInput, StModal, StTextarea } from 'subturtle-ui';
    import { useForm } from 'vee-validate';
    import * as yup from 'yup';
    import type { PhraseBundleType } from '~/types/database.type';
    import { useBundleStore } from '~/stores/bundle';

    const { t } = useI18n();
    const router = useRouter();
    const bundleStore = useBundleStore();

    const props = defineProps<{
        open: boolean;
        bundle: PhraseBundleType;
    }>();

    const emit = defineEmits<{ close: [] }>();

    const isPending = ref(false);
    const isConfirmingDelete = ref(false);
    const submitError = ref('');

    const { errors, defineField, resetForm } = useForm({
        validationSchema: yup.object({
            title: yup.string().required(t('bundle.detail_card.title_required')),
            description: yup.string().max(130, t('bundle.add_new.desc_max')),
        }),
        initialValues: {
            title: props.bundle.title,
            description: props.bundle.desc,
        },
    });

    const [title] = defineField('title');
    const [description] = defineField('description');

    const isValidForm = computed(() => !!title.value?.length && Object.keys(errors.value).length === 0);

    // Reopening starts from what is stored, so an abandoned edit is never carried over.
    watch(
        () => props.open,
        (open) => {
            if (!open) return;
            submitError.value = '';
            isConfirmingDelete.value = false;
            resetForm({ values: { title: props.bundle.title, description: props.bundle.desc } });
        }
    );

    function close() {
        if (isPending.value) return;
        emit('close');
    }

    function save() {
        if (!isValidForm.value || isPending.value) return;

        isPending.value = true;
        submitError.value = '';

        bundleStore
            .updateBundleDetail(props.bundle._id, { title: title.value, desc: description.value })
            .then(() => emit('close'))
            .catch((err) => {
                const message: string = typeof err?.error === 'string' ? err.error : String(err?.message || err);
                submitError.value = message.includes('duplicate key error') ? t('bundle.add_new.duplicate_title_desc') : message;
            })
            .finally(() => {
                isPending.value = false;
            });
    }

    function remove() {
        if (isPending.value) return;

        isPending.value = true;

        bundleStore
            .removeBundle(props.bundle._id)
            .then(() => {
                emit('close');
                router.push('/bundles');
            })
            .catch((err) => {
                toastError({ title: t('bundle.settings.delete_failed'), message: typeof err?.error === 'string' ? err.error : String(err?.message || err) });
            })
            .finally(() => {
                isPending.value = false;
                isConfirmingDelete.value = false;
            });
    }
</script>
