import 'package:flutter/foundation.dart';
import 'package:subturtle_api/subturtle_api.dart';

import 'save_session.dart';

/// What the assistant says before the first message.
const assistantGreeting = "Send me a word or a sentence. I'll explain it, and you can save it.";

/// The logic behind the save assistant sheet, without widgets.
///
/// A chat starts with a word or a sentence. The assistant finds the phrases in
/// it (the `chunks` of a detailed translation of the whole sentence), the
/// learner picks one, sees its translation card and saves it. Follow-up
/// questions go to `translationAdvice`. Every change is written to [repo].
class SaveAssistant extends ChangeNotifier {
  SaveAssistant({required this.api, required this.repo, required this.languageName, DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final SubturtleApi api;
  final SaveSessionRepository repo;

  /// The learner's language, e.g. "Persian": translations and tutor replies use it.
  final String languageName;
  final DateTime Function() _clock;

  SaveSession? _session;
  SaveSession? get session => _session;
  bool get started => _session != null;

  /// Looking for the phrases in the first message.
  bool findingParts = false;

  /// Waiting for the tutor's answer.
  bool thinking = false;

  bool saving = false;

  final Map<String, DetailedTranslation> _cards = {};
  final Set<String> _loadingCards = {};
  final Set<String> _failedCards = {};

  /// The picked phrase, or null while the phrases are being found.
  String? get current {
    final s = _session;
    if (s == null || s.candidates.isEmpty) return null;
    return s.candidates[s.picked.clamp(0, s.candidates.length - 1)];
  }

  DetailedTranslation? cardFor(String phrase) => _cards[phrase];
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
    repo.put(_session!).catchError((Object e) => debugPrint('Save history write failed: $e'));
  }

  // ---------------------------------------------------------------- flow

  /// Starts a new chat with [text] (typed, pasted or shared).
  Future<void> start(String text) async {
    final sentence = text.trim();
    if (sentence.isEmpty) return;
    final now = _clock();
    _cards.clear();
    _failedCards.clear();
    _update(SaveSession(id: '${now.microsecondsSinceEpoch}', sentence: sentence, createdAt: now, updatedAt: now));
    await _findParts();
  }

  /// Reopens a chat from the history.
  Future<void> open(SaveSession session) async {
    _cards.clear();
    _failedCards.clear();
    _session = session;
    _changed();
    if (session.candidates.isEmpty) {
      await _findParts();
    } else {
      await _loadCard(current!);
    }
  }

  Future<void> _findParts() async {
    final sentence = _session!.sentence;
    findingParts = true;
    _changed();
    var parts = [sentence];
    // A word or a short phrase is the phrase itself; only split real sentences.
    if (_wordCount(sentence) > 3) {
      try {
        final whole = await api.translation.translateDetailed(phrase: sentence, context: sentence, targetLanguage: languageName);
        parts = phrasesIn(sentence, whole.chunks.map((c) => c.text));
        if (parts.isEmpty) parts = [sentence];
        if (parts.length == 1 && parts.single == sentence) _cards[sentence] = whole;
      } catch (e) {
        debugPrint('Finding phrases failed: $e');
      }
    }
    findingParts = false;
    if (_disposed || _session?.sentence != sentence) return;
    _update(_session!.copyWith(candidates: parts, picked: 0));
    await _loadCard(parts.first);
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
    if (_cards.containsKey(phrase) || _loadingCards.contains(phrase)) return;
    _loadingCards.add(phrase);
    _failedCards.remove(phrase);
    _changed();
    try {
      _cards[phrase] = await api.translation.translateDetailed(phrase: phrase, context: _session!.sentence, targetLanguage: languageName);
    } catch (e) {
      debugPrint('Translating "$phrase" failed: $e');
      _failedCards.add(phrase);
    } finally {
      _loadingCards.remove(phrase);
      _changed();
    }
  }

  /// Saves the picked phrase to [bundle]. Throws [ApiException] (offline,
  /// save limit) for the sheet to show.
  Future<Phrase> save(Bundle bundle) async {
    final s = _session!;
    final phrase = current!;
    saving = true;
    _changed();
    try {
      final detail = _cards[phrase];
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
      );
      final refs = [...s.saved, SavedPhraseRef(text: phrase, phraseId: saved.id, bundleId: bundle.id, bundleTitle: bundle.title)];
      final next = s.candidates.where((c) => c != phrase && !refs.any((r) => r.text == c)).firstOrNull;
      final note = 'Saved "$phrase". You will meet it in your next new-words session.${next == null ? '' : ' Want to save "$next" too? Tap it above.'}';
      _update(s.copyWith(saved: refs, log: [...s.log, ChatLine(fromUser: false, text: note)]));
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
    if (s == null || text.isEmpty || thinking) return;
    final history = [ChatLine(fromUser: true, text: s.sentence), ...s.log];
    _update(s.copyWith(log: [...s.log, ChatLine(fromUser: true, text: shown ?? text)]));
    thinking = true;
    _changed();
    String reply;
    try {
      reply = await api.translation.advise(
        phrase: current ?? s.sentence,
        context: s.sentence,
        message: text,
        history: [for (final l in history) (l.role, l.text)],
        targetLanguage: languageName,
      );
      if (reply.isEmpty) reply = "I'm not sure. Could you ask it another way?";
    } catch (e) {
      reply = e is ApiException && e.isNetwork ? "I couldn't reach the server. Please try again when you're online." : "I couldn't answer just now. Please try again.";
    }
    thinking = false;
    if (_disposed || _session?.id != s.id) return;
    _update(_session!.copyWith(log: [..._session!.log, ChatLine(fromUser: false, text: reply)]));
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

int _wordCount(String s) => s.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;

/// The [chunks] that really appear in [sentence], without repeats, in the order
/// they appear there.
@visibleForTesting
List<String> phrasesIn(String sentence, Iterable<String> chunks) {
  final lower = sentence.toLowerCase();
  final found = <(int, String)>[];
  for (final raw in chunks) {
    final c = raw.trim();
    if (c.isEmpty || found.any((f) => f.$2.toLowerCase() == c.toLowerCase())) continue;
    final at = lower.indexOf(c.toLowerCase());
    if (at >= 0) found.add((at, sentence.substring(at, at + c.length)));
  }
  found.sort((a, b) => a.$1.compareTo(b.$1));
  return [for (final f in found) f.$2];
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
