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
export 'src/core/api_exception.dart';
export 'src/core/auth.dart';
export 'src/core/providers.dart';
export 'src/core/rest_client.dart';
export 'src/models/account.dart';
export 'src/models/content.dart';
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
    board = BoardRepository(functions, data, uid);
    review = ReviewRepository(functions, data, uid);
    bundles = BundleRepository(functions, data, uid);
    translation = TranslationRepository(functions, data, uid);
    profile = ProfileRepository(functions, data, uid);
    subscription = SubscriptionRepository(functions, data, uid);
    liveSessions = LiveSessionRepository(functions, data, uid);
    textChat = TextChatRepository(functions, data, uid);
    saveAssistant = SaveAssistantRepository(functions, data, uid);
  }

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

  String get baseUrl => client.baseUrl;
}
