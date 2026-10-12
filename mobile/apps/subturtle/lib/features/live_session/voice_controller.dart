import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';
import 'package:record/record.dart' hide IosAudioCategory;
import 'package:subturtle_api/subturtle_api.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'gemini_live_client.dart';
import 'session_launch.dart';

enum VoiceStatus { connecting, live, reconnecting, capReached, ended, error }

/// Mic in and speaker out, behind an interface so tests can fake them.
abstract interface class VoiceAudio {
  Future<Stream<Uint8List>> startMic();
  Future<void> stopMic();
  Future<void> startSpeaker();
  void play(Uint8List pcm24k);

  /// Drops queued audio (the learner talked over the coach).
  Future<void> flushSpeaker();
  Future<void> stopSpeaker();
}

/// The real audio: `record` for the mic (16 kHz PCM), `flutter_pcm_sound` for
/// the coach (24 kHz PCM). Same rates as the web worklet and player.
class DeviceVoiceAudio implements VoiceAudio {
  final _recorder = AudioRecorder();

  @override
  Future<Stream<Uint8List>> startMic() => _recorder.startStream(const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
        echoCancel: true,
        noiseSuppress: true,
        autoGain: true,
        iosConfig: IosRecordConfig(categoryOptions: [IosAudioCategoryOption.defaultToSpeaker, IosAudioCategoryOption.allowBluetooth, IosAudioCategoryOption.allowBluetoothA2DP]),
      ));

  @override
  Future<void> stopMic() async {
    await _recorder.stop();
    await _recorder.dispose();
  }

  @override
  Future<void> startSpeaker() async {
    await FlutterPcmSound.setLogLevel(LogLevel.none);
    await FlutterPcmSound.setup(sampleRate: 24000, channelCount: 1, iosAudioCategory: IosAudioCategory.playAndRecord, iosAllowBackgroundAudio: true);
    await FlutterPcmSound.setFeedThreshold(4800);
  }

  @override
  void play(Uint8List pcm24k) {
    FlutterPcmSound.feed(PcmArrayInt16(bytes: ByteData.sublistView(pcm24k)));
  }

  @override
  Future<void> flushSpeaker() async {
    await FlutterPcmSound.release();
    await startSpeaker();
  }

  @override
  Future<void> stopSpeaker() => FlutterPcmSound.release();
}

/// Runs one voice session (S13).
///
/// Order, as on the web: get a token → create the session record → open audio
/// → connect → say hello. Transcript lines and token usage are saved while the
/// session runs; voice time is charged once at the end, counting only the
/// time the socket was connected.
class VoiceController extends ChangeNotifier {
  VoiceController({required this.repo, required this.launch, required this.isFreemium, VoiceAudio? audio, this.onHaptic, GeminiLiveClient Function(GeminiLiveToken token, String? resume)? clientFactory})
      : _audio = audio ?? DeviceVoiceAudio(),
        _clientFactory = clientFactory;

  final LiveSessionRepository repo;
  final SessionLaunch launch;
  final bool isFreemium;
  final VoiceAudio _audio;
  final GeminiLiveClient Function(GeminiLiveToken token, String? resume)? _clientFactory;

  /// 'light' or 'warning', for haptics the screen plays.
  final void Function(String kind)? onHaptic;

  VoiceStatus status = VoiceStatus.connecting;
  Object? error;
  bool muted = false;
  bool captions = true;
  bool coachSpeaking = false;
  String coachLine = '';
  String userLine = '';
  int active = -1;
  final Set<int> done = {};

  /// Seconds allowed this session (from the token); 0 = unknown.
  int maxSeconds = 0;
  Duration connected = Duration.zero;
  bool warned = false;

  GeminiLiveClient? _client;
  StreamSubscription<LiveEvent>? _events;
  StreamSubscription<Uint8List>? _mic;
  String? _sessionId;
  String? _resumeHandle;
  DateTime? _liveSince;
  Timer? _ticker;
  Timer? _speakingOff;
  Timer? _resumeTimer;
  int _turn = 0;
  final _lineIds = <bool, String>{};
  Map<String, dynamic> _totalUsage = {};
  bool _disposed = false;

