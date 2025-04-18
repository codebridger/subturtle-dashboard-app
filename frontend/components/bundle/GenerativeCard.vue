<template>
    <NuxtLink :to="`/bundles/${props.bundle._id}`">
        <Card class="no-padding min-h-full rounded-md shadow-none hover:shadow-lg">
            <section class="relative">
                <IconButton class="absolute right-2 top-2 z-10 min-w-10 justify-center p-2" rounded="md">
                    {{ bundle.phrases.length }}
                </IconButton>
                <MaterialWordGenerativeCover :words="phraseList" :classes="['h-fit w-full']" @click="navigateToBundle" />
            </section>
            <section class="p-6">
                <span class="mb-2 text-sm font-bold text-gray-800 dark:text-white">
                    {{ props.bundle.title }}
                </span>

                <p class="text-sm text-gray-400">
                    {{ props.bundle.desc }}
                </p>
            </section>
        </Card>
    </NuxtLink>
</template>
<script setup lang="ts">
    import { dataProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseBundleType, type PhraseType } from '~/types/database.type';
    import { Card, IconButton } from '@codebridger/lib-vue-components/elements.ts';

    const props = defineProps<{
        bundle: PhraseBundleType;
    }>();

    const phraseList = ref<string[]>([]);

    async function getWords() {
        // get last 10 words
        const phraseIds = props.bundle.phrases.slice(-10);

        if (phraseIds.length === 0) {
            return;
        }

        const phrases = await dataProvider.findByIds<PhraseType>({
            database: DATABASE.USER_CONTENT,
            collection: COLLECTIONS.PHRASE,
            ids: phraseIds,
            accessQuery: {
                refId: authUser.value?.id,
            },
        });

        phraseList.value = phrases.map(({ phrase, translation }) => {
            // choose between phrase and translation
            return [phrase, translation][Math.floor(Math.random() * 2)];
        });
    }

    onMounted(async () => {
        getWords();
    });

    function navigateToBundle() {
        // navigate to the bundle page
        navigateTo(`/bundles/${props.bundle._id}`);
    }
</script>

<style lang="css" scoped>
    .no-padding {
        padding: 0 !important;
    }
</style>
