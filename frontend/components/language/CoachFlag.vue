<template>
    <div class="mt-1 flex items-center gap-2 text-[11px] font-bold">
        <template v-if="!flagged">
            <button type="button" class="inline-flex items-center gap-1 opacity-60 hover:underline hover:opacity-100" :disabled="busy" data-testid="coach-flag" @click="toggle(true)">
                <StIcon name="solar:flag-linear" :size="12" />
                {{ t('languages.coach.flag') }}
            </button>
        </template>
        <template v-else>
            <span class="text-st-jade-700">{{ t('languages.coach.flagged') }}</span>
            <button type="button" class="hover:underline" :disabled="busy" @click="toggle(false)">{{ t('languages.coach.undo') }}</button>
        </template>
    </div>
</template>

<script setup lang="ts">
    import { ANALYTICS_EVENTS } from '~/constants/analyticsEvents';
    import { StIcon } from 'subturtle-ui';
    import { trackLanguageEvent } from '~/stores/language';
    import { languageApi } from '~/utils/languageApi';

    /**
     * "This looks wrong" under a Coach line (D-16, Q10): flags the explanation for a check, then
     * "Thanks, we will check this explanation" with Undo. The toggle shows at once and rolls back
     * if the server says no. `turnIndex` counts the Coach's turns from 0.
     */
    const props = defineProps<{ sessionId?: string | null; turnIndex: number; language?: string | null }>();
    const { t } = useI18n();
    const flagged = ref(false);
    const busy = ref(false);

    async function toggle(on: boolean) {
        flagged.value = on;
        if (!props.sessionId) return;
        busy.value = true;
        try {
            await languageApi.flagCoachExplanation({ sessionId: props.sessionId, turnIndex: props.turnIndex, on });
            if (on) trackLanguageEvent(ANALYTICS_EVENTS.COACH_EXPLANATION_FLAGGED, { language: props.language, turn_index: props.turnIndex });
        } catch (error) {
            console.error('Flagging the explanation failed:', error);
            flagged.value = !on;
        } finally {
            busy.value = false;
        }
    }
</script>
