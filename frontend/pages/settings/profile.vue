<template>
    <div class="flex flex-col gap-5">
        <StPageHeader :title="t('profile.title')" :overline="t('profile.overline')" :subtitle="t('profile.subtitle')" />

        <!-- The form is a single column of one card; 940px keeps the two-up field grid from
             stretching the inputs across the full shell width on a wide screen. -->
        <div class="mx-auto flex w-full max-w-[940px] flex-col gap-5">
            <!-- Loading: the shape of the card that lands, so nothing jumps. -->
            <StCard v-if="loading" padding="lg">
                <div class="flex items-center gap-[18px]">
                    <StSkeleton class="h-[72px] w-[72px] rounded-full" />
                    <div>
                        <StSkeleton class="h-5 w-[180px]" />
                        <StSkeleton class="mt-2 h-3 w-[260px]" />
                    </div>
                </div>
                <div class="my-[22px] h-px bg-st-line" />
                <StSkeleton class="mb-4 h-[19px] w-[190px]" />
                <div class="grid grid-cols-1 gap-[18px_20px] sm:grid-cols-2">
                    <StSkeleton class="h-[72px]" />
                    <StSkeleton class="h-[72px]" />
                    <StSkeleton class="h-[72px]" />
                    <StSkeleton class="h-[72px]" />
                </div>
                <StSkeleton class="ml-auto mt-[22px] h-5 w-[320px]" />
            </StCard>

            <StCard v-else>
                <!-- Identity banner: everything Google owns, plus the clock for the selected zone -->
                <div class="flex flex-wrap items-center justify-between gap-6 rounded-st-lg bg-st-sunken px-5 py-[18px]">
                    <div class="flex min-w-0 items-center gap-4">
                        <StAvatar size="lg" :name="name" :src="profilePicture" />
                        <div class="min-w-0">
                            <div class="truncate font-st-display text-st-lg font-black tracking-st-tight text-st-strong">
                                {{ name || t('profile.full-name') }}
                            </div>
                            <p class="mt-[5px] flex items-center gap-[7px] truncate text-st-xs font-bold text-st-body">
                                <StIcon name="logos:google-icon" :size="13" class="flex-none" />
                                {{ email }}
                            </p>
                        </div>
                    </div>

                    <div class="flex-none text-right">
                        <div class="text-st-2xs font-extrabold uppercase tracking-st-caps text-st-body">{{ t('profile.local_time') }}</div>
                        <div class="mt-1 font-st-display text-st-lg font-black tabular-nums tracking-st-tight text-st-strong">{{ localTime }}</div>
                        <div class="mt-0.5 text-st-xs font-bold text-st-body">{{ displayZone }}</div>
                    </div>
                </div>

                <h2 class="mb-[14px] mt-[22px] text-st-md font-extrabold tracking-st-tight text-st-strong">
                    {{ t('profile.personal_information') }}
                </h2>

                <form class="grid grid-cols-1 items-start gap-[16px_20px] sm:grid-cols-2" @submit.prevent="handleSubmit">
                    <StInput v-model="name" :label="t('profile.full-name')" :placeholder="t('profile.full-name')" :disabled="isSubmitting" />

                    <StInput :label="t('profile.email')" :model-value="email" type="email" disabled :hint="t('profile.email_hint')" />

                    <div>
                        <span class="mb-1.5 block text-st-sm font-extrabold text-st-body">{{ t('profile.timezone') }}</span>
                        <TimezonePicker v-model="timeZone" :disabled="isSubmitting" />
                        <p class="mt-1.5 text-st-xs font-semibold text-st-muted">{{ t('profile.timezone_desc') }}</p>
                    </div>

                    <!-- Not wired to anything yet: the server has no reminder job, so this is a
                         placeholder the design asks for rather than a control. Rendered inert
                         (no input element) so it can't be focused or toggled. -->
                    <div class="flex h-10 items-center gap-[11px] opacity-70 sm:mt-[27px]">
                        <span class="h-5 w-5 flex-none rounded-[6px] border-[1.5px] border-st-line bg-st-ink-100" />
                        <span class="text-st-sm font-bold text-st-body">{{ t('profile.receive-daily-practice-email-reminders') }}</span>
                        <StBadge color="neutral">{{ t('coming-soon') }}</StBadge>
                    </div>
                </form>

                <div class="mb-4 mt-[18px] h-px bg-st-line" />

                <div class="flex items-center justify-end gap-4">
                    <span class="inline-flex items-center gap-2 text-st-xs font-bold" :class="statusClass">
                        <span v-if="isSubmitting" class="h-3 w-3 animate-spin rounded-full border-2 border-st-ink-200 border-t-st-primary" />
                        {{ statusLabel }}
                    </span>
                    <StButton
                        type="submit"
                        :variant="hasChanges ? 'solid' : 'soft'"
                        color="primary"
                        :disabled="!hasChanges || isSubmitting"
                        @click="handleSubmit"
                    >
                        {{ t('save-changes') }}
                    </StButton>
                </div>
            </StCard>
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
    import { useProfileStore } from '~/stores/profile';
    import { StAvatar, StBadge, StButton, StCard, StIcon, StInput, StSkeleton } from 'subturtle-ui';
    import StPageHeader from '~/components/common/StPageHeader.vue';
    import TimezonePicker from '~/components/common/TimezonePicker.vue';
    import { toastSuccess, toastError } from 'pilotui/toast';

    const profileStore = useProfileStore();
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('profile.profile'),
        // @ts-ignore
        middleware: ['auth'],
    });

    const name = ref(profileStore.userDetail?.name || '');
    const email = computed(() => profileStore.email);
    const profilePicture = computed(() => profileStore.profilePicture);
    const timeZone = ref(profileStore.userDetail?.timeZone || '');

    const loading = ref(true);
    const isSubmitting = ref(false);
    // Latches after a successful save so the status line can say so, and clears the moment the form
    // goes dirty again.
    const justSaved = ref(false);

    // Preferences are still sent on every save so the payload shape is unchanged, but nothing writes
    // to them yet — the reminders row above is a placeholder, not a control.
    const selectedValues = ref<Record<string, boolean>>({});

    // Change detection baselines. Both are (re)seeded after getProfileInfo() resolves, not at setup:
    // the store is usually still empty when this component is created, so seeding them from it here
    // would leave the form permanently dirty against a blank baseline.
    const initialName = ref('');
    const initialTimeZone = ref('');
    const initialSelectedValues = ref<Record<string, boolean>>({});

    const hasChanges = computed(() => {
        const nameChanged = name.value !== initialName.value;
        const timezoneChanged = timeZone.value !== initialTimeZone.value;
        const preferencesChanged = JSON.stringify(selectedValues.value) !== JSON.stringify(initialSelectedValues.value);

        return nameChanged || timezoneChanged || preferencesChanged;
    });

    watch(hasChanges, (dirty) => {
        if (dirty) justSaved.value = false;
    });

    const statusLabel = computed(() => {
        if (isSubmitting.value) return t('profile.status_saving');
        if (hasChanges.value) return t('profile.status_unsaved');
        return justSaved.value ? t('profile.status_saved') : t('profile.status_idle');
    });

    // Full strings, not assembled — Tailwind scans this file as text.
    const statusClass = computed(() => {
        if (isSubmitting.value) return 'text-st-muted';
        if (hasChanges.value) return 'text-st-amber-600';
        return justSaved.value ? 'text-st-jade-600' : 'text-st-faint';
    });

    // The zone the clock reads. An account with no saved zone still gets a live, honest clock —
    // the browser's own — rather than a blank slot.
    const displayZone = computed(() => timeZone.value || Intl.DateTimeFormat().resolvedOptions().timeZone);

    const now = ref(new Date());
    let clockTimer: ReturnType<typeof setInterval> | undefined;

    const localTime = computed(() => {
        try {
            return new Intl.DateTimeFormat(undefined, { timeZone: displayZone.value, hour: '2-digit', minute: '2-digit' }).format(now.value);
        } catch {
            // Intl throws on an unknown zone (a stale value saved by an older client) — fall back to
            // local time rather than blanking the banner.
            return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(now.value);
        }
    });

    const handleSubmit = async () => {
        if (!hasChanges.value || isSubmitting.value) return;

        try {
            isSubmitting.value = true;

            const profileData: {
                name?: string;
                preferences?: Record<string, boolean>;
                timeZone?: string;
            } = {};

            // Include name if it has changed
            if (name.value !== profileStore.userDetail?.name) {
                profileData.name = name.value;
            }

            if (timeZone.value !== profileStore.userDetail?.timeZone) {
                profileData.timeZone = timeZone.value;
            }

            // Include preferences
            profileData.preferences = { ...selectedValues.value };

            // Call the store function
            await profileStore.updateProfile(profileData);

            // Baseline off what was just submitted, not off the store. The store only mirrors the
            // new values into `userDetail` when it already holds a profile document, so reading it
            // back here leaves the form stuck on "Unsaved changes" for any account without one.
            setBaseline(name.value, timeZone.value);
            justSaved.value = true;
            toastSuccess(t('profile.profile-updated'));
        } catch (error) {
            console.error('Error updating profile:', error);
            toastError(t('profile.profile-update-failed'));
        } finally {
            isSubmitting.value = false;
        }
    };

    function setBaseline(nextName: string, nextTimeZone: string) {
        initialName.value = nextName;
        initialTimeZone.value = nextTimeZone;
        initialSelectedValues.value = { ...selectedValues.value };
    }

    onMounted(async () => {
        clockTimer = setInterval(() => (now.value = new Date()), 30_000);

        try {
            //profile
            await profileStore.getProfileInfo();

            // Seed the fields and the change-detection baselines from the profile that just landed.
            name.value = profileStore.userDetail?.name || '';
            timeZone.value = profileStore.userDetail?.timeZone || '';
            setBaseline(name.value, timeZone.value);
        } finally {
            loading.value = false;
        }
    });

    onUnmounted(() => clearInterval(clockTimer));
</script>
