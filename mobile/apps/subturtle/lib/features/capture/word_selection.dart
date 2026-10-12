/// The tap-the-words logic of the save sheet, kept pure so it can be tested.
///
/// - First tap selects one word.
/// - A second tap selects the range between the two words.
/// - A third tap starts again from the word tapped.
/// - Tapping an end of a range of 2+ words shrinks the range by that word.
class WordSelection {
  WordSelection(this.words, {this.start, this.end, this.taps = 0});

  /// Splits [sentence] into words (punctuation stays on the word, as shown).
  /// Short shares (4 words or fewer) start fully selected: the user probably
  /// shared just the phrase.
  factory WordSelection.fromSentence(String sentence) {
    final words = tokenize(sentence);
    if (words.isNotEmpty && words.length <= 4) return WordSelection(words, start: 0, end: words.length - 1, taps: 2);
    return WordSelection(words);
  }

  static List<String> tokenize(String s) => s.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();

  final List<String> words;
  final int? start;
  final int? end;
  final int taps;

  bool get isEmpty => start == null;
  int get lo => start == null ? -1 : (start! < end! ? start! : end!);
  int get hi => start == null ? -1 : (start! > end! ? start! : end!);
  bool isSelected(int i) => !isEmpty && i >= lo && i <= hi;

  WordSelection tap(int i) {
    if (isEmpty || taps >= 2) {
      // Shrink: tapping an end of a multi-word range drops that word.
      if (!isEmpty && hi > lo && (i == lo || i == hi)) {
        return i == lo ? WordSelection(words, start: lo + 1, end: hi, taps: 2) : WordSelection(words, start: lo, end: hi - 1, taps: 2);
      }
      return WordSelection(words, start: i, end: i, taps: 1);
    }
    return WordSelection(words, start: start, end: i, taps: 2);
  }

  WordSelection clear() => WordSelection(words);

  /// The selected words, with punctuation trimmed from both ends ("worse." → "worse").
  String get phrase {
    if (isEmpty) return '';
    final raw = words.sublist(lo, hi + 1).join(' ');
    return raw.replaceAll(RegExp(r'''^[\s"“”'‘’(\[«¿¡.,!?;:…-]+|[\s"“”'‘’)\]».,!?;:…-]+$'''), '');
  }
}
