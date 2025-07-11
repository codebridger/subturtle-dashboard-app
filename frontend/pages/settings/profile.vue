<template>
    <div class="p-6">
        <h1 class="mb-6 text-lg font-bold">{{ t('profile.profile') }}</h1>
        <!-- User Details Section -->
        <Card class="shadow-none">
            <form @submit.prevent="handleSubmit">
                <div class="flex flex-col sm:flex-row">
                    <div class="mb-5 w-full items-center justify-center sm:w-2/12 ltr:sm:mr-4 rtl:sm:ml-4">
                        <div class="group relative h-24 w-24">
                            <img
                                :src="profilePhotoPreview"
                                alt="Profile Photo"
                                class="h-24 w-24 cursor-pointer rounded-full border border-gray-200 object-cover transition-opacity group-hover:opacity-80"
                            />
                            <div
                                class="absolute inset-0 flex items-center justify-center rounded-full bg-black bg-opacity-0 transition-all duration-200 group-hover:bg-opacity-30"
                            >
                                <svg
                                    class="h-6 w-6 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                    ></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                </svg>
                            </div>
                            <input
                                ref="fileInput"
                                type="file"
                                accept="image/*"
                                class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                @change="handleFileUpload"
                                :disabled="isUploading"
                            />
                        </div>
                        <div v-if="isUploading" class="mt-2 text-center text-sm text-gray-500">
                            {{ t('profile.uploading') }}
                        </div>
                    </div>
                    <div class="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2">
                        <Input :label="t('profile.full-name')" v-model="name" type="text" :placeholder="t('Placeholder')" required :disabled="isSubmitting" />
                        <Input :label="t('profile.email')" :model-value="email" type="email" :placeholder="t('Placeholder')" required disabled />
                        <!-- <Input
                            :label="t('profile.password')"
                            type="password"
                            placeholder="*************"
                            iconName="IconEyeOff"
                            iconOppositePosition
                            required
                            disabled
                        />
                        <Button class="items-end justify-start !border-none !text-primary">
                            {{ t('profile.reset-password') }}
                        </Button> -->
                        <CheckboxInput
                            v-for="option in options"
                            :key="option.value"
                            v-model="selectedValues[option.value]"
                            :text="option.label"
                            :value="option.value"
                            :disabled="isSubmitting"
                        />
                        <div class="col-span-2 mt-3">
                            <Button type="submit" color="primary" :loading="isSubmitting" :disabled="isSubmitting || isUploading">
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
    import { Card, Input, Button, CheckboxInput } from '@codebridger/lib-vue-components/elements.ts';
    import { toastSuccess, toastError } from '@codebridger/lib-vue-components/toast.ts';

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
    const options = [{ label: t('profile.receive-daily-practice-email-reminders'), value: 'dailyReminders' }];

    const selectedValues = ref<Record<string, boolean>>({});
    const isSubmitting = ref(false);
    const isUploading = ref(false);
    const fileInput = ref<HTMLInputElement>();

    onMounted(async () => {
        await profileStore.getProfileInfo();
        name.value = profileStore.userDetail?.name || '';
    });

    const handleSubmit = async () => {
        isSubmitting.value = true;

        try {
            await profileStore.updateProfile({
                name: name.value,
            });
        } catch (error) {
            console.error('Error updating profile:', error);
        } finally {
            isSubmitting.value = false;
        }
    };

    const handleFileUpload = async (event: Event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];

        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toastError('Please select an image file', { position: 'top-end' });
            return;
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            toastError('File size must be less than 5MB', { position: 'top-end' });
            return;
        }

        isUploading.value = true;

        try {
            await profileStore.uploadProfilePicture(file);
            // Clear the input
            if (fileInput.value) {
                fileInput.value.value = '';
            }
        } catch (error) {
            console.error('Error uploading file:', error);
        } finally {
            isUploading.value = false;
        }
    };
</script>
