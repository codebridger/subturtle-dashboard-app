<template>
    <NuxtLink :to="`/bundles/${props.bundle._id}`" class="block">
        <StBundleCard
            :title="props.bundle.title"
            :count="props.bundle.phrases.length"
            :source-lang="langPair.source"
            :target-lang="langPair.target"
            :cover="cover"
            :practicable="false"
        >
            <!-- The generated word cloud stands in for the design's flat gradient cover. -->
            <template #cover>
                <MaterialWordGenerativeCover :words="phraseList" :classes="['w-full', 'h-full']" />
            </template>
        </StBundleCard>
    </NuxtLink>
</template>

<script setup lang="ts">
    import { dataProvider } from '@modular-rest/client';
    import { COLLECTIONS, DATABASE, type PhraseBundleType, type PhraseType } from '~/types/database.type';
    import { StBundleCard } from 'subturtle-ui';
    import { toLanguageCode } from '~/utils/language';

    const props = defineProps<{
        bundle: PhraseBundleType;
    }>();

    const phraseList = ref<string[]>([]);
    /** Bundles carry no language of their own, so it is read off the phrases inside them. */
    const langPair = ref<{ source?: string; target?: string }>({});

    /** Cover tints rotate by bundle id so a grid of cards isn't all one color. */
    const COVERS = ['rose', 'jade', 'sky', 'amber', 'ink'] as const;
    const cover = computed(() => {
        const seed = [...(props.bundle._id ?? '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
        return COVERS[seed % COVERS.length];
    });

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

        const withLanguages = phrases.find((p) => p.language_info?.source || p.translation_language);
        if (withLanguages) {
            langPair.value = {
                source: toLanguageCode(withLanguages.language_info?.source),
                target: toLanguageCode(withLanguages.language_info?.target ?? withLanguages.translation_language),
            };
        }
    }

    onMounted(async () => {
        getWords();
    });
</script>
