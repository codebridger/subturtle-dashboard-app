import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../features/auth/sign_in_screen.dart';
import '../features/bundles/bundle_detail_screen.dart';
import '../features/bundles/bundles_screen.dart';
import '../features/capture/capture_sheet.dart';
import '../features/coach/coach_home_screen.dart';
import '../features/coach/transcript_screen.dart';
import '../features/live_session/session_launch.dart';
import '../features/live_session/text_chat_screen.dart';
import '../features/live_session/voice_screen.dart';
import '../features/me/me_screen.dart';
import '../features/plans/plans_screen.dart';
import '../features/pool/pool_screen.dart';
import '../features/review/review_screen.dart';
import '../features/today/today_screen.dart';
import 'providers.dart';

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Routes. The four tabs live in a [StatefulShellRoute] (each keeps its own
/// stack). Full-screen tasks (review, pool, live session) sit on the root
/// navigator, so the tab bar is hidden there.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.listen(authProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/today',
    refreshListenable: refresh,
    // Unknown links (or a custom-scheme link like subturtle://board, which
    // arrives with an empty path) land on Today instead of an error page.
    onException: (_, _, router) => router.go('/today'),
    redirect: (context, state) {
      if (state.uri.path.isEmpty || state.uri.path == '/') return '/today';
      final status = ref.read(authProvider).status;
      final atSignIn = state.matchedLocation == '/signin';
      final atSplash = state.matchedLocation == '/splash';
      if (status == AuthStatus.unknown) return atSplash ? null : '/splash';
      if (status == AuthStatus.signedOut) return atSignIn ? null : '/signin';
      if (atSignIn || atSplash) return '/today';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const _Splash()),
      GoRoute(path: '/signin', builder: (_, _) => const SignInScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/today', builder: (_, _) => const TodayScreen())]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/bundles',
              builder: (_, _) => const BundlesScreen(),
              routes: [GoRoute(path: ':id', builder: (_, s) => BundleDetailScreen(bundleId: s.pathParameters['id']!))],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/coach',
              builder: (_, _) => const CoachHomeScreen(),
              routes: [GoRoute(path: 'sessions/:id', builder: (_, s) => TranscriptScreen(sessionId: s.pathParameters['id']!))],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/me',
              builder: (_, _) => const MeScreen(),
              routes: [GoRoute(path: 'plan', builder: (_, _) => const PlansScreen())],
            ),
          ]),
        ],
      ),
      GoRoute(
        path: '/review',
        parentNavigatorKey: _rootKey,
        pageBuilder: (_, s) => MaterialPage(fullscreenDialog: true, child: ReviewScreen(bundleId: s.uri.queryParameters['bundle'])),
      ),
      GoRoute(path: '/pool', parentNavigatorKey: _rootKey, pageBuilder: (_, _) => const MaterialPage(fullscreenDialog: true, child: PoolScreen())),
      GoRoute(
        path: '/coach/voice',
        parentNavigatorKey: _rootKey,
        pageBuilder: (_, s) => MaterialPage(fullscreenDialog: true, child: VoiceScreen(launch: s.extra as SessionLaunch)),
      ),
      GoRoute(
        path: '/coach/text',
        parentNavigatorKey: _rootKey,
        pageBuilder: (_, s) => MaterialPage(fullscreenDialog: true, child: TextChatScreen(launch: s.extra as SessionLaunch)),
      ),
      // Deep link target: subturtle://capture?text=… opens Today with the save sheet.
      GoRoute(path: '/capture', redirect: (_, s) => Uri(path: '/today', queryParameters: {'capture': s.uri.queryParameters['text'] ?? ''}).toString()),
      GoRoute(path: '/board', redirect: (_, _) => '/today'),
    ],
  );
});

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(child: Image.asset('assets/images/logo.png', width: 72, height: 72, semanticLabel: 'Subturtle')),
      );
}

/// Tab bar + the "Save a phrase" FAB (only on Today and Bundles).
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  bool _fabExtended = true;

  bool _onScroll(ScrollNotification n) {
    if (n.depth != 0 || n.metrics.axis != Axis.vertical) return false;
    final extended = n.metrics.pixels < 24;
    if (extended != _fabExtended) setState(() => _fabExtended = extended);
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final index = widget.shell.currentIndex;
    final location = GoRouterState.of(context).uri.path;
    // The FAB shows on the Today and Bundles list screens only (not on a bundle's own page).
    final showFab = location == '/today' || location == '/bundles';
    final todayHasNew = ref.watch(todayHasNewProvider);
    return Scaffold(
      body: NotificationListener<ScrollNotification>(onNotification: _onScroll, child: widget.shell),
      floatingActionButton: showFab
          ? StFab(
              label: 'Save a phrase',
              extended: _fabExtended,
              onPressed: () => openCapture(context, ref),
            )
          : null,
      bottomNavigationBar: StTabBar(
        currentIndex: index,
        onTap: (i) {
          ref.read(hapticsProvider).selection();
          widget.shell.goBranch(i, initialLocation: i == index);
        },
        items: [
          StTabItem(label: 'Today', icon: StIcons.today, showDot: todayHasNew && index != 0),
          const StTabItem(label: 'Bundles', icon: StIcons.bundles),
          const StTabItem(label: 'Coach', icon: StIcons.coach),
          const StTabItem(label: 'Me', icon: StIcons.me),
        ],
      ),
    );
  }
}
