import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:subturtle_api/subturtle_api.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Something the Gemini Live server told us.
sealed class LiveEvent {
  const LiveEvent();
}

/// The session is ready; audio and text may be sent now.
class LiveReady extends LiveEvent {
  const LiveReady();
}

/// 24 kHz, mono, 16-bit little-endian PCM from the coach.
class LiveAudio extends LiveEvent {
  const LiveAudio(this.pcm);
  final Uint8List pcm;
}

/// Part of a transcript line. [fromUser] true = what the learner said.
class LiveTranscript extends LiveEvent {
  const LiveTranscript(this.text, {required this.fromUser, this.finished = false});
  final String text;
  final bool fromUser;
  final bool finished;
}

/// The learner talked over the coach: stop playing queued audio.
class LiveInterrupted extends LiveEvent {
  const LiveInterrupted();
}

/// The coach finished its turn.
class LiveTurnComplete extends LiveEvent {
  const LiveTurnComplete();
}

class LiveToolCall extends LiveEvent {
  const LiveToolCall(this.calls);
  final List<CoachToolCall> calls;
}

/// Token usage of one message, already in the backend's `GeminiTokenUsageType` shape.
class LiveUsage extends LiveEvent {
  const LiveUsage(this.usage);
  final Map<String, dynamic> usage;
}

/// A handle to resume this conversation on a new socket.
class LiveResumeHandle extends LiveEvent {
  const LiveResumeHandle(this.handle);
  final String handle;
}

/// The server will close soon (session time limit): reconnect with the handle.
class LiveGoAway extends LiveEvent {
  const LiveGoAway();
}

class LiveClosed extends LiveEvent {
  const LiveClosed({this.code, this.reason});
  final int? code;
  final String? reason;
}

/// Opens a WebSocket for tests.
typedef SocketFactory = WebSocketChannel Function(Uri url);

/// A small Dart client for the Gemini Live API (BidiGenerateContent over a
/// WebSocket), used with the single-use ephemeral token the backend issues.
///
/// It sends the same setup the web sends through `@google/genai`: audio out,
/// the coach voice, the system prompt, the two practice tools, input and output
/// transcription, session resumption and a sliding context window. The token
/// already locks these on the server side (`liveConnectConstraints`).
class GeminiLiveClient {
  GeminiLiveClient({
    required this.token,
    required this.model,
    required this.voice,
    required this.instructions,
    this.tools = const [],
    this.resumeHandle,
    SocketFactory? socketFactory,
  }) : _factory = socketFactory ?? WebSocketChannel.connect;

  final String token;
  final String model;
  final String voice;
  final String instructions;
  final List<CoachTool> tools;
  final String? resumeHandle;
  final SocketFactory _factory;

  /// Ephemeral tokens must use the v1alpha "constrained" endpoint with `access_token`.
  static Uri endpoint(String token) => Uri.parse(
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained',
      ).replace(queryParameters: {'access_token': token});

  WebSocketChannel? _socket;
  StreamSubscription<dynamic>? _sub;
  final _events = StreamController<LiveEvent>.broadcast();
  bool _ready = false;

  Stream<LiveEvent> get events => _events.stream;
  bool get isReady => _ready;

  /// Opens the socket, sends the setup, and waits for `setupComplete` (10 s).
  Future<void> connect() async {
    final socket = _factory(endpoint(token));
    _socket = socket;
    final ready = Completer<void>();
    _sub = socket.stream.listen(
      (raw) {
        final msg = _decode(raw);
        if (msg == null) return;
        if (msg.containsKey('setupComplete')) {
          _ready = true;
          if (!ready.isCompleted) ready.complete();
          _events.add(const LiveReady());
          return;
        }
        for (final e in parseServerMessage(msg)) {
          _events.add(e);
        }
      },
      onError: (Object e) {
        if (!ready.isCompleted) ready.completeError(e);
        _events.add(LiveClosed(reason: e.toString()));
      },
      onDone: () {
        _ready = false;
        if (!ready.isCompleted) ready.completeError(StateError('Closed before setup (${socket.closeCode}): ${socket.closeReason}'));
        _events.add(LiveClosed(code: socket.closeCode, reason: socket.closeReason));
      },
    );
    await socket.ready;
    socket.sink.add(jsonEncode(setupMessage()));
    await ready.future.timeout(const Duration(seconds: 10));
  }

  /// The first message on the socket.
  Map<String, dynamic> setupMessage() => {
        'setup': {
          'model': model.startsWith('models/') ? model : 'models/$model',
          'generationConfig': {
            'responseModalities': ['AUDIO'],
            'speechConfig': {
              'voiceConfig': {
                'prebuiltVoiceConfig': {'voiceName': voice},
              },
            },
          },
          'systemInstruction': {
            'parts': [
              {'text': instructions},
            ],
          },
          if (tools.isNotEmpty)
            'tools': [
              {'functionDeclarations': tools.map((t) => t.toJson()).toList()},
            ],
          'inputAudioTranscription': <String, dynamic>{},
          'outputAudioTranscription': <String, dynamic>{},
          'sessionResumption': resumeHandle == null ? <String, dynamic>{} : {'handle': resumeHandle},
          'contextWindowCompression': {'slidingWindow': <String, dynamic>{}},
        },
      };

  /// 16 kHz, mono, 16-bit little-endian PCM from the mic.
  void sendAudio(Uint8List pcm16k) {
    if (!_ready) return;
    _socket?.sink.add(jsonEncode({
      'realtimeInput': {
        'audio': {'data': base64Encode(pcm16k), 'mimeType': 'audio/pcm;rate=16000'},
      },
    }));
  }

