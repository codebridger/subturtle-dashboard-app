import 'package:subturtle_api/subturtle_api.dart';

/// Everything a live session needs, decided on the Start sheet.
class SessionLaunch {
  const SessionLaunch({required this.bundle, required this.phrases, required this.voice, required this.nativeLanguage});

  final Bundle bundle;

  /// The phrases to practise, in order (at most [maxPhrases]).
  final List<Phrase> phrases;
  final String voice;

  /// The learner's language name, or 'auto'.
  final String nativeLanguage;

  /// Same idea as the web's range picker, kept simple: the newest phrases first.
  static const maxPhrases = 10;

  String get instructions => CoachPractice.instructions(phrases, CoachPractice.resolveNativeLanguage(nativeLanguage, phrases));

  /// Saved on the session record; the history list reads `title` and `mode`.
  Map<String, dynamic> metadata(String mode) => {
        'mode': mode,
        'title': bundle.title,
        'bundleId': bundle.id,
        'aiCharacter': voice,
        'nativeLanguage': nativeLanguage,
        'source': {'phraseIds': phrases.map((p) => p.id).toList()},
        'client': 'mobile',
      };
}

/// Google TTS voices that sound close to each Gemini coach voice (for the preview only).
/// Same map as the web's `useVoicePreview`.
const coachPreviewVoice = {
  'Kore': 'en-US-Neural2-C',
  'Puck': 'en-US-Neural2-D',
  'Charon': 'en-US-Neural2-A',
  'Fenrir': 'en-US-Neural2-I',
  'Aoede': 'en-US-Neural2-F',
  'Leda': 'en-US-Neural2-G',
  'Orus': 'en-US-Neural2-J',
  'Zephyr': 'en-US-Neural2-H',
};
