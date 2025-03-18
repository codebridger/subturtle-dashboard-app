const { defineFunction } = require("@modular-rest/server");
const fetch = require("node-fetch");

const createPracticeLiveSession = defineFunction({
  name: "create-practice-live-session",
  permissionTypes: ["user_access"],
  callback: async function (setup) {
    const validSetupKeys = [
      "instructions",
      "voice",
      "turn_detection",
      "tools",
      "tool_choice",
    ];

    const additionalSetup = {};
    for (const key of validSetupKeys) {
      if (setup[key]) {
        additionalSetup[key] = setup[key];
      }
    }

    try {
      // https://platform.openai.com/docs/guides/realtime-webrtc#creating-an-ephemeral-token
      // https://platform.openai.com/docs/api-reference/realtime-sessions/create
      const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-realtime-preview",
          temperature: 0.6,
          input_audio_transcription: {
            model: "whisper-1",
          },
          ...additionalSetup,
        }),
      });

      if (r.status < 200 || r.status >= 299) {
        const body = await r.json().then((data) => console.error(data));
        console.error("Failed to create practice live session", body);
        throw new Error(
          `Failed to create practice live session, Openai status: ${r.status}`
        );
      }

      const ephemeralToken = await r.json();
      return ephemeralToken;
    } catch (error) {
      throw new Error("Failed to create practice live session");
    }
  },
});

module.exports.functions = [createPracticeLiveSession];
