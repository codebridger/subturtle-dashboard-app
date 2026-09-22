<template>
    <!--
        Decorative only: a blurred, tilted mock of Today's board with two phrase cards floating
        off its left edge, so a signed-out visitor can see what they are signing in to.

        aria-hidden and pointer-events-none — none of this copy describes real data, so it must
        never reach a screen reader or take focus.

        Shown from xl, not lg: the sign-in column is 540px and this box overhangs the right edge
        by 90px of its 780px, so anything under 1230px would put the floating phrase cards on top
        of the heading. Below that the column simply centres and this is dropped.
    -->
    <div
        aria-hidden="true"
        class="pointer-events-none absolute -right-[90px] top-1/2 z-[1] hidden h-[560px] w-[780px] -translate-y-1/2 [perspective:1400px] xl:block"
    >
        <div class="absolute inset-0 origin-left [transform:rotateY(-19deg)_rotateX(5deg)_rotate(-2deg)]">
            <div
                class="absolute inset-0 flex flex-col gap-5 overflow-hidden rounded-st-xl border border-st-line bg-st-page p-[34px] opacity-[0.92] shadow-st-xl blur-[4px]"
            >
                <div>
                    <div class="st-overline mb-[9px]">{{ t('auth.preview.today') }}</div>
                    <div class="font-st-display text-st-2xl font-black leading-[1.05] tracking-st-tight text-st-strong">
                        {{ t('auth.preview.board-title') }}
                    </div>
                    <div class="mt-2 text-st-md font-semibold text-st-muted">{{ t('auth.preview.board-subtitle') }}</div>
                </div>

                <div>
                    <div class="mb-3 text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">{{ t('auth.preview.due-today') }}</div>

                    <div class="grid grid-cols-3 gap-[14px]">
                        <!-- Smart Review — the due card, with its level pips and a solid CTA. -->
                        <div class="flex h-[270px] flex-col rounded-st-lg border border-st-line bg-st-card p-[22px] shadow-st-sm">
                            <div class="mb-[18px] flex items-start justify-between gap-[10px]">
                                <span class="flex h-[54px] w-[54px] items-center justify-center rounded-st-md bg-st-warning-soft text-st-amber-600">
                                    <StIcon name="solar:layers-minimalistic-bold-duotone" :size="29" />
                                </span>
                                <span
                                    class="inline-flex h-[22px] items-center rounded-st-pill bg-st-warning-soft px-[9px] text-st-2xs font-extrabold text-st-amber-600"
                                >
                                    {{ t('auth.preview.due') }}
                                </span>
                            </div>
                            <div class="mb-1.5 text-st-md font-extrabold text-st-strong">{{ t('auth.preview.review-title') }}</div>
                            <div class="text-st-sm font-semibold leading-[1.45] text-st-muted">{{ t('auth.preview.review-body') }}</div>
                            <div class="my-[18px] flex gap-1.5">
                                <span v-for="n in 5" :key="n" class="h-1.5 flex-1 rounded-st-pill" :class="n <= 3 ? 'bg-st-primary' : 'bg-st-ink-150'" />
                            </div>
                            <div class="mt-auto flex h-10 items-center justify-center gap-2 rounded-st-md bg-st-primary text-st-sm font-extrabold text-white">
                                {{ t('auth.preview.start-review') }}
                            </div>
                        </div>

                        <!-- Live session — same shell, outline CTA. -->
                        <div class="flex h-[270px] flex-col rounded-st-lg border border-st-line bg-st-card p-[22px] shadow-st-sm">
                            <div class="mb-[18px] flex items-start justify-between gap-[10px]">
                                <span class="flex h-[54px] w-[54px] items-center justify-center rounded-st-md bg-st-primary-soft text-st-rose-600">
                                    <StIcon name="solar:microphone-3-bold-duotone" :size="29" />
                                </span>
                                <span class="text-st-xs font-bold text-st-faint">{{ t('auth.preview.time-left') }}</span>
                            </div>
                            <div class="mb-1.5 text-st-md font-extrabold text-st-strong">{{ t('auth.preview.session-title') }}</div>
                            <div class="text-st-sm font-semibold leading-[1.45] text-st-muted">{{ t('auth.preview.session-body') }}</div>
                            <div
                                class="mt-auto flex h-10 items-center justify-center gap-2 rounded-st-md border-[1.5px] border-st-primary text-st-sm font-extrabold text-st-rose-700"
                            >
                                {{ t('auth.preview.start-session') }}
                            </div>
                        </div>

                        <!-- Resting — sunken, no border or shadow: nothing to do here. -->
                        <div class="flex h-[270px] flex-col rounded-st-lg bg-st-sunken p-[22px]">
                            <span class="mb-[18px] flex h-[54px] w-[54px] items-center justify-center rounded-st-md bg-st-card text-st-faint">
                                <StIcon name="solar:moon-sleep-bold-duotone" :size="28" />
                            </span>
                            <div class="mb-1.5 text-st-md font-extrabold text-st-body">{{ t('auth.preview.resting-title') }}</div>
                            <div class="text-st-sm font-semibold leading-[1.45] text-st-muted">{{ t('auth.preview.resting-body') }}</div>
                        </div>
                    </div>
                </div>

                <div class="text-st-2xs font-extrabold uppercase tracking-st-caps text-st-faint">{{ t('auth.preview.optional') }}</div>
            </div>
        </div>

        <!-- The two phrase cards float in front of the board, unblurred, so the eye lands on
             the one thing the product is actually about. -->
        <div class="absolute -left-[58px] top-16 w-[290px] rotate-[-5deg]">
            <div class="rounded-st-lg border border-st-line bg-st-card px-5 py-[18px] shadow-st-xl">
                <div class="text-st-md font-extrabold text-st-strong">{{ t('auth.preview.phrase-1') }}</div>
                <div class="mt-[5px] text-st-sm font-semibold text-st-muted">{{ t('auth.preview.phrase-1-translation') }}</div>
            </div>
        </div>
        <div class="absolute -left-6 bottom-[78px] w-[258px] rotate-[4deg]">
            <div class="rounded-st-lg border border-st-line bg-st-card px-5 py-[18px] shadow-st-lg">
                <div class="text-st-md font-extrabold text-st-strong">{{ t('auth.preview.phrase-2') }}</div>
                <div class="mt-[5px] text-st-sm font-semibold text-st-muted">{{ t('auth.preview.phrase-2-translation') }}</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { StIcon } from 'subturtle-ui';

    const { t } = useI18n();
</script>
