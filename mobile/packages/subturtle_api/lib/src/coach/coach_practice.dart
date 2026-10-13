import 'dart:convert';

import '../models/account.dart';
import '../models/content.dart';
import '../models/json.dart';
import 'live_practice_spec.dart';

/// The coach prompt and tools, shared by voice and text. The texts and rules
/// come from `shared/live-practice/spec.json` ([LivePracticeSpec]), the same
/// file the web reads, so the coach behaves the same on every surface.
abstract final class CoachPractice {
  /// The system prompt with the numbered phrase list.
  static String instructions(List<Phrase> phrases, String nativeLanguage) {
    final list = [
      for (var i = 0; i < phrases.length; i++)
        LivePracticeSpec.fill(LivePracticeSpec.phraseLine, {'index': i + 1, 'phrase': phrases[i].phrase, 'translation': phrases[i].translation}),
    ].join('\n');
    return LivePracticeSpec.instructionsTemplate.replaceAll('[nativeLanguage]', nativeLanguage).replaceFirst('[phrases]', list);
  }

  /// [chosen] when the user picked a language; else the bundle's single
  /// translation language; else let the model follow the user.
  static String resolveNativeLanguage(String? chosen, List<Phrase> phrases) {
    if (chosen != null && chosen.isNotEmpty && chosen != 'auto') return chosen;
    final langs = phrases.map((p) => (p.translationLanguage ?? '').trim()).where((l) => l.isNotEmpty && l.toLowerCase() != 'unknown').toSet();
    if (langs.length == 1) return LivePracticeSpec.fill(LivePracticeSpec.nativeAutoDetected, {'language': langs.first});
    return LivePracticeSpec.nativeFallback;
  }

  static final List<CoachTool> tools = [
    for (final t in LivePracticeSpec.tools)
      CoachTool(name: str(t['name']), description: str(t['description']), parameters: t['parameters'] is Map ? asJson(t['parameters']) : null),
  ];

  /// The hidden first message that makes the coach say hello (voice), with the
  /// mic state, as on the web.
  static String welcomeVoice({bool micMuted = true}) =>
      '${LivePracticeSpec.message('welcome')}\n${LivePracticeSpec.fill(LivePracticeSpec.message('welcomeVoiceMic'), {'muted': micMuted ? 'muted' : 'unmuted'})}';

  /// The hidden first message for the text chat.
  static String get welcomeText => '${LivePracticeSpec.message('welcome')}\n${LivePracticeSpec.message('welcomeText')}';

  /// The hidden message sent when the learner taps a phrase card.
  static String cardTapped(Phrase p) => LivePracticeSpec.fill(LivePracticeSpec.message('cardSelected'), {'phrase': p.phrase});

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
        if (i < 0) return {'success': false, 'message': LivePracticeSpec.fill(LivePracticeSpec.message('activateNotFound'), {'args': jsonEncode(call.args)})};
        onActivate(i);
        return {'success': true, 'index': i + 1, 'phrase': phrases[i].phrase, 'translation': phrases[i].translation};
      default:
        return {'success': false, 'message': LivePracticeSpec.fill(LivePracticeSpec.message('toolNotFound'), {'name': call.name})};
    }
  }
}
