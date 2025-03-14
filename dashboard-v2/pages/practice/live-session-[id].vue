<template>
  <MaterialPracticeToolScaffold
    :title="bundle?.title || 'Flashcards'"
    :activePhrase="phraseIndex + 1"
    :totalPhrases="totalPhrases"
    :bundleId="id"
    :body-class="'flex flex-col items-center justify-start'"
  >
    <template v-if="bundle">
      <section class="flex-1 py-10">
        <div class="flex w-[600px] flex-wrap items-center justify-center space-x-2 space-y-2">
          <!-- All phrases -->
          <Card
            v-for="phrase in bundle.phrases"
            :key="phrase._id"
            :class="[
              'transition-all duration-300 ease-in-out',
              // size
              'min-w-9 rounded-lg !p-10 text-center',
              // '!border-4 border-dashed !border-primary',

              '!dark:bg-transparent bg-transparent text-black dark:text-white-light',
              {
                '!border-4 border-dashed !border-primary': activePhrase && activePhrase._id === phrase._id,
              },
            ]"
          >
            <h1 class="text-2xl font-bold">{{ phrase.phrase }}</h1>
            <p class="text-lg">{{ phrase.translation }}</p>
          </Card>
        </div>
      </section>

      <section class="pb-32">
        <Button v-if="!liveSessionStore.sessionStarted" @click="createLiveSession">Start Live Session</Button>
        <Button v-else @click="endLiveSession">End Live Session</Button>
        <audio ref="ai-agent"></audio>
      </section>
    </template>
  </MaterialPracticeToolScaffold>
</template>

<script setup lang="ts">
  import { Button, Card } from '@codebridger/lib-vue-components/elements.ts';
  import { dataProvider } from '@modular-rest/client';
  import { COLLECTIONS, DATABASE, type PopulatedPhraseBundleType } from '~/types/database.type';
  import { useLiveSessionStore } from '~/stores/liveSession';

  definePageMeta({
    // @ts-ignore
    layout: 'blank',
    // @ts-ignore
    middleware: ['auth'],
  });

  const { id } = useRoute().params;
  const liveSessionStore = useLiveSessionStore();

  const bundle = ref<PopulatedPhraseBundleType | null>(null);
  const phraseIndex = ref(-1);
  const activePhrase = computed(() => {
    if (!bundle.value) return null;
    return bundle.value.phrases[phraseIndex.value];
  });
  const totalPhrases = computed<number>(() => {
    return bundle.value?.phrases.length || 0;
  });

  const audioRef = useTemplateRef<HTMLAudioElement>('ai-agent');

  onMounted(() => {
    fetchFlashcard();
  });

  const tools = {
    set_active_vocabulary: {
      handler: (arg: { vocabulary: string }) => {
        const wordIndex = bundle.value?.phrases.findIndex((p) => p.phrase.toLowerCase() === arg.vocabulary.toLowerCase());
        if (wordIndex === -1 || wordIndex == undefined) return { success: false, error: 'the vocabulary ' + arg.vocabulary + ' is not found' };

        phraseIndex.value = wordIndex as number;
        return { success: true, message: 'The vocabulary ' + arg.vocabulary + ' is set as active vocabulary' };
      },
      definition: {
        type: 'function',
        name: 'set_active_vocabulary',
        description: 'Set the active vocabulary to practice.',
        parameters: {
          type: 'object',
          required: ['vocabulary'],
          properties: {
            vocabulary: {
              type: 'string',
              description: 'The vocabulary to set as active vocabulary.',
            },
          },
        },
      },
    },
  };

  function fetchFlashcard() {
    dataProvider
      .findOne<PopulatedPhraseBundleType>({
        database: DATABASE.USER_CONTENT,
        collection: COLLECTIONS.PHRASE_BUNDLE,
        query: {
          _id: id,
          refId: authUser.value?.id,
        },
        populates: ['phrases'],
      })
      .then((res) => {
        if (!res) throw new Error('Bundle not found');
        bundle.value = res;
      })
      .catch((err) => {
        toastError({ title: 'Failed to fetch flashcard' });
      })
      .finally(() => {
        console.log(bundle.value);
      });
  }

  function createLiveSession() {
    const phrases = (bundle.value?.phrases.map((p, i) => i + 1 + '. ' + p.phrase) || []).join('\n');
    const instructions = `
    You are a friendly and engaging AI language English tutor. 
    Your goal is to help the user practice and reinforce understanding the vocabularies listed below.
  
    Instructions:
    1. Start with first vocabulary from the list and call "set_active_vocabulary" function from your tools to set the active vocabulary.
    2. When you get the activation confirmation, start the vocabulary practice with the user.
    3. You have to lead the conversation and ask the user to use the vocabulary in the conversation.
    4. then pick the next vocabulary from the list and call "set_active_vocabulary" function from your tools to set the active vocabulary.
    5. repeat the practice until you get you finish the last vocabulary.
    6. tell the user goodbye after the last vocabulary and ask him to finish the practice session.
    
    Considerations:
    - user might speak in other languages, but the main conversation should be Practicing English, you might need to switch between the user language and English, but should ask user to speak english.
    - if user don't suggest a specific way of practice, you have to start from first vocabulary and try to practice with user, the user is your student you need to lead the conversation.
    - it's better to explain things in the user language not english and then ask the user t speak english and perform your practice.
    - it's not necessary to re tell what users says in practice time.
    - don't sensor anything from the user list, remember it's a english practice and a language has bad and good phrases, but all should be given a lecture.
    - Finish the practice session with a good bye message after the last vocabulary, consider the vocabulary numbers.
    - you get 'no more vocabulary' if there is no more vocabulary to practice.
    - don't ask user what he wants, you have to select the vocabulary and start the practice.
    - practice only the vocabularies listed below.
    - don't forget to call "set_active_vocabulary" function to set the active vocabulary to practice.
  
    Practice Instructions:
    - Please create dynamic and engaging dialogues where you naturally incorporate these vocabularies. Ask me follow-up questions, encourage me to use the vocabularies in my own responses, and correct my mistakes when necessary. Keep the conversation lively and interactive, adjusting to my responses to make it feel like a real conversation!
  
    Vocabulary List:
    ${phrases}
    `;

    liveSessionStore
      .createLiveSession({
        sessionDetails: {
          instructions: instructions,
          voice: 'alloy',
          turnDetectionSilenceDuration: 1000,
        },
        tools: tools,
        audioRef: audioRef.value,
        onUpdate: handleSessionEvent,
      })
      .then(() => {
        // Trigger initial conversation
      })
      .catch((error) => {
        console.error('Failed to start live session:', error);
        toastError({ title: 'Failed to start live session' });
      });
  }

  function endLiveSession() {
    liveSessionStore.endLiveSession();
  }

  function handleSessionEvent(eventData: any) {
    // Any additional event handling specific to this component
    // For example, you might want to handle certain events that aren't
    // already handled in the store
    const { type, event_id } = eventData;
    // console.log('Event:', eventData);

    if (type === 'session.created') {
      console.log('Session created', event_id);
      triggerTheConversation();
    }
  }

  function triggerTheConversation() {
    const message = `The user is here, greeting to the user, and start the practice session with the first word`;
    liveSessionStore.triggerConversation(message);
  }
</script>
