<template>
    <!-- Closing it (Escape, the backdrop, the corner button) means "stay": the safe answer. -->
    <StModal :open="open" :title="title" size="sm" :dismissible="!busy" @close="emit('choose', 'stay')">
        <p class="text-st-base font-semibold leading-normal text-st-body">{{ message }}</p>
        <template #actions>
            <StButton variant="ghost" color="neutral" :disabled="busy" data-testid="leave-guard-leave" @click="emit('choose', 'leave')">{{
                leaveLabel
            }}</StButton>
            <StButton v-if="saveLabel" color="primary" :disabled="busy" data-testid="leave-guard-save" @click="emit('choose', 'save')">{{
                saveLabel
            }}</StButton>
            <StButton v-else color="primary" :disabled="busy" data-testid="leave-guard-stay" @click="emit('choose', 'stay')">{{ stayLabel }}</StButton>
        </template>
    </StModal>
</template>

<script setup lang="ts">
    import { StButton, StModal } from 'subturtle-ui';
    import type { LeaveChoice } from '~/composables/useLeaveGuard';

    /**
     * The dialog behind `useLeaveGuard`. With `saveLabel` it offers save-or-leave (a result the
     * learner has not saved yet); without it, leave-or-stay (a draft that cannot be saved from
     * here).
     */
    defineProps<{
        open: boolean;
        title: string;
        message: string;
        leaveLabel: string;
        saveLabel?: string;
        stayLabel?: string;
        busy?: boolean;
    }>();

    const emit = defineEmits<{ choose: [choice: LeaveChoice] }>();
</script>
