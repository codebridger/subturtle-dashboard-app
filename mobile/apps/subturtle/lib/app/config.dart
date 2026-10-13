import 'package:subturtle_api/subturtle_api.dart';

/// Build-time settings, passed with `--dart-define`.
///
/// ```
/// flutter run --dart-define=API_BASE_URL=https://… --dart-define=GOOGLE_SERVER_CLIENT_ID=….apps.googleusercontent.com
/// ```
abstract final class AppConfig {
  /// The backend. Defaults to the DEV API.
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: ApiEnvironment.dev);

  /// The web dashboard for "Manage" and "More on the web" links. Follows the API by default.
  static const dashboardUrl = String.fromEnvironment(
    'DASHBOARD_URL',
    defaultValue: apiBaseUrl == ApiEnvironment.prod ? ApiEnvironment.prodDashboard : ApiEnvironment.devDashboard,
  );

  /// Google sign-in. The web OAuth client id (also called the "server client id").
  /// The backend only accepts Google tokens issued to a client id it lists; the
  /// iOS ids below are listed on the dev and prod servers (see README).
  /// Defaults to the dev or prod client, following the API.
  static const googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
    defaultValue: _prod ? '245138511605-ssnsukvird7dt9p102p6s9s8038di8ko.apps.googleusercontent.com' : '466506592387-pnshik2s2k3amvfj7rqup0de9kvvpqj1.apps.googleusercontent.com',
  );

  /// iOS OAuth client id (needed by google_sign_in on iOS). Its reversed form is
  /// the URL scheme in Info.plist, set per build by ios/scripts/google_url_scheme.sh.
  static const googleIosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
    defaultValue: _prod ? '245138511605-5vr7dnonm8rgg56du01v8i430ia7t0g1.apps.googleusercontent.com' : '466506592387-14p1j715ifm1ag1qva3k1dh3ro4c88ci.apps.googleusercontent.com',
  );

  /// Stripe publishable key (public), for the local-price probe on Plans. The
  /// same keys as the dashboard (`infra/public/<env>.env`), following the API.
  static const stripePublishableKey = String.fromEnvironment(
    'STRIPE_PUBLISHABLE_KEY',
    defaultValue: _prod
        ? 'pk_live_51QFZu6JzqwOMGRBggVK7qChV7WJ3EWk8ptlqfMxzjVs9j8oVwKrpVcXjptIKAfE0w4tf2JTBnTQuKHWsRdzUMPYD00SQ2kV7V8'
        : 'pk_test_51QFZu6JzqwOMGRBgHCKPt0QEnHGzURefEc4yZiYVJ9dWrTuElQ0B2V6hPhIEhU8bzrii946JHurHLvrnyn2lbv8F00cfcuTYB3',
  );

  static const _prod = apiBaseUrl == ApiEnvironment.prod;

  /// Shows "Create an account with a code". The backend's sign-up code is only
  /// known outside production (`123456`); in production it is random and never sent.
  static const enableCodeSignUp = bool.fromEnvironment('ENABLE_CODE_SIGNUP', defaultValue: false);

  /// Save a phrase talks to the `save_assistant` backend, which translates,
  /// answers and keeps the chat history. Off by default: the functions are not
  /// on the dev server yet, so the app translates itself and keeps chats on the phone.
  static const saveAssistantBackend = bool.fromEnvironment('SAVE_ASSISTANT_BACKEND', defaultValue: false);

  static const termsUrl = 'https://subturtle.app/terms';
  static const privacyUrl = 'https://subturtle.app/privacy';
  static const contactEmail = 'mailto:info@codebridger.co.uk';
  static const chromeExtensionUrl = 'https://chromewebstore.google.com/detail/subturtle-learn-english-w/gaplicnpaiidofkoeonioomcnadoofkf';

  static bool get googleConfigured => googleServerClientId.isNotEmpty;
}
