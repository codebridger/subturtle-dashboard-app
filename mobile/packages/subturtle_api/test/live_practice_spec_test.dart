import 'dart:convert';
import 'dart:io';

import 'package:subturtle_api/subturtle_api.dart';
import 'package:test/test.dart';

import '../tool/gen_live_practice.dart' as gen;

/// The coach spec is shared with the web. These fail when the Dart copy is
/// stale: run `dart run tool/gen_live_practice.dart`.
void main() {
  final specFile = File('../../../shared/live-practice/spec.json');

  test('the generated Dart file matches shared/live-practice/spec.json', () {
    final json = specFile.readAsStringSync();
    expect(LivePracticeSpec.rawJson, json);
    expect(File(gen.outPath).readAsStringSync(), gen.generate(json));
  });

  test('prompt, tools and messages come from the spec', () {
    final spec = jsonDecode(specFile.readAsStringSync()) as Map<String, dynamic>;
    const phrases = [Phrase(id: '1', phrase: 'had to', translation: 'باید', translationLanguage: 'Persian')];

    final prompt = CoachPractice.instructions(phrases, 'Persian');
    expect(prompt, (spec['instructionsTemplate'] as String).replaceAll('[nativeLanguage]', 'Persian').replaceFirst('[phrases]', '1. had to: باید'));
    expect(CoachPractice.resolveNativeLanguage('auto', phrases), "Persian (auto-detected from the bundle's translation language)");

    expect(CoachPractice.tools.map((t) => t.toJson()).toList(), spec['tools']);

    final messages = spec['messages'] as Map<String, dynamic>;
    expect(CoachPractice.welcomeVoice(), '${messages['welcome']}\nThen encourage the user to unmute the microphone, microphone is muted');
    expect(CoachPractice.welcomeText, '${messages['welcome']}\n${messages['welcomeText']}');
    expect(CoachPractice.cardTapped(phrases.first), 'The user selected a different vocabulary: "had to". Let\'s start practicing on it.');

    final miss = CoachPractice.runTool(const CoachToolCall(name: 'activate_phrase', args: {'index': 9}), phrases, onActivate: (_) {}, onFinish: () {});
    expect(miss['message'], 'Could not find a vocabulary matching {"index":9}.', reason: 'the same text as the web (JSON.stringify)');

    expect(LivePracticeSpec.micStartsMuted, isTrue);
    expect(LivePracticeSpec.practicedOn, 'user-turn');
  });
}
