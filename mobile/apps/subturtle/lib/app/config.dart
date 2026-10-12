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
  /// The backend only accepts Google tokens issued to a client id it lists, so the
  /// iOS / Android client ids must be added on the server side too (see README).
  static const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

  /// iOS OAuth client id (needed by google_sign_in on iOS).
  static const googleIosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');

  /// Shows "Create an account with a code". The backend's sign-up code is only
  /// known outside production (`123456`); in production it is random and never sent.
  static const enableCodeSignUp = bool.fromEnvironment('ENABLE_CODE_SIGNUP', defaultValue: false);

  static const termsUrl = 'https://subturtle.app/terms';
  static const privacyUrl = 'https://subturtle.app/privacy';
  static const contactEmail = 'mailto:info@codebridger.co.uk';
  static const chromeExtensionUrl = 'https://chromewebstore.google.com/detail/subturtle-learn-english-w/gaplicnpaiidofkoeonioomcnadoofkf';

  static bool get googleConfigured => googleServerClientId.isNotEmpty;
}
