import 'package:flutter/foundation.dart';
import 'package:subturtle_api/subturtle_api.dart';

import '../../shared/format.dart';
import 'save_engine.dart';
import 'save_session.dart';

export 'save_engine.dart' show phrasesIn;

/// What the assistant says before the first message.
const assistantGreeting = "Send me a word or a sentence. I'll explain it, and you can save it.";

/// The logic behind the save assistant sheet, without widgets.
///
/// A chat starts with a word or a sentence. The assistant finds the phrases in
/// it, the learner picks one, sees its translation card and saves it, and can
/// ask follow-up questions. The [engine] does the work: on the phone, or on
/// the `save_assistant` backend.
class SaveAssistant extends ChangeNotifier {
  SaveAssistant({required this.api, required this.engine, required this.languageName, DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final SubturtleApi api;
  final SaveEngine engine;

  /// The learner's language, e.g. "Persian": phrases are saved with it.
  final String languageName;
  final DateTime Function() _clock;

  SaveSession? _session;
  SaveSession? get session => _session;
  bool get started => _session != null;

  /// Looking for the phrases in the first message (or loading a chat).
  bool findingParts = false;

  /// Starting the chat failed: offline, AI budget used up, assistant down.
  Object? startError;

  /// Waiting for the tutor's answer.
  bool thinking = false;

  bool saving = false;

  /// The chat is a few messages from its cap: suggest a new one.
  bool wrapUp = false;

  /// The last answer failed with a plan limit (budget, message cap): the sheet
  /// shows the limit card instead of a bubble.
  ApiException? limit;

  final Map<String, DetailedTranslation> _cards = {};

  /// The language the learner chose for a phrase ("Save to English", or the
  /// "which language" list). It changes this phrase only, never the active one.
  final Map<String, String> chosenLanguage = {};

  /// Phrases kept for a language the learner has not added ("Keep for German"):
  /// phrase → the language and the pending phrase on the server.
  final Map<String, ({String language, String phraseId})> kept = {};

  /// The language a phrase was detected in, when the server says.
  String? detectedLanguageOf(String phrase) {
    final card = cardFor(phrase);
    return card?.detectedLanguage ?? card?.resolvedLanguage;
  }

  void chooseLanguage(String phrase, String? code) {
    code == null ? chosenLanguage.remove(phrase) : chosenLanguage[phrase] = code;
    _changed();
  }

  /// "Keep for German": holds the phrase on the server for 30 days; it joins
  /// German when the learner adds it.
  Future<void> keep(String phrase, String language) async {
    final s = _session!;
    final detail = cardFor(phrase);
    var translation = detail?.translation ?? '';
    if (translation.isEmpty) translation = await api.translation.translateSimple(phrase: phrase, context: s.sentence, targetLanguage: languageName);
    final res = await api.languages.keepPending(language: language, phrase: {
      'phrase': phrase,
      'translation': translation,
      'translation_language': languageName,
      'context': s.sentence,
      'type': detail == null ? 'normal' : 'linguistic',
      if (detail != null) ...{
        'direction': {'source': detail.sourceDirection, 'target': detail.targetDirection},
        'language_info': {'source': language, 'target': detail.targetLanguage ?? languageName},
        'linguistic_data': ?detail.linguistic?.toJson(),
        'chunks': detail.chunks.map((c) => c.toJson()).toList(),
      },
    });
    kept[phrase] = (language: language, phraseId: res.phraseId);
    _changed();
  }

  /// Undo "Keep for German": the pending phrase is deleted.
  Future<void> undoKeep(String phrase) async {
    final k = kept[phrase];
    if (k == null) return;
    final uid = api.auth.user?.id;
    if (k.phraseId.isNotEmpty && uid != null) {
      await api.data.removeOne(database: Db.userContent, collection: Db.phrase, query: {'_id': k.phraseId, 'refId': uid});
    }
    kept.remove(phrase);
    _changed();
  }
  final Set<String> _loadingCards = {};
  final Set<String> _failedCards = {};

  /// The picked phrase, or null while the phrases are being found.
  String? get current {
    final s = _session;
    if (s == null || s.candidates.isEmpty) return null;
    return s.candidates[s.picked.clamp(0, s.candidates.length - 1)];
  }

  DetailedTranslation? cardFor(String phrase) => _cards[phrase] ?? _cards.entries.where((e) => e.key.toLowerCase() == phrase.toLowerCase()).firstOrNull?.value;
  bool isLoadingCard(String phrase) => _loadingCards.contains(phrase);
  bool cardFailed(String phrase) => _failedCards.contains(phrase);

  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  void _update(SaveSession s) {
    _session = s.copyWith(updatedAt: _clock());
    _changed();
    engine.persist(_session!).catchError((Object e) => debugPrint('Save history write failed: $e'));
  }

  void _reset() {
    _cards.clear();
    _failedCards.clear();
    chosenLanguage.clear();
    kept.clear();
    startError = null;
    limit = null;
    wrapUp = false;
  }

  // ---------------------------------------------------------------- flow

  String _source = 'typed';

  /// Starts a new chat with [text]. [source] is `typed`, `paste` or `share`.
  Future<void> start(String text, {String source = 'typed'}) async {
    final sentence = text.trim();
    if (sentence.isEmpty) return;
    _reset();
    _source = source;
    final now = _clock();
    // A placeholder until the engine answers, so the first bubble shows at once.
    _session = SaveSession(id: '', sentence: sentence, createdAt: now, updatedAt: now);
    findingParts = true;
    _changed();
    try {
      final (s, cards) = await engine.start(sentence, now: now, source: source);
      if (_disposed || _session?.sentence != sentence || _session?.id != '') return;
      _cards.addAll(cards);
      findingParts = false;
      _update(s);
    } catch (e) {
      if (_disposed || _session?.id != '') return;
      findingParts = false;
      startError = e;
      _changed();
      return;
    }
    if (current != null) await _loadCard(current!);
  }

  /// Tries the failed start again with the same sentence.
  Future<void> retryStart() async {
    final s = _session;
    if (s != null && startError != null) await start(s.sentence, source: _source);
  }

  /// Reopens a chat from the history.
  Future<void> open(SaveSession session) async {
    _reset();
    _session = session;
    findingParts = true;
    _changed();
    try {
      final (s, cards) = await engine.open(session);
      if (_disposed || _session?.id != session.id) return;
      _cards.addAll(cards);
      _session = s;
    } catch (e) {
      debugPrint('Opening the chat failed: $e');
      if (_disposed || _session?.id != session.id) return;
      startError = e;
      findingParts = false;
      _changed();
      return;
    }
    findingParts = false;
    _changed();
    if (current != null) await _loadCard(current!);
  }

  /// Picks the phrase chip at [index] and loads its card.
  Future<void> pick(int index) async {
    final s = _session;
    if (s == null || index < 0 || index >= s.candidates.length) return;
    _update(s.copyWith(picked: index));
    await _loadCard(s.candidates[index]);
  }

  Future<void> retryCard() async {
    final p = current;
    if (p != null) await _loadCard(p);
  }

  Future<void> _loadCard(String phrase) async {
    if (cardFor(phrase) != null || _loadingCards.contains(phrase)) return;
    _loadingCards.add(phrase);
    _failedCards.remove(phrase);
    _changed();
    try {
      final res = await engine.translate(_session!, phrase);
      _cards[phrase] = res.translation;
      if (res.wrapUp) wrapUp = true;
    } catch (e) {
      debugPrint('Translating "$phrase" failed: $e');
      if (_isLimit(e)) limit = e as ApiException;
      _failedCards.add(phrase);
    } finally {
      _loadingCards.remove(phrase);
      _changed();
    }
  }

  /// Saves the picked phrase to [bundle]. Throws [ApiException] (offline,
  /// save limit) for the sheet to show.
  /// Saves the current phrase into [bundle], in [language] (the phrase's
  /// language; the active one when null).
  Future<Phrase> save(Bundle bundle, {String? language}) async {
    final s = _session!;
    final phrase = current!;
    saving = true;
    _changed();
    try {
      final detail = cardFor(phrase);
      var translation = detail?.translation ?? '';
      if (translation.isEmpty) {
        translation = await api.translation.translateSimple(phrase: phrase, context: s.sentence, targetLanguage: languageName);
      }
      if (translation.isEmpty) throw ApiException("We couldn't translate this phrase.");
      final saved = await api.bundles.createPhrase(
        phrase: phrase,
        translation: translation,
        bundleIds: [bundle.id],
        translationLanguage: languageName,
        context: s.sentence,
        detail: detail,
        language: language,
      );
      final ref = SavedPhraseRef(text: phrase, phraseId: saved.id, bundleId: bundle.id, bundleTitle: bundle.title);
      // The phrase is saved either way; linking it to the chat is a bonus.
      await engine.attach(s, ref).catchError((Object e) => debugPrint('Linking the saved phrase failed: $e'));
      final refs = [...s.saved, ref];
      final next = s.candidates.where((c) => c != phrase && !refs.any((r) => r.text == c)).firstOrNull;
      final note = 'Saved "$phrase". You will meet it in your next new-words session.${next == null ? '' : ' Want to save "$next" too? Tap it above.'}';
      _update(_session!.copyWith(saved: refs, log: [..._session!.log, ChatLine(fromUser: false, text: note)]));
      return saved;
    } finally {
      saving = false;
      _changed();
    }
  }

  /// Removes a phrase saved from this chat from its bundle again.
  Future<void> undo(String phrase) async {
    final s = _session!;
    final ref = s.saved.where((r) => r.text == phrase).firstOrNull;
    if (ref == null) return;
    await api.bundles.removePhrase(phraseId: ref.phraseId, bundleId: ref.bundleId);
    _update(_session!.copyWith(saved: [for (final r in _session!.saved) if (r.text != phrase) r]));
  }

  /// Asks the tutor about the picked phrase. [shown] is what the learner's
  /// bubble says when it differs from [message] (quick replies).
  Future<void> ask(String message, {String? shown}) async {
    final s = _session;
    final text = message.trim();
    if (s == null || s.id.isEmpty || text.isEmpty || thinking) return;
    _update(s.copyWith(log: [...s.log, ChatLine(fromUser: true, text: shown ?? text)]));
    thinking = true;
    limit = null;
    _changed();
    String? reply;
    List<String>? candidates;
    try {
      final res = await engine.ask(s, current ?? s.sentence, text);
      reply = res.reply.isEmpty ? "I'm not sure. Could you ask it another way?" : res.reply;
      candidates = res.candidates;
      if (res.wrapUp) wrapUp = true;
    } catch (e) {
      if (_isLimit(e)) {
        limit = e as ApiException;
      } else if (e is ApiException && e.isNetwork) {
        reply = "I couldn't reach the server. Please try again when you're online.";
      } else {
        reply = "I couldn't answer just now. Please try again.";
      }
    }
    thinking = false;
    if (_disposed || _session?.id != s.id) return;
    final now = _session!;
    _update(now.copyWith(
      candidates: candidates,
      log: reply == null ? now.log : [...now.log, ChatLine(fromUser: false, text: reply)],
    ));
  }

  /// The quick replies under the chat, for the picked phrase: (chip, message).
  List<(String, String)> quickReplies() {
    final p = current ?? _session?.sentence ?? '';
    return [
      ('Another example', 'Give me another example with "$p".'),
      ('Is it formal?', 'Is "$p" formal?'),
      ('Use it in a question', 'How do I use "$p" in a question?'),
    ];
  }
}

/// AI budget used up, or the chat's message cap: a plan limit, not a glitch.
bool _isLimit(Object e) => e is ApiException && (e.code == ApiException.aiCreditExhausted || e.isTierLimit);

/// The sentence for a start or a limit error, short and kind.
String saveAssistantError(Object e) {
  if (e is ApiException && e.code == ApiException.saveAssistantUnavailable) return "The assistant couldn't answer. Please try again.";
  return friendlyError(e);
}

/// True when [text], typed in the chat's input bar, reads like a question about
/// the current phrase; false when it looks like a new sentence to learn from.
bool looksLikeQuestion(String text) {
  final t = text.trim().toLowerCase();
  if (t.endsWith('?')) return true;
  final first = t.split(RegExp(r'\s+')).first;
  const askWords = {
    'what', 'why', 'how', 'when', 'where', 'which', 'who', 'is', 'are', 'can', 'could', 'should', 'would', 'does', 'do', 'did', //
    'explain', 'give', 'tell', 'show', 'use', 'another', 'more', 'meaning', 'difference', 'example', 'examples',
  };
  return askWords.contains(first);
}
