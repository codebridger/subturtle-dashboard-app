<template>
  <MaterialPracticeToolScaffold
    :title="bundle?.title || 'Flashcards'"
    :activePhrase="phraseIndex + 1"
    :totalPhrases="totalPhrases"
    :bundleId="id"
    :body-class="'flex flex-col items-center justify-center'"
  >
    <template v-if="bundle">
      <Button v-if="!sessionStarted" @click="createLiveSession">Start Live Session</Button>
      <Button v-else @click="endLiveSession">End Live Session</Button>
      <audio ref="ai-agent"></audio>
    </template>
  </MaterialPracticeToolScaffold>
</template>

<script setup lang="ts">
  import { Button } from '@codebridger/lib-vue-components/elements.ts';
  import { dataProvider, functionProvider } from '@modular-rest/client';
  import { COLLECTIONS, DATABASE, type PopulatedPhraseBundleType } from '~/types/database.type';

  import type { LiveSessionType } from '~/types/live-session.type';

  definePageMeta({
    // @ts-ignore
    layout: 'empty',
    // @ts-ignore
    middleware: ['auth'],
  });

  const { id } = useRoute().params;

  const bundle = ref<PopulatedPhraseBundleType | null>(null);
  const phraseIndex = ref(-1);
  const phrase = computed(() => {
    if (!bundle.value) return null;
    return bundle.value.phrases[phraseIndex.value];
  });
  const totalPhrases = computed<number>(() => {
    return bundle.value?.phrases.length || 0;
  });

  const liveSession = ref<LiveSessionType | null>(null);
  const audioRef = useTemplateRef<HTMLAudioElement>('ai-agent');
  const sessionStarted = ref(false);

  let peerConnection: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;

  const instructions = `
  You are a friendly and engaging AI language English tutor. 
  Your goal is to help the user practice and reinforce understanding vocabularies in an English natural conversations.

  Instructions:
  1. call get_next_word function to get the active word.
  2. give practice to user with the active word.
  3. call get_next_word function to set the next active word.
  4. if user ask to practice another word just call set_active_word function with the word. the the activation would be successful continue the practice, otherwise, ask the user to pick a word from the list.

  There are [phrases] vocabularies to practice, your get_next_word function to get the first word.

  Practice Instructions:
  - Please create dynamic and engaging dialogues where you naturally incorporate these words. Ask me follow-up questions, encourage me to use the words in my own responses, and correct my mistakes when necessary. Keep the conversation lively and interactive, adjusting to my responses to make it feel like a real conversation!

  Considerations:
  1. user might speak in other languages, but the main conversation should be Practicing English, you might need to switch between the user language and English, but should ask user to speak english.
  2. if user don't suggest a specific way of practice, you have to start from first vocab and try to practice with user, the user is your student you need to lead the conversation.
  3. it's better to explain things in the user language not english and then ask the user t speak english and perform your practice.
  5. it's not necessary to re tell what users says in practice time.
  6. don't sensor anything from the user list, remember it's a english practice and a language has bad and good phrases, but all should be given a lecture.
  7. don't guess any word, just get the word by calling get_next_word function from your tools.
  8. Finish the practice session with a good bye message after the last word, consider the word numbers.
  9. you get 'no more word' if there is no more word to practice.
`;

  onMounted(() => {
    fetchFlashcard();
  });

  const tools: { [key: string]: any } = {
    set_active_word: {
      handler: (arg: { phrase: string }) => {
        const wordIndex = bundle.value?.phrases.findIndex((p) => p.phrase.toLowerCase() === arg.phrase.toLowerCase());
        if (wordIndex === -1 || wordIndex == undefined) return { success: false };

        phraseIndex.value = wordIndex as number;
        return { success: true };
      },
      definition: {
        type: 'function',
        name: 'set_active_word',
        description: 'Set the active word to practice.',
        parameters: {
          type: 'object',
          required: ['phrase'],
          properties: {
            phrase: {
              type: 'string',
              description: 'The phrase to set as active word.',
            },
          },
        },
      },
    },
    get_next_word: {
      handler: (arg: { phrase: string }) => {
        if (phraseIndex.value >= totalPhrases.value) return { activeWord: 'no more word' };

        phraseIndex.value += 1;
        // phraseIndex.value = bundle.value?.phrases.findIndex((p) => p.phrase === arg.phrase) || 0;
        const response = { activeWord: phrase.value?.phrase };

        // add `no more word` if there is no more word for next practice
        if (phraseIndex.value + 1 >= totalPhrases.value) {
          //@ts-ignore
          response['next'] = 'no more word';
        }

        return response;
      },
      definition: {
        type: 'function',
        name: 'get_next_word',
        description: 'Get the next word to practice.',
        parameters: {
          type: 'object',
          required: ['number'],
          properties: {
            number: {
              type: 'number',
              description: 'The number of the word to get.',
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
    if (peerConnection == null) {
      const phrases = (bundle.value?.phrases.map((p) => p.phrase) || []).join('\n');
      const tempInstructions = instructions.replace('[phrases]', phrases.length.toString()).replace('[first_phrase]', phrases[0]);

      functionProvider
        .run<LiveSessionType>({
          name: 'create-practice-live-session',
          args: {
            voice: 'alloy',
            instructions: tempInstructions,
            tools: Object.values(tools).map((t) => t.definition),
            tool_choice: 'auto',
          },
        })
        .then((session) => {
          console.log(session);
          liveSession.value = session;
        })
        .then(setupRTP)
        .then(startLiveSession);
    }

    setupRTP().then(startLiveSession);
  }

  async function setupRTP() {
    if (audioRef.value === null) return;

    // Create a peer connection
    peerConnection = new RTCPeerConnection();

    // Set up to play remote audio from the model
    audioRef.value.autoplay = true;
    peerConnection.ontrack = (e) => (audioRef.value!.srcObject = e.streams[0]);

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    peerConnection.addTrack(ms.getTracks()[0]);
  }

  async function startLiveSession() {
    if (liveSession.value === null) return;
    if (peerConnection === null) return;

    // Set up data channel for sending and receiving events
    dataChannel = peerConnection.createDataChannel('oai-events');

    dataChannel.addEventListener('message', (e) => {
      // Realtime server events appear here!
      const data = JSON.parse(e.data);
      onSessionEvent(data);
    });

    // Start the session using the Session Description Protocol (SDP)
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const baseUrl = 'https://api.openai.com/v1/realtime';
    const model = liveSession.value.model;
    const EPHEMERAL_KEY = liveSession.value.client_secret.value;

    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        'Content-Type': 'application/sdp',
      },
    });

    const answer = {
      type: 'answer',
      sdp: await sdpResponse.text(),
    };

    await peerConnection.setRemoteDescription(answer as any);
    sessionStarted.value = true;
  }

  function endLiveSession() {
    if (peerConnection === null) return;
    peerConnection.close();
    sessionStarted.value = false;
  }

  function onSessionEvent(eventData: any) {
    // Ref: https://platform.openai.com/docs/api-reference/realtime-server-events
    const { type, event_id } = eventData;

    if (type === 'session.created') {
      console.log('Session created', event_id);

      const responseCreate = {
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: 'The user is here, greeting to the user, and start the practice session.',
        },
      };

      dataChannel?.send(JSON.stringify(responseCreate));

      // const sessionUpdate = {
      //   type: 'session.update',
      //   session: {
      //     tools: Object.values(tools).map((t) => t.definition),
      //     tool_choice: 'auto',
      //   },
      // };

      // dataChannel?.send(JSON.stringify(sessionUpdate));
    }

    // Speech parts of AI
    else if (type === 'response.audio_transcript.delta') {
      const { delta, response_id } = eventData;
      // console.log(response_id, delta);
    } else if (type == 'conversation.item.input_audio_transcription.completed') {
      const { item_id, transcript } = eventData;
      console.log(item_id, transcript);
    }

    // https://platform.openai.com/docs/guides/realtime-model-capabilities#detect-when-the-model-wants-to-call-a-function
    else if (type === 'response.done' && eventData.response.output) {
      const [output01] = eventData.response.output;
      if (!output01) return;
      console.log('response.done', output01);

      if (output01.type != undefined && output01.type == 'function_call') {
        const functionName = output01.name as string;
        const args = JSON.parse(output01.arguments);

        const fn = tools[functionName];
        let fnResponse = { success: false };

        try {
          fnResponse = fn.handler(args);
        } catch (error) {
          console.error('Error calling function', functionName, error);
          fnResponse = { success: false };
        }

        const response = {
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: output01.call_id,
            output: JSON.stringify(fnResponse),
          },
        };

        dataChannel?.send(JSON.stringify(response));

        const continueResponse = {
          type: 'response.create',
          // response: {
          //   modalities: ['text', 'audio'],
          //   instructions: "Reply based on the function's output.",
          // },
        };

        dataChannel?.send(JSON.stringify(continueResponse));
      }
    }

    // Error handling
    else if (type === 'error') {
      console.error('Error from AI', eventData);
    }
    // else {
    //   console.log('Unhandled event', eventData);
    // }
  }
</script>
