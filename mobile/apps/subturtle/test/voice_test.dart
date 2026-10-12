import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stream_channel/stream_channel.dart';
import 'package:subturtle/features/live_session/gemini_live_client.dart';
import 'package:subturtle/features/live_session/session_launch.dart';
import 'package:subturtle/features/live_session/voice_controller.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'fake_backend.dart';

/// A WebSocket that talks to the test instead of Google.
class FakeSocket with StreamChannelMixin<dynamic> implements WebSocketChannel {
  final toClient = StreamController<dynamic>();
  final sent = <Map<String, dynamic>>[];
  late final _sink = _Sink(this);

  @override
  Stream<dynamic> get stream => toClient.stream;
  @override
  WebSocketSink get sink => _sink;
  @override
  Future<void> get ready => Future.value();
  @override
  int? get closeCode => null;
  @override
  String? get closeReason => null;
  @override
  String? get protocol => null;

  void serverSends(Map<String, dynamic> msg) => toClient.add(utf8.encode(jsonEncode(msg)));
}

class _Sink implements WebSocketSink {
  _Sink(this.s);
  final FakeSocket s;
  @override
  void add(dynamic data) {
    final m = Map<String, dynamic>.from(jsonDecode(data as String) as Map);
    s.sent.add(m);
    if (m.containsKey('setup')) scheduleMicrotask(() => s.serverSends({'setupComplete': {}}));
  }

  @override
  void addError(Object error, [StackTrace? stackTrace]) {}
  @override
  Future<void> addStream(Stream<dynamic> stream) async {}
  @override
  Future<void> close([int? closeCode, String? closeReason]) async => s.toClient.close();
  @override
  Future<void> get done => Future.value();
}

class FakeAudio implements VoiceAudio {
  final mic = StreamController<Uint8List>();
  final played = <int>[];
  int flushes = 0;
  @override
  Future<Stream<Uint8List>> startMic() async => mic.stream;
  @override
  Future<void> stopMic() async {}
  @override
  Future<void> startSpeaker() async {}
  @override
  void play(Uint8List pcm24k) => played.addAll(pcm24k);
  @override
  Future<void> flushSpeaker() async => flushes++;
  @override
  Future<void> stopSpeaker() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // wakelock_plus has no platform side in tests.
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMessageHandler('dev.flutter.pigeon.wakelock_plus_platform_interface.WakelockPlusApi.toggle', (_) async => const StandardMessageCodec().encodeMessage(<Object?>[]));