  Duration get remaining => maxSeconds <= 0 ? Duration.zero : Duration(seconds: maxSeconds) - _connectedNow;
  Duration get _connectedNow => connected + (_liveSince == null ? Duration.zero : DateTime.now().difference(_liveSince!));
  Duration get elapsed => _connectedNow;

  /// Amber: 1 minute left on the free timer, 2 minutes left on paid minutes.
  bool get timerLow => maxSeconds > 0 && remaining <= Duration(minutes: isFreemium ? 1 : 2);

  Future<void> start() async {
    _set(VoiceStatus.connecting);
    try {
      final token = await repo.requestGeminiToken(instructions: launch.instructions, voice: launch.voice, tools: CoachPractice.tools);
      maxSeconds = token.maxSeconds;
      if (maxSeconds == 0) throw ApiException('TIER_LIMIT_REACHED: "voice_minutes" limit reached (0)');
      _sessionId = await repo.createRecord(token: token, metadata: launch.metadata('voice'));
      await _audio.startSpeaker();
      await _connect(token);
      WakelockPlus.enable().ignore();
      _client!.sendText(CoachPractice.welcomeVoice);
      final mic = await _audio.startMic();
      _mic = mic.listen((chunk) {
        if (!muted && status == VoiceStatus.live) _client?.sendAudio(chunk);
      });
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    } catch (e) {
      error = e;
      _set(VoiceStatus.error);
      await _teardown(debit: true);
    }
  }

  Future<void> _connect(GeminiLiveToken token) async {
    final client = _clientFactory?.call(token, _resumeHandle) ??
        GeminiLiveClient(token: token.token, model: token.model, voice: launch.voice, instructions: launch.instructions, tools: CoachPractice.tools, resumeHandle: _resumeHandle);
    await _events?.cancel();
    _client = client;
    _events = client.events.listen(_onEvent);
    await client.connect();
    _liveSince = DateTime.now();
    _set(VoiceStatus.live);
    // Audio sessions are capped at 15 minutes: move to a new socket before that.
    _resumeTimer?.cancel();
    _resumeTimer = Timer(const Duration(minutes: 14), _resume);
  }

  void _onEvent(LiveEvent e) {
    switch (e) {
      case LiveAudio(:final pcm):
        _audio.play(pcm);
        coachSpeaking = true;
        _speakingOff?.cancel();
        _speakingOff = Timer(const Duration(milliseconds: 700), () {
          coachSpeaking = false;
          _notify();
        });
        _notify();
      case LiveTranscript(:final text, :final fromUser, :final finished):
        if (fromUser) {
          userLine = _lineIds.containsKey(true) ? '$userLine$text' : text;
        } else {
          coachLine = _lineIds.containsKey(false) ? '$coachLine$text' : text;
        }
        _lineIds.putIfAbsent(fromUser, () => '${fromUser ? 'user' : 'ai'}-$_turn-${DateTime.now().millisecondsSinceEpoch}');
        if (finished) _flushLine(fromUser);
        _notify();
      case LiveInterrupted():
        _audio.flushSpeaker();
        _flushLine(true);
        _flushLine(false);
      case LiveTurnComplete():
        _flushLine(true);
        _flushLine(false);
        _turn++;
      case LiveToolCall(:final calls):
        final responses = <Map<String, dynamic>>[];
        var finish = false;
        for (final call in calls) {
          final out = CoachPractice.runTool(call, launch.phrases, onActivate: _activate, onFinish: () => finish = true);
          responses.add({'id': ?call.id, 'name': call.name, 'response': {'output': out}});
        }
        _client?.sendToolResponses(responses);
        _notify();
        if (finish) Future<void>.delayed(const Duration(seconds: 4), end);
      case LiveUsage(:final usage):
        _totalUsage = GeminiLiveClient.addUsage(_totalUsage, usage);
        if (_sessionId != null) repo.reportUsage(_sessionId!, partial: usage, total: _totalUsage).ignore();
      case LiveResumeHandle(:final handle):
        _resumeHandle = handle;
      case LiveGoAway():
        _resume();
      case LiveClosed():
        if (status == VoiceStatus.live) _resume();
      case LiveReady():
        break;
    }
  }

