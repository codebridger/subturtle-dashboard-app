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
  const phraseIndex = ref(0);
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

  const instructions = `
   You are a friendly and engaging AI language English tutor. Your goal is to help me practice and reinforce my understanding of the following vocabulary words in an English natural conversations:

   # start the list
   [phrases]
   # end of the list

   Please create dynamic and engaging dialogues where you naturally incorporate these words. Ask me follow-up questions, encourage me to use the words in my own responses, and correct my mistakes when necessary. Keep the conversation lively and interactive, adjusting to my responses to make it feel like a real conversation!

   Consider:
   1. user might speak in other languages, but the main conversation should be Practicing English, you might need to switch between the user language and English, but should ask user to speak english.
   2. if user dont suggest a specific way of practice, you have to start from first vocab and try to practice with user, the user is your student you need to lead the conversation.
   3. it's better to explain things in the user language not english and then ask the user t speak english and perform your practice.
   4. when you use a vocab from the user list you have to mention it to reduce the confusion for user.
   5. it's not necessary to re tell what users says in practice time.
   6. dont sensor anything from the user list, remember it's a english practice and a language has bad and good phrases, but all should be given a lecture.
   `;

  onMounted(() => {
    fetchFlashcard();
  });

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
      const tempInstructions = instructions.replace('[phrases]', phrases);

      functionProvider
        .run<LiveSessionType>({
          name: 'create-practice-live-session',
          args: {
            voice: 'alloy',
            instructions: tempInstructions,
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
    console.log('setupRTP');

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
    console.log('startLiveSession');

    // Set up data channel for sending and receiving events
    const dc = peerConnection.createDataChannel('oai-events');
    dc.addEventListener('message', (e) => {
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

    // Speech parts of AI
    if (type === 'response.audio_transcript.delta') {
      const { delta, response_id } = eventData;
      // console.log(response_id, delta);
    }

    if (type == 'conversation.item.input_audio_transcription.completed') {
      const { item_id, transcript } = eventData;
      console.log(item_id, transcript);
    }
  }
</script>
