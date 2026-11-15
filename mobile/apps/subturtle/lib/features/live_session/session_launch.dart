import 'package:subturtle_api/subturtle_api.dart';

/// Everything a live session needs, decided on the Start sheet.
class SessionLaunch {
  const SessionLaunch({
    required this.bundle,
    required this.phrases,
    required this.voice,
    required this.nativeLanguage,
    this.language = 'en',
    this.languageName = 'English',
    this.explanationLanguage,
    this.serverInstructions,
  });

  final Bundle bundle;

  /// The phrases to practise, in order (at most [maxPhrases]).
  final List<Phrase> phrases;
  final String voice;

  /// The learner's language name, or 'auto'.
  final String nativeLanguage;

  /// The learning language the Coach speaks (`de`), and its name.
  final String language;
  final String languageName;

  /// The own language the Coach explains in (`fa`), for this language.
  final String? explanationLanguage;

  /// The prompt built on the server (`get-coach-instructions`, Q3). Null on a
  /// server without it: the app builds the English prompt from the shared spec.
  final String? serverInstructions;

  /// Same idea as the web's range picker, kept simple: the newest phrases first.
  static const maxPhrases = 10;

  String get instructions => serverInstructions ?? CoachPractice.instructions(phrases, CoachPractice.resolveNativeLanguage(nativeLanguage, phrases));

  /// Saved on the session record; the history list reads `title` and `mode`.
  Map<String, dynamic> metadata(String mode) => {
        'mode': mode,
        'title': bundle.title,
        'bundleId': bundle.id,
        'aiCharacter': voice,
        'nativeLanguage': nativeLanguage,
        'language': language,
        'explanationLanguage': ?explanationLanguage,
        'source': {'phraseIds': phrases.map((p) => p.id).toList()},
        'client': 'mobile',
      };
}

/// The voice preview for a coach voice in a learning language. English keeps
/// the web's Neural2 map; other languages use the language's standard voice
/// (the TTS function refuses the Chirp 3 HD voices that match the coach's).
String coachPreviewVoiceFor(String voice, LearningLanguageCaps language) {
  if (language.code == 'en') return coachPreviewVoice[voice] ?? 'en-US-Standard-A';
  return language.speechVoice;
}

/// What the preview says, in the language the Coach will speak.
String coachPreviewLine(String language) => const {
      'de': 'Hallo, ich bin dein Coach. Bereit, wenn du es bist.',
      'es': 'Hola, soy tu coach. Empezamos cuando quieras.',
      'fr': "Salut, je suis ton coach. On commence quand tu veux.",
      'it': 'Ciao, sono il tuo coach. Iniziamo quando vuoi.',
      'sv': 'Hej, jag är din coach. Vi börjar när du vill.',
      'lt': 'Labas, aš tavo treneris. Pradėkime, kai būsi pasiruošęs.',
    }[language] ??
    "Hi, I'm your coach. Ready when you are.";

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
