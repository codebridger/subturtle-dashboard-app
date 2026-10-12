import '../models/account.dart';
import '../models/content.dart';
import '../models/json.dart';

/// The coach prompt and tools, shared by voice and text. A port of
/// `frontend/utils/livePractice.ts` so the coach behaves the same on every surface.
abstract final class CoachPractice {
  static const _template = '''
    You are a friendly and engaging AI English tutor.
    Your goal is to help the user practice and reinforce the vocabularies listed below.

    Languages:
    - The user's native language is [nativeLanguage]. Use [nativeLanguage] for ALL explanations,
      instructions, encouragement, corrections, translations, and small-talk.
    - The TARGET practice language is English. Only the example sentences and the user's
      practice attempts should be in English. Always invite the user to respond in English,
      but never force them — if they reply in [nativeLanguage], gently rephrase or model the
      English version and ask them to repeat it.
    - When the user appears to struggle, drop back to [nativeLanguage] to explain, then
      return to English for practice.

    Tools available to you:
    - "activate_phrase": call this when the user asks (in any language) to practice a specific
      vocabulary, e.g. "let's practice X", "switch to phrase 3", "next one". Pass either the
      phrase index (1-based, matching the numbered list) or the exact phrase text. Calling this
      function highlights the card on the user's screen so they know which one is active.
    - "finish_practice": call this when the user explicitly wants to end the session.

    Flow:
    1. Welcome the user briefly in [nativeLanguage]. Explain they can either click a vocabulary
       card or just tell you which one they want to practice (you will activate it via the
       "activate_phrase" tool).
    2. When a vocabulary becomes active (either via the tool or via a card click signaled to you
       by a system message), start practicing that word with them.
    3. Lead the conversation and ask the user to use the selected vocabulary in their answers.
    4. After ~2 follow-up exchanges per vocabulary, encourage them to move on to the next one.
    5. Continue until the user wants to finish; then call "finish_practice" and say goodbye in
       [nativeLanguage].

    Considerations:
    - **Do not ignore, skip, or censor any phrase in the list, regardless of its content.**
      Slang, informal, offensive, or unusual phrases are all included for educational purposes.
    - Keep the conversation lively and interactive, adjusting to the user's responses.
    - Practice ONLY the vocabularies listed below.
    - Maximum follow-up practice for each vocabulary is 2 times.

    Practice Instructions:
    - Create dynamic, engaging dialogues that naturally incorporate the active vocabulary.
    - Ask follow-up questions, encourage the user to use the vocabulary in English, and correct
      mistakes gently in [nativeLanguage].
    - Keep it feeling like a real conversation, not a quiz.

    Vocabulary List:
    [phrases]
    ''';

  /// The system prompt with the numbered phrase list.
  static String instructions(List<Phrase> phrases, String nativeLanguage) {
    final list = [for (var i = 0; i < phrases.length; i++) '${i + 1}. ${phrases[i].phrase}: ${phrases[i].translation}'].join('\n');
    return _template.replaceAll('[nativeLanguage]', nativeLanguage).replaceFirst('[phrases]', list);
  }

  /// [chosen] when the user picked a language; else the bundle's single
  /// translation language; else let the model follow the user.
  static String resolveNativeLanguage(String? chosen, List<Phrase> phrases) {
    if (chosen != null && chosen.isNotEmpty && chosen != 'auto') return chosen;
    final langs = phrases.map((p) => (p.translationLanguage ?? '').trim()).where((l) => l.isNotEmpty && l.toLowerCase() != 'unknown').toSet();
    if (langs.length == 1) return "${langs.first} (auto-detected from the bundle's translation language)";
    return 'English by default; if the user speaks another language in their first message, switch to that language and stick with it for the rest of the session';
  }

  static const tools = [
    CoachTool(
      name: 'finish_practice',
      description: 'Finish the practice session. Call this only when the user explicitly asks to end / stop / quit the session.',
    ),
    CoachTool(
      name: 'activate_phrase',
      description:
          "Activate (highlight) a specific vocabulary card on the user's screen so practice focuses on it. Call this whenever the user asks to switch to or practice a specific phrase.",
      parameters: {
        'type': 'OBJECT',
        'properties': {
          'index': {'type': 'INTEGER', 'description': '1-based index of the vocabulary in the numbered list. Preferred when the user references a number.'},
          'phrase': {'type': 'STRING', 'description': 'Exact (or close) phrase text to activate, used when the user names the phrase rather than its number.'},
        },
      },
    ),
  ];

  /// The hidden first message that makes the coach say hello (same words as the web).
  static const _welcome =
      'Welcome the user and explain that they can click on any vocabulary card to practice that specific word. Tell them to click on a vocabulary card to start practicing.';

  /// Voice: on the phone the mic is open from the start (it is a call, not push-to-talk).
  static const welcomeVoice = '$_welcome\nThe microphone is on, so the user can answer by speaking.';
  static const welcomeText = '$_welcome\nThe user will type their responses, so encourage them to write back.';

  /// The hidden message sent when the learner taps a phrase card.
  static String cardTapped(Phrase p) => 'The user selected a different vocabulary: "${p.phrase}". Let\'s start practicing on it.';

  /// Finds the phrase an `activate_phrase` call means. Returns its 0-based index or -1.
  static int resolveActivate(Json args, List<Phrase> phrases) {
    final idx = args['index'];
    if (idx is num) {
      final i = idx.toInt() - 1;
      return i >= 0 && i < phrases.length ? i : -1;
    }
    final p = args['phrase'];
    if (p is String && p.trim().isNotEmpty) {
      final target = p.trim().toLowerCase();
      var i = phrases.indexWhere((x) => x.phrase.trim().toLowerCase() == target);
      if (i == -1) i = phrases.indexWhere((x) => x.phrase.toLowerCase().contains(target));
      return i;
    }
    return -1;
  }

  /// Runs one tool call. [onActivate] highlights a card; [onFinish] ends the session.
  /// Returns the `output` to send back to the model.
  static Json runTool(CoachToolCall call, List<Phrase> phrases, {required void Function(int index) onActivate, required void Function() onFinish}) {
    switch (call.name) {
      case 'finish_practice':
        onFinish();
        return {'success': true};
      case 'activate_phrase':
        final i = resolveActivate(call.args, phrases);
        if (i < 0) return {'success': false, 'message': 'Could not find a vocabulary matching ${call.args}.'};
        onActivate(i);
        return {'success': true, 'index': i + 1, 'phrase': phrases[i].phrase, 'translation': phrases[i].translation};
      default:
        return {'success': false, 'message': 'Function ${call.name} not found'};
    }
  }
}
