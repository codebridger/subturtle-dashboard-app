import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:subturtle_api/subturtle_api.dart';

import 'app/app.dart';
import 'app/config.dart';
import 'app/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final api = SubturtleApi(baseUrl: AppConfig.apiBaseUrl, tokenStore: SecureTokenStore());

  final container = ProviderContainer(
    overrides: [apiProvider.overrideWithValue(api), prefsProvider.overrideWithValue(prefs)],
    // Show errors and let people retry by hand, instead of silent automatic retries.
    retry: (_, _) => null,
  );
  // Restore the saved session before the first route is chosen.
  container.read(authProvider.notifier).restore();

  runApp(UncontrolledProviderScope(container: container, child: const SubturtleApp()));
}