  /// A text turn (hidden nudges like the welcome or a card tap).
  void sendText(String text) {
    if (!_ready) return;
    _socket?.sink.add(jsonEncode({
      'realtimeInput': {'text': text},
    }));
  }

  void sendToolResponses(List<Map<String, dynamic>> responses) {
    if (!_ready) return;
    _socket?.sink.add(jsonEncode({
      'toolResponse': {'functionResponses': responses},
    }));
  }

  Future<void> close() async {
    _ready = false;
    await _sub?.cancel();
    await _socket?.sink.close();
    _socket = null;
  }

  Future<void> dispose() async {
    await close();
    await _events.close();
  }

  static Map<String, dynamic>? _decode(dynamic raw) {
    try {
      final text = raw is String ? raw : utf8.decode(raw as List<int>);
      final v = jsonDecode(text);
      return v is Map ? Map<String, dynamic>.from(v) : null;
    } catch (_) {
      return null;
    }
  }

  /// Turns one server message into events. Public for tests.
  static List<LiveEvent> parseServerMessage(Map<String, dynamic> msg) {
    final out = <LiveEvent>[];
    final content = msg['serverContent'];
    if (content is Map) {
      final turn = content['modelTurn'];
      if (turn is Map && turn['parts'] is List) {
        for (final part in turn['parts'] as List) {
          final inline = part is Map ? part['inlineData'] : null;
          if (inline is Map && inline['data'] is String) out.add(LiveAudio(base64Decode(inline['data'] as String)));
        }
      }
      final input = content['inputTranscription'];
      if (input is Map && (input['text'] ?? '').toString().isNotEmpty) out.add(LiveTranscript(input['text'].toString(), fromUser: true, finished: input['finished'] == true));
      final output = content['outputTranscription'];
      if (output is Map && (output['text'] ?? '').toString().isNotEmpty) out.add(LiveTranscript(output['text'].toString(), fromUser: false, finished: output['finished'] == true));
      if (content['interrupted'] == true) out.add(const LiveInterrupted());
      if (content['turnComplete'] == true || content['generationComplete'] == true) out.add(const LiveTurnComplete());
    }
    final tool = msg['toolCall'];
    if (tool is Map && tool['functionCalls'] is List) {
      out.add(LiveToolCall([for (final c in tool['functionCalls'] as List) CoachToolCall.fromJson(c)]));
    }
    final usage = msg['usageMetadata'];
    if (usage is Map) out.add(LiveUsage(mapUsage(Map<String, dynamic>.from(usage))));
    final resume = msg['sessionResumptionUpdate'];
    if (resume is Map && resume['newHandle'] is String && (resume['newHandle'] as String).isNotEmpty) out.add(LiveResumeHandle(resume['newHandle'] as String));
    if (msg.containsKey('goAway')) out.add(const LiveGoAway());
    return out;
  }

  /// Gemini `usageMetadata` → the backend's `GeminiTokenUsageType`. Every nested
  /// field is filled, because the server reads them without null checks.
  static Map<String, dynamic> mapUsage(Map<String, dynamic> u) {
    int n(dynamic v) => v is num ? v.toInt() : 0;
    Map<String, int> byModality(dynamic list) {
      final m = {'text_tokens': 0, 'audio_tokens': 0, 'image_tokens': 0, 'video_tokens': 0};
      if (list is List) {
        for (final d in list) {
          if (d is! Map) continue;
          final key = switch ((d['modality'] ?? '').toString().toUpperCase()) {
            'TEXT' => 'text_tokens',
            'AUDIO' => 'audio_tokens',
            'IMAGE' => 'image_tokens',
            'VIDEO' => 'video_tokens',
            _ => null,
          };
          if (key != null) m[key] = m[key]! + n(d['tokenCount']);
        }
      }
      return m;
    }

    final prompt = byModality(u['promptTokensDetails']);
    final response = byModality(u['responseTokensDetails']);
    final cached = byModality(u['cacheTokensDetails']);
    return {
      'total_tokens': n(u['totalTokenCount']),
      'prompt_tokens': n(u['promptTokenCount']),
      'response_tokens': n(u['responseTokenCount'] ?? u['candidatesTokenCount']),
      'tool_use_tokens': n(u['toolUsePromptTokenCount']),
      'thoughts_tokens': n(u['thoughtsTokenCount']),
      'prompt_tokens_details': prompt,
      'response_tokens_details': {'text_tokens': response['text_tokens'], 'audio_tokens': response['audio_tokens']},
      'cached_tokens': n(u['cachedContentTokenCount']),
      'cached_tokens_details': {'text_tokens': cached['text_tokens'], 'audio_tokens': cached['audio_tokens']},
    };
  }

  /// Adds two usage maps (for the running total).
  static Map<String, dynamic> addUsage(Map<String, dynamic> a, Map<String, dynamic> b) {
    dynamic add(dynamic x, dynamic y) {
      if (x is Map || y is Map) {
        final xm = x is Map ? x : const {};
        final ym = y is Map ? y : const {};
        return {for (final k in {...xm.keys, ...ym.keys}) k: add(xm[k], ym[k])};
      }
      return (x is num ? x : 0) + (y is num ? y : 0);
    }

    return Map<String, dynamic>.from(add(a, b) as Map);
  }
}
