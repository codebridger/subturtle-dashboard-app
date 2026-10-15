import 'package:subturtle_api/subturtle_api.dart';

/// A fill-the-gap card: the sentence split around one blank.
class Cloze {
  const Cloze({required this.before, required this.answer, required this.after, this.hint});

  final String before;

  /// The words that go in the blank, as they appear in the sentence.
  final String answer;
  final String after;

  /// L1 help for the blank (the chunk's note, else the phrase translation).
  final String? hint;

  /// Level 3 and up, with a chunk that appears in the source sentence.
  /// Returns null when the card should be a recognition card instead.
  static Cloze? fromItem(ReviewItem item) {
    if (item.boxLevel < 3) return null;
    final sentence = item.sourceSentence ?? item.phrase.context;
    final chunkText = item.confirmedChunk ?? (item.phrase.chunks.isNotEmpty ? item.phrase.chunks.first.text : null);
    return build(sentence, chunkText, hint: _hintFor(item, chunkText));
  }

  static String? _hintFor(ReviewItem item, String? chunkText) {
    for (final c in item.phrase.chunks) {
      if (c.text.trim().toLowerCase() == chunkText?.trim().toLowerCase() && (c.definition ?? '').isNotEmpty) return c.definition;
    }
    return item.phrase.translation.isEmpty ? null : item.phrase.translation;
  }

  /// Blanks the first match of [chunk] in [sentence] (case-insensitive).
  static Cloze? build(String? sentence, String? chunk, {String? hint}) {
    if (sentence == null || chunk == null) return null;
    final s = sentence.trim();
    final c = chunk.trim();
    if (s.isEmpty || c.isEmpty) return null;
    final i = s.toLowerCase().indexOf(c.toLowerCase());
    if (i < 0) return null;
    return Cloze(before: s.substring(0, i), answer: s.substring(i, i + c.length), after: s.substring(i + c.length), hint: hint);
  }
}

enum ClozeResult { correct, close, wrong }

/// Forgiving check: ignores case, extra spaces, quotes and end punctuation, and
/// treats common contractions as their long form. A small typo or a different
/// tense of one word ("have to" for "had to") is [ClozeResult.close].
ClozeResult checkAnswer(String typed, String answer) {
  final a = _normalise(typed);
  final b = _normalise(answer);
  if (a.isEmpty) return ClozeResult.wrong;
  if (a == b) return ClozeResult.correct;
  final dist = _levenshtein(a, b);
  if (dist <= (b.length <= 6 ? 1 : 2)) return ClozeResult.close;
  // Same number of words and only one word differs → close.
  final aw = a.split(' ');
  final bw = b.split(' ');
  if (aw.length == bw.length && aw.length > 1) {
    var diff = 0;
    for (var i = 0; i < aw.length; i++) {
      if (aw[i] != bw[i]) diff++;
    }
    if (diff == 1) return ClozeResult.close;
  }
  return ClozeResult.wrong;
}

const _contractions = {
  "n't": ' not',
  "'re": ' are',
  "'ve": ' have',
  "'ll": ' will',
  "'m": ' am',
  "'d": ' would',
};

String _normalise(String s) {
  var t = s.toLowerCase().replaceAll(RegExp('[‘’`´]'), "'").trim();
  t = t.replaceAll("can't", 'cannot').replaceAll("won't", 'will not');
  _contractions.forEach((k, v) => t = t.replaceAll(k, v));
  t = t.replaceAll(RegExp(r'''["“”«»]'''), '');
  t = t.replaceAll(RegExp(r'''^[\s.,!?;:'-]+|[\s.,!?;:'-]+$'''), '');
  return t.replaceAll(RegExp(r'\s+'), ' ');
}

int _levenshtein(String a, String b) {
  if (a == b) return 0;
  if (a.isEmpty) return b.length;
  if (b.isEmpty) return a.length;
  var prev = List<int>.generate(b.length + 1, (i) => i);
  for (var i = 1; i <= a.length; i++) {
    final cur = List<int>.filled(b.length + 1, 0)..[0] = i;
    for (var j = 1; j <= b.length; j++) {
      final cost = a[i - 1] == b[j - 1] ? 0 : 1;
      cur[j] = [prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost].reduce((x, y) => x < y ? x : y);
    }
    prev = cur;
  }
  return prev[b.length];
}

/// One grade the learner gave.
class Grade {
  const Grade(this.index, this.phraseId, this.learned);
  final int index;
  final String phraseId;
  final bool learned;
}

/// Holds the learner's grades and sends them to the server one step late.
///
/// The backend cannot undo a grade (`submit-review` moves the card between
/// boxes at once). So the newest grade waits here as [pending] until the next
/// grade, the end of the session, or the app going to the background. Until
/// then, [undo] simply drops it: nothing reached the server.
class GradeQueue {
  GradeQueue(this._send);

  final Future<void> Function(Grade grade) _send;
  final List<Grade> _sent = [];
  Grade? _pending;
  final List<Grade> _failed = [];

  Grade? get pending => _pending;
  bool get canUndo => _pending != null;

  /// All grades, sent or not, in order.
  List<Grade> get all => [..._sent, ..._failed, ?_pending];
  int get learned => all.where((g) => g.learned).length;
  int get forgot => all.where((g) => !g.learned).length;

  /// Grades that could not be sent (offline). [flush] tries them again.
  List<Grade> get failed => List.unmodifiable(_failed);

  /// Records [grade]; the previous pending grade is sent now.
  Future<void> add(Grade grade) async {
    final previous = _pending;
    _pending = grade;
    if (previous != null) await _trySend(previous);
  }

  /// Drops the pending grade and returns it, or null when there is none.
  Grade? undo() {
    final g = _pending;
    _pending = null;
    return g;
  }

  /// Sends the pending grade and retries failed ones. Call at the end of a
  /// session and when the app goes to the background.
  Future<void> flush() async {
    final retry = List.of(_failed);
    _failed.clear();
    for (final g in retry) {
      await _trySend(g);
    }
    final p = _pending;
    _pending = null;
    if (p != null) await _trySend(p);
  }

  Future<void> _trySend(Grade g) async {
    try {
      await _send(g);
      _sent.add(g);
    } catch (_) {
      _failed.add(g);
    }
  }
}
