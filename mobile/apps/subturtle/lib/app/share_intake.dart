import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers.dart';
import 'router.dart';

/// Receives text shared to Subturtle from another app (Android share sheet)
/// and opens the save sheet with it.
///
/// Android: `MainActivity` handles `ACTION_SEND text/plain` and talks over the
/// `app.subturtle/share` channel. iOS needs a Share Extension target, which
/// needs its own signing and App Group; it is not part of this first version
/// (see README). On iOS the channel is simply never called.
class ShareIntake extends ConsumerStatefulWidget {
  const ShareIntake({super.key, required this.child});
  final Widget child;

  static const channel = MethodChannel('app.subturtle/share');

  @override
  ConsumerState<ShareIntake> createState() => _ShareIntakeState();
}

class _ShareIntakeState extends ConsumerState<ShareIntake> {
  @override
  void initState() {
    super.initState();
    ShareIntake.channel.setMethodCallHandler((call) async {
      if (call.method == 'sharedText' && call.arguments is String) _open(call.arguments as String);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        final initial = await ShareIntake.channel.invokeMethod<String>('initialSharedText');
        if (initial != null && initial.trim().isNotEmpty) _open(initial);
      } on MissingPluginException {
        // iOS or tests: no share channel.
      } on PlatformException {
        // Ignore: nothing was shared.
      }
    });
  }

  void _open(String text) {
    // Wait until signed in; the router sends signed-out users to Sign in first.
    if (ref.read(authProvider).status != AuthStatus.signedIn) return;
    ref.read(routerProvider).go(Uri(path: '/today', queryParameters: {'capture': text}).toString());
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
