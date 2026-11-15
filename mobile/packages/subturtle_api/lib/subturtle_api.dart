/// Dart client for the Subturtle backend.
///
/// [SubturtleApi] wires the pieces together: a [RestClient] (the HTTP protocol
/// of `@modular-rest/client`), [AuthService], the function and data providers,
/// and one repository per backend module.
library;

import 'package:http/http.dart' as http;

import 'src/core/auth.dart';
import 'src/core/providers.dart';
import 'src/core/rest_client.dart';
import 'src/repositories/repositories.dart';

export 'src/coach/coach_practice.dart';
export 'src/coach/live_practice_spec.dart';
export 'src/core/api_exception.dart';
export 'src/core/auth.dart';
export 'src/core/providers.dart';
export 'src/core/rest_client.dart';
export 'src/models/account.dart';
export 'src/models/content.dart';
export 'src/models/language.dart';
export 'src/models/save_assistant.dart';
export 'src/repositories/repositories.dart';

/// Everything the app needs to talk to the backend, built once at start.
class SubturtleApi {
  SubturtleApi({required String baseUrl, TokenStore? tokenStore, http.Client? httpClient})
      : client = RestClient(baseUrl: baseUrl, httpClient: httpClient) {
    auth = AuthService(client, tokenStore ?? MemoryTokenStore());
    functions = FunctionProvider(client);
    data = DataProvider(client);
    String uid() => auth.user?.id ?? '';
    String? lang() => activeLanguage;
    board = BoardRepository(functions, data, uid, lang);
    review = ReviewRepository(functions, data, uid, lang);
    bundles = BundleRepository(functions, data, uid, lang);
    translation = TranslationRepository(functions, data, uid, lang);
    profile = ProfileRepository(functions, data, uid, lang);
    subscription = SubscriptionRepository(functions, data, uid, lang);
    liveSessions = LiveSessionRepository(functions, data, uid, lang);
    textChat = TextChatRepository(functions, data, uid, lang);
    saveAssistant = SaveAssistantRepository(functions, data, uid, lang);
    languages = LanguageRepository(functions, data, uid, lang, auth.anonymousToken);
    starterPacks = StarterPackRepository(functions, data, uid, lang);
  }

  /// The active learning language (`de`). Every language-scoped call sends it
  /// as `language` unless the call names another one. The app sets it from
  /// `get-language-state`; null sends nothing (the server uses its own active
  /// language, and a 1.x server has none).
  String? activeLanguage;

  final RestClient client;
  late final AuthService auth;
  late final FunctionProvider functions;
  late final DataProvider data;
  late final BoardRepository board;
  late final ReviewRepository review;
  late final BundleRepository bundles;
  late final TranslationRepository translation;
  late final ProfileRepository profile;
  late final SubscriptionRepository subscription;
  late final LiveSessionRepository liveSessions;
  late final TextChatRepository textChat;
  late final SaveAssistantRepository saveAssistant;
  late final LanguageRepository languages;
  late final StarterPackRepository starterPacks;

  String get baseUrl => client.baseUrl;
}
