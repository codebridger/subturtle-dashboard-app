/// A learner language (L1) the translation can go into.
///
/// [name] is sent to the backend as `targetLanguage` and stored as the phrase's
/// `translation_language`, like the browser extension does (it sends the English
/// name). [rtl] decides the direction of L1 text in the app.
class AppLanguage {
  const AppLanguage(this.code, this.name, this.nativeName, {this.rtl = false});

  final String code;
  final String name;
  final String nativeName;
  final bool rtl;

  /// "فارسی — Persian"
  String get label => nativeName == name ? name : '$nativeName — $name';

  static const all = [
    AppLanguage('fa', 'Persian', 'فارسی', rtl: true),
    AppLanguage('ar', 'Arabic', 'العربية', rtl: true),
    AppLanguage('tr', 'Turkish', 'Türkçe'),
    AppLanguage('es', 'Spanish', 'Español'),
    AppLanguage('pt', 'Portuguese', 'Português'),
    AppLanguage('fr', 'French', 'Français'),
    AppLanguage('de', 'German', 'Deutsch'),
    AppLanguage('it', 'Italian', 'Italiano'),
    AppLanguage('ru', 'Russian', 'Русский'),
    AppLanguage('uk', 'Ukrainian', 'Українська'),
    AppLanguage('pl', 'Polish', 'Polski'),
    AppLanguage('zh', 'Chinese', '中文'),
    AppLanguage('ja', 'Japanese', '日本語'),
    AppLanguage('ko', 'Korean', '한국어'),
    AppLanguage('hi', 'Hindi', 'हिन्दी'),
    AppLanguage('ur', 'Urdu', 'اردو', rtl: true),
    AppLanguage('he', 'Hebrew', 'עברית', rtl: true),
    AppLanguage('id', 'Indonesian', 'Bahasa Indonesia'),
    AppLanguage('vi', 'Vietnamese', 'Tiếng Việt'),
    AppLanguage('th', 'Thai', 'ไทย'),
    AppLanguage('el', 'Greek', 'Ελληνικά'),
    AppLanguage('hu', 'Hungarian', 'Magyar'),
    AppLanguage('sv', 'Swedish', 'Svenska'),
    AppLanguage('da', 'Danish', 'Dansk'),
    AppLanguage('nl', 'Dutch', 'Nederlands'),
    AppLanguage('en', 'English', 'English'),
  ];

  /// By English name ("Persian") or code ("fa"). The web's old code for Arabic is `ae`.
  static AppLanguage? byName(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    final v = value.trim().toLowerCase();
    for (final l in all) {
      if (l.name.toLowerCase() == v || l.code == v) return l;
    }
    if (v == 'ae') return all.firstWhere((l) => l.code == 'ar');
    if (v == 'farsi') return all.first;
    return null;
  }

  static AppLanguage? byCode(String? code) => byName(code);

  @override
  bool operator ==(Object other) => other is AppLanguage && other.code == code;

  @override
  int get hashCode => code.hashCode;
}

/// Whether [text] starts in a right-to-left script (Arabic, Persian, Hebrew,
/// Urdu). Only for text with no known language, such as the sign-in sample
/// cards shown before there is a profile; everywhere else the direction comes
/// from the learner's own language.
bool startsRightToLeft(String text) {
  for (final r in text.runes) {
    if ((r >= 0x0590 && r <= 0x08FF) || (r >= 0xFB1D && r <= 0xFDFF) || (r >= 0xFE70 && r <= 0xFEFF)) return true;
    if ((r >= 0x41 && r <= 0x5A) || (r >= 0x61 && r <= 0x7A) || (r >= 0xC0 && r <= 0x24F) || (r >= 0x0370 && r <= 0x04FF) || r >= 0x3040) return false;
  }
  return false;
}