  void _flushLine(bool fromUser) {
    final id = _lineIds.remove(fromUser);
    final text = fromUser ? userLine : coachLine;
    if (id == null || text.trim().isEmpty || _sessionId == null) return;
    repo.saveDialogs(_sessionId!, [DialogLine(id: id, content: text.trim(), fromUser: fromUser)]).catchError((_) {});
  }

  void _activate(int i) {
    if (active >= 0 && active != i) done.add(active);
    active = i;
  }

  /// The learner tapped a phrase card.
  void selectPhrase(int i) {
    if (status != VoiceStatus.live || i < 0 || i >= launch.phrases.length) return;
    _activate(i);
    _client?.sendText(CoachPractice.cardTapped(launch.phrases[i]));
    _notify();
  }

  void toggleMute() {
    muted = !muted;
    onHaptic?.call('light');
    _notify();
  }

  void toggleCaptions() {
    captions = !captions;
    _notify();
  }

  /// New socket, same conversation (resumption handle). Time while
  /// disconnected is not counted.
  Future<void> _resume() async {
    if (status == VoiceStatus.reconnecting || status == VoiceStatus.ended || _disposed) return;
    _pauseClock();
    _set(VoiceStatus.reconnecting);
    final handle = _resumeHandle;
    try {
      if (handle == null) throw StateError('No resume handle');
      final token = await repo.requestGeminiToken(instructions: launch.instructions, voice: launch.voice, tools: CoachPractice.tools, resume: true);
      await _client?.close();
      await _connect(token);
    } catch (e) {
      error = e;
      _set(VoiceStatus.error);
    }
  }

  /// "Try again" after the connection was lost.
  Future<void> retry() async {
    if (_resumeHandle != null && _sessionId != null) return _resume();
    await _teardown(debit: true);
    connected = Duration.zero;
    return start();
  }

  void _pauseClock() {
    if (_liveSince != null) connected += DateTime.now().difference(_liveSince!);
    _liveSince = null;
  }

  void _tick() {
    if (status != VoiceStatus.live) return;
    if (maxSeconds > 0) {
      if (timerLow && !warned) {
        warned = true;
        onHaptic?.call('light');
      }
      if (remaining <= Duration.zero) {
        muted = true;
        _pauseClock();
        onHaptic?.call('warning');
        _set(VoiceStatus.capReached);
        _client?.close();
        return;
      }
    }
    _notify();
  }

  /// Ends the session: stops audio, saves the last lines, charges the minutes.
  Future<void> end() async {
    if (status == VoiceStatus.ended) return;
    _pauseClock();
    _flushLine(true);
    _flushLine(false);
    _set(VoiceStatus.ended);
    await _teardown(debit: true);
  }

  bool _debited = false;

  Future<void> _teardown({required bool debit}) async {
    _ticker?.cancel();
    _resumeTimer?.cancel();
    _speakingOff?.cancel();
    await _mic?.cancel();
    _mic = null;
    try {
      await _audio.stopMic();
    } catch (_) {}
    try {
      await _audio.stopSpeaker();
    } catch (_) {}
    await _events?.cancel();
    await _client?.close();
    _client = null;
    WakelockPlus.disable().ignore();
    if (debit && !_debited && connected.inSeconds > 0) {
      _debited = true;
      try {
        await repo.debitVoice(connected.inSeconds);
      } catch (_) {
        // The server also caps at the next token request; a failed debit is not fatal here.
      }
    }
  }

  void _set(VoiceStatus s) {
    status = s;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _pauseClock();
    _teardown(debit: true);
    super.dispose();
  }
}
