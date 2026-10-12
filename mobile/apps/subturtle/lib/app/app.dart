import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import 'providers.dart';
import 'router.dart';
import 'share_intake.dart';

class SubturtleApp extends ConsumerWidget {
  const SubturtleApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(settingsProvider.select((s) => s.themeMode));
    return MaterialApp.router(
      title: 'Subturtle',
      debugShowCheckedModeBanner: false,
      theme: StTheme.light(),
      darkTheme: StTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      // The UI is English only (Phase 1). Text size follows the phone, up to 200%.
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        return MediaQuery(
          data: mq.copyWith(textScaler: mq.textScaler.clamp(maxScaleFactor: 2)),
          child: ShareIntake(child: child ?? const SizedBox.shrink()),
        );
      },
    );
  }
}
