<template>
    <div class="h-screen bg-slate-200">
        <BaseButtons>
            <Button>{{ t('save') }}</Button>
            <Button @click="() => close()">{{ t('cancel') }}</Button>
        </BaseButtons>
    </div>
</template>

<script setup lang="ts">
    import { Button } from '@tiny-ideas-ir/lib-vue-components/elements.ts';
    const { t } = useI18n();
    // Eiter define events
    const emits = defineEmits<{
        (event: 'save', info: any): void;
    }>();

    // And use panels utils
    const { close } = usePanels();
</script>
