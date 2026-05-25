/**
 * Single source of truth for the AI-coach voices.
 *
 * Both the dashboard and the browser extension fetch this list (via the
 * `get-live-session-voices` function) so the picker shows an identical set in
 * every surface. `name` is the exact Gemini Live prebuilt-voice id passed to
 * the API; the rest is display metadata.
 *
 * Avatars are rendered client-side as an initial on `avatarColor` for now;
 * `avatarUrl` is reserved so real images can be dropped in later without any
 * client change.
 */
export interface CoachVoice {
  /** Exact Gemini prebuilt-voice id (sent to the Live API). */
  name: string;
  /** Display name. */
  label: string;
  /** One-line tone/character description. */
  description: string;
  gender: "female" | "male";
  /** Stable background color for the initial-based avatar chip. */
  avatarColor: string;
  /** Optional image URL; null until real avatars exist. */
  avatarUrl: string | null;
}

export const LIVE_SESSION_VOICES: CoachVoice[] = [
  { name: "Kore", label: "Kore", description: "Firm and clear", gender: "female", avatarColor: "#7C3AED", avatarUrl: null },
  { name: "Puck", label: "Puck", description: "Upbeat and lively", gender: "male", avatarColor: "#2563EB", avatarUrl: null },
  { name: "Charon", label: "Charon", description: "Informative and calm", gender: "male", avatarColor: "#0D9488", avatarUrl: null },
  { name: "Fenrir", label: "Fenrir", description: "Excitable and energetic", gender: "male", avatarColor: "#EA580C", avatarUrl: null },
  { name: "Aoede", label: "Aoede", description: "Breezy and warm", gender: "female", avatarColor: "#DB2777", avatarUrl: null },
  { name: "Leda", label: "Leda", description: "Youthful and bright", gender: "female", avatarColor: "#D97706", avatarUrl: null },
  { name: "Orus", label: "Orus", description: "Firm and grounded", gender: "male", avatarColor: "#4F46E5", avatarUrl: null },
  { name: "Zephyr", label: "Zephyr", description: "Bright and friendly", gender: "female", avatarColor: "#059669", avatarUrl: null },
];

export const DEFAULT_LIVE_SESSION_VOICE = "Kore";
