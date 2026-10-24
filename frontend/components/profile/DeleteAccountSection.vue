<template>
    <StCard data-testid="delete-account-section">
        <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0">
                <h2 class="text-st-md font-extrabold tracking-st-tight text-st-strong">{{ t('account.delete.section-title') }}</h2>
                <p class="mt-1 text-st-sm font-semibold text-st-muted">{{ t('account.delete.section-body') }}</p>
            </div>
            <StButton variant="outline" color="danger" data-testid="delete-account-open" @click="openDialog">
                {{ t('account.delete.open') }}
            </StButton>
        </div>

        <!-- Not dismissible while the call runs: closing the dialog would hide the outcome. -->
        <StModal v-if="open" :title="t('account.delete.title')" size="sm" :dismissible="!deleting" @close="closeDialog">
            <p class="text-st-base font-semibold leading-normal text-st-body">{{ t('account.delete.message') }}</p>
            <p v-if="errorMessage" role="alert" class="mt-3 text-st-sm font-bold text-st-red-600" data-testid="delete-account-error">
                {{ errorMessage }}
            </p>
            <template #actions>
                <StButton variant="ghost" color="neutral" :disabled="deleting" @click="closeDialog">{{ t('cancel') }}</StButton>
                <StButton color="danger" :disabled="deleting" data-testid="delete-account-confirm" @click="confirmDelete">
                    {{ deleting ? t('account.delete.deleting') : t('account.delete.confirm') }}
                </StButton>
            </template>
        </StModal>
    </StCard>
</template>

<script lang="ts" setup>
    import { ref } from 'vue';
    import { StButton, StCard, StModal } from 'subturtle-ui';
    import { useProfileStore } from '~/stores/profile';
    import { deleteAccount } from '~/utils/accountApi';

    const { t } = useI18n();
    const profileStore = useProfileStore();

    const open = ref(false);
    const deleting = ref(false);
    const errorMessage = ref('');

    function openDialog() {
        errorMessage.value = '';
        open.value = true;
    }

    function closeDialog() {
        if (!deleting.value) open.value = false;
    }

    async function confirmDelete() {
        if (deleting.value) return;
        deleting.value = true;
        errorMessage.value = '';
        try {
            await deleteAccount();
        } catch (error: any) {
            // The server stops before deleting anything when Stripe cannot cancel the
            // subscription, and says why; show that so the learner knows to retry.
            errorMessage.value = error?.message ? t('account.delete.failed-with-reason', { reason: error.message }) : t('account.delete.failed');
            deleting.value = false;
            return;
        }

        // Same exit as the sign-out dialog: the account is gone, so clear the session and hard
        // reload, which the auth middleware turns into the login screen.
        profileStore.logout();
        window.location.reload();
    }
</script>