  test('voice session: token, record, setup, hello, audio, tools, transcript, end', () async {
    final backend = FakeBackend()..seedDefaults();
    backend.functions['request-gemini-live-session-ephemeral-token'] = (_) => {
          'model': 'gemini-3.1-flash-live-preview',
          'voice': 'Kore',
          'voice_session_max_seconds': 300,
          'client_secret': {'value': 'auth_tokens/x'},
        };
    backend.functions['create-live-session-record'] = (_) => {'_id': 'ls1'};
    backend.functions['update-live-session-record'] = (_) => {'success': true};
    backend.functions['debit-voice-minutes'] = (_) => {'total': 5, 'used': 1, 'remaining': 4};
    final api = SubturtleApi(baseUrl: 'https://api.test', httpClient: backend.client, tokenStore: MemoryTokenStore('h.eyJpZCI6InUxIn0.s'));
    await api.auth.restore();

    final socket = FakeSocket();
    final audio = FakeAudio();
    const phrases = [Phrase(id: '1', phrase: 'had to', translation: 'باید'), Phrase(id: '2', phrase: 'get out of', translation: 'بیرون رفتن')];
    final c = VoiceController(
      repo: api.liveSessions,
      launch: const SessionLaunch(bundle: Bundle(id: 'b1', title: 'ST'), phrases: phrases, voice: 'Kore', nativeLanguage: 'Persian'),
      isFreemium: true,
      audio: audio,
      clientFactory: (token, resume) => GeminiLiveClient(
        token: token.token,
        model: token.model,
        voice: 'Kore',
        instructions: 'x',
        tools: CoachPractice.tools,
        resumeHandle: resume,
        socketFactory: (_) => socket,
      ),
    );
    await c.start();
    expect(c.status, VoiceStatus.live);
    expect(c.maxSeconds, 300);
    expect(socket.sent.first.containsKey('setup'), isTrue);
    expect(socket.sent[1]['realtimeInput']['text'], contains('Welcome the user'));

    // Mic audio goes out while unmuted, not while muted.
    audio.mic.add(Uint8List.fromList([1, 2, 3, 4]));
    await Future<void>.delayed(Duration.zero);
    expect(socket.sent.last['realtimeInput']['audio']['mimeType'], 'audio/pcm;rate=16000');
    c.toggleMute();
    final before = socket.sent.length;
    audio.mic.add(Uint8List.fromList([5, 6]));
    await Future<void>.delayed(Duration.zero);
    expect(socket.sent.length, before);
    c.toggleMute();

    // Coach audio, a tool call, a transcript line, a turn end.
    socket.serverSends({
      'serverContent': {
        'modelTurn': {
          'parts': [
            {'inlineData': {'data': base64Encode([9, 9]), 'mimeType': 'audio/pcm;rate=24000'}},
          ],
        },
        'outputTranscription': {'text': "Let's practise get out of."},
      },
    });
    socket.serverSends({
      'toolCall': {
        'functionCalls': [
          {'id': 't1', 'name': 'activate_phrase', 'args': {'index': 2}},
        ],
      },
    });
    socket.serverSends({'serverContent': {'turnComplete': true}});
    socket.serverSends({'usageMetadata': {'totalTokenCount': 5, 'promptTokenCount': 2, 'responseTokenCount': 3}});
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(audio.played, [9, 9]);
    expect(c.active, 1);
    expect(socket.sent.last['toolResponse']['functionResponses'][0]['response']['output']['phrase'], 'get out of');
    expect(c.coachLine, "Let's practise get out of.");
    final dialogs = backend.calls.where((x) => x.$1 == 'update-live-session-record' && (x.$2['update'] as Map).containsKey('dialogs'));
    expect(dialogs, isNotEmpty);
    final usage = backend.calls.where((x) => x.$1 == 'update-live-session-record' && (x.$2['update'] as Map).containsKey('partialUsage'));
    expect(usage.single.$2['update']['partialUsage']['total_tokens'], 5);

    // Interrupted: drop queued audio.
    socket.serverSends({'serverContent': {'interrupted': true}});
    await Future<void>.delayed(Duration.zero);
    expect(audio.flushes, 1);

    await c.end();
    expect(c.status, VoiceStatus.ended);
    c.dispose();
  });

  test('no minutes left: the session does not open', () async {
    final backend = FakeBackend()..seedDefaults();
    backend.functions['request-gemini-live-session-ephemeral-token'] = (_) => throw ApiException('TIER_LIMIT_REACHED: "voice_minutes" limit reached (5)');
    final api = SubturtleApi(baseUrl: 'https://api.test', httpClient: backend.client, tokenStore: MemoryTokenStore('h.eyJpZCI6InUxIn0.s'));
    await api.auth.restore();
    final c = VoiceController(
      repo: api.liveSessions,
      launch: const SessionLaunch(bundle: Bundle(id: 'b1', title: 'ST'), phrases: [], voice: 'Kore', nativeLanguage: 'auto'),
      isFreemium: true,
      audio: FakeAudio(),
    );
    await c.start();
    expect(c.status, VoiceStatus.error);
    expect((c.error as ApiException).feature, 'voice_minutes');
    expect(backend.calls.where((x) => x.$1 == 'create-live-session-record'), isEmpty);
    c.dispose();
  });
}
