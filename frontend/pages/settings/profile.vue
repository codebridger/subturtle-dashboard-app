<template>
    <div class="p-6">
        <h1 class="mb-6 text-lg font-bold">{{ t('profile.profile') }}</h1>
        <!-- User Details Section -->
        <Card class="shadow-none">
            <form @submit.prevent>
                <div class="flex flex-col sm:flex-row">
                    <div class="mb-5 w-full sm:w-2/12 ltr:sm:mr-4 rtl:sm:ml-4">
                        <img :src="profilePhotoPreview" alt="Profile Photo" class="h-24 w-24 rounded-full border border-gray-200 object-cover" />
                    </div>
                    <div class="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2">
                        <Input :label="t('profile.full-name')" :model-value="name" type="text" :placeholder="t('Placeholder')" required />
                        <Input :label="t('profile.email')" :model-value="email" type="email" :placeholder="t('Placeholder')" required disabled />
                        <Input
                            :label="t('profile.password')"
                            type="password"
                            :placeholder="t('Placeholder')"
                            iconName="IconLock"
                            iconOppositePosition
                            required
                            disabled
                        />
                        <Button class="items-end justify-start !border-none !text-primary">
                            {{ t('profile.reset-password') }}
                        </Button>
                        <label class="col-span-2 inline-flex items-center">
                            <input type="checkbox" />
                            <span>{{ t('profile.receive-daily-practice-email-reminders') }}</span>
                        </label>
                        <div class="col-span-2 mt-3">
                            <Button type="submit" color="primary">
                                {{ t('save') }}
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </Card>
    </div>
</template>

<script lang="ts" setup>
    import { ref, computed, onMounted } from 'vue';
    import { useProfileStore } from '~/stores/profile';
    import { Card, Input, Button } from '@codebridger/lib-vue-components/elements.ts';
    const profileStore = useProfileStore();
    const { t } = useI18n();

    definePageMeta({
        layout: 'default',
        title: () => t('profile.profile'),
        // @ts-ignore
        middleware: ['auth'],
    });

    const name = ref('');
    const email = computed(() => profileStore.email || '');
    const profilePhotoPreview = computed(() => profileStore.userDetail?.gPicture || '');

    onMounted(async () => {
        await profileStore.getProfileInfo();
        name.value = profileStore.userDetail?.name || '';
    });
</script>
