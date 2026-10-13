import 'dart:io' show Platform;
import 'dart:math';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/config.dart';
import '../../app/providers.dart';
import '../../shared/widgets.dart';

enum _Step { start, email, signUpEmail, signUpCode, signUpPassword }

/// S1 · Sign in, on the web dashboard login's pattern: a blurred, tilted
/// preview of Today behind, and a bottom panel with the sign-in buttons.
///
/// Sign in with Apple is shown, but the backend has no Apple route yet
/// (README, "Needs backend work"), so the button says it is coming soon.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  _Step _step = _Step.start;
  String? _busy; // which button shows a spinner
  String? _error;

  /// Google's window is open.
  bool _waitingForGoogle = false;

  /// Google said yes; we are exchanging its token for ours.
  bool _returning = false;

  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  SubturtleApi get _api => ref.read(apiProvider);

  Future<void> _run(String key, Future<AuthUser?> Function() action) async {
    setState(() {
      _busy = key;
      _error = null;
    });
    try {
      final user = await action();
      if (user != null) {
        TextInput.finishAutofillContext();
        await ref.read(authProvider.notifier).signedIn(user);
      }
    } on GoogleSignInException catch (e) {
      // The screen stays kind; the log says what really failed.
      debugPrint('Google sign-in failed: ${e.code.name}: ${e.description} ${e.details ?? ''}');
      setState(() => _error = e.code == GoogleSignInExceptionCode.canceled
          ? 'The sign-in window closed before you finished. Try once more.'
          : "We couldn't sign you in with Google. Please try again.");
    } on ApiException catch (e) {
      setState(() => _error = e.isNetwork ? "You're offline. Connect to sign in." : _messageFor(key, e));
    } catch (e) {
      debugPrint('Sign-in failed: $e');
      setState(() => _error = "We couldn't sign you in. Please try again.");
    } finally {
      if (mounted) {
        setState(() {
          _busy = null;
          _waitingForGoogle = false;
          _returning = false;
        });
      }
    }
  }

  String _messageFor(String key, ApiException e) {
    if (key == 'email') return 'That email and password do not match. Please try again.';
    if (key == 'code') return 'That code is not right. Please check it and try again.';
    if (key == 'google' && e.statusCode == 401) return 'Google sign-in is not set up for this app yet.';
    return "We couldn't sign you in. Please try again.";
  }

  Future<AuthUser?> _google() async {
    if (!AppConfig.googleConfigured) {
      throw ApiException('Google sign-in is not set up for this app yet.', statusCode: 401);
    }
    setState(() => _waitingForGoogle = true);
    final g = GoogleSignIn.instance;
    // The iOS client id is for iOS only; Android finds its client by package name and SHA-1.
    final iosClient = Platform.isIOS && AppConfig.googleIosClientId.isNotEmpty ? AppConfig.googleIosClientId : null;
    await g.initialize(clientId: iosClient, serverClientId: AppConfig.googleServerClientId);
    const scopes = ['email', 'profile'];
    final account = await g.authenticate(scopeHint: scopes);
    final auth = await account.authorizationClient.authorizationForScopes(scopes) ?? await account.authorizationClient.authorizeScopes(scopes);
    if (mounted) {
      setState(() {
        _waitingForGoogle = false;
        _returning = true;
      });
    }
    return _api.auth.signInWithGoogleAccessToken(auth.accessToken);
  }

  void _apple() {
    ref.read(hapticsProvider).light();
    showStToast(
      context,
      title: 'Sign in with Apple is coming soon',
      description: 'For now, continue with Google or email.',
      color: StToastColor.info,
    );
  }

  bool _validEmail(String s) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s.trim());

  void _go(_Step step) => setState(() {
        _step = step;
        _error = null;
      });

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final still = MediaQuery.disableAnimationsOf(context);
    final expired = ref.watch(authProvider.select((a) => a.expired));
    final top = MediaQuery.paddingOf(context).top;
    final (title, subtitle) = switch (_step) {
      _Step.start => ('Sign in', 'Pick a way to continue.'),
      _Step.email => ('Sign in with email', 'Use the email and password of your account.'),
      _ => ('Create an account', 'We will send a 6-digit code to your email.'),
    };
    return Scaffold(
      backgroundColor: c.surfacePage,
      body: Stack(
        children: [
          // Soft rose and jade glows, purely decorative.
          Positioned(top: -230, right: -200, child: _Glow(color: c.rose500.withValues(alpha: 0.10), size: 520)),
          Positioned(top: 180, left: -220, child: _Glow(color: c.jade500.withValues(alpha: 0.09), size: 420)),
          if (_step == _Step.start) Positioned(top: top + 52, left: 70, child: _BoardPreview(still: still)),
          Positioned(
            top: top + 12,
            left: 20,
            child: Image.asset('assets/images/logo.png', width: 40, height: 40, semanticLabel: 'Subturtle'),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: _RiseIn(
              still: still,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [c.surfacePage.withValues(alpha: 0), c.surfacePage],
                    stops: const [0, 0.05],
                  ),
                ),
                child: SafeArea(
                  top: false,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                    child: AutofillGroup(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_step == _Step.start) const Align(alignment: Alignment.centerLeft, child: _HeadingPill()),
                          const SizedBox(height: 14),
                          Semantics(
                            header: true,
                            child: Text(title, style: StType.display.copyWith(color: c.textStrong, height: 1.06)),
                          ),
                          const SizedBox(height: 8),
                          Text(subtitle, style: StType.base(size: 18, weight: FontWeight.w600, height: 1.4).copyWith(color: c.textMuted)),
                          if (_error != null) ...[
                            const SizedBox(height: 18),
                            _Banner.error(_error!),
                          ] else if (expired && _step == _Step.start) ...[
                            const SizedBox(height: 18),
                            const _Banner.expired(),
                          ],
                          const SizedBox(height: 22),
                          _body(context),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (_returning) Positioned.fill(child: _SigningInOverlay(still: still)),
        ],
      ),
    );
  }

  Widget _body(BuildContext context) {
    final c = context.st;
    final disabled = _busy != null;
    switch (_step) {
      case _Step.start:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_waitingForGoogle)
              const _WaitingForGoogle()
            else
              _BigButton(
                label: 'Continue with Google',
                background: c.primary,
                foreground: c.onPrimary,
                leading: Container(
                  width: 24,
                  height: 24,
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                  alignment: Alignment.center,
                  child: const StIcon(StIcons.google, size: 14),
                ),
                loading: _busy == 'google',
                onPressed: disabled ? null : () => _run('google', _google),
              ),
            const SizedBox(height: 10),
            _BigButton(
              label: 'Continue with Apple',
              background: c.surfaceInverse,
              foreground: c.paper,
              leading: StIcon(StIcons.apple, size: 20, color: c.paper),
              onPressed: disabled ? null : _apple,
            ),
            const SizedBox(height: 10),
            _BigButton(
              label: 'Continue with email',
              background: Colors.transparent,
              foreground: c.textStrong,
              border: c.borderDefault,
              onPressed: disabled ? null : () => _go(_Step.email),
            ),
            Padding(padding: const EdgeInsets.only(top: 20, bottom: 16), child: Divider(height: 1, thickness: 1, color: c.borderSubtle)),
            Text("New to Subturtle? Just sign in and we'll make your account.", style: StType.bodyMedium.copyWith(color: c.textBody)),
            const SizedBox(height: 2),
            _LegalLinks(onOpen: (url) => openExternal(context, url)),
          ],
        );
      case _Step.email:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StInput(
              controller: _email,
              label: 'Email',
              placeholder: 'you@example.com',
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),
            StInput(
              controller: _password,
              label: 'Password',
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _signInEmail(),
            ),
            const SizedBox(height: 16),
            StButton(label: 'Sign in', size: StSize.lg, block: true, loading: _busy == 'email', onPressed: disabled ? null : _signInEmail),
            const SizedBox(height: 8),
            Text(
              'Email sign-in works for accounts that have a password. Most people sign in with Google.',
              textAlign: TextAlign.center,
              style: StType.bodySmall.copyWith(color: c.textMuted),
            ),
            if (AppConfig.enableCodeSignUp) ...[
              const SizedBox(height: 4),
              StButton(
                label: 'Create an account with a code',
                variant: StButtonVariant.ghost,
                onPressed: disabled ? null : () => _go(_Step.signUpEmail),
              ),
            ],
            StButton(
              label: 'Back',
              variant: StButtonVariant.ghost,
              tone: StTone.neutral,
              onPressed: disabled ? null : () => _go(_Step.start),
            ),
          ],
        );
      case _Step.signUpEmail:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StInput(controller: _email, label: 'Email', keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email]),
            const SizedBox(height: 16),
            StButton(
              label: 'Send code',
              size: StSize.lg,
              block: true,
              loading: _busy == 'send',
              onPressed: disabled
                  ? null
                  : () {
                      if (!_validEmail(_email.text)) return setState(() => _error = 'Please enter a valid email.');
                      _run('send', () async {
                        await _api.auth.registerEmail(_email.text);
                        setState(() => _step = _Step.signUpCode);
                        return null;
                      });
                    },
            ),
            StButton(label: 'Back', variant: StButtonVariant.ghost, tone: StTone.neutral, onPressed: () => _go(_Step.email)),
          ],
        );
      case _Step.signUpCode:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Enter the 6-digit code for ${_email.text.trim()}.', style: StType.bodyMedium.copyWith(color: c.textBody)),
            const SizedBox(height: 12),
            StInput(
              controller: _code,
              label: 'Code',
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              onChanged: (v) {
                if (v.length == 6) _checkCode();
              },
            ),
            const SizedBox(height: 16),
            StButton(label: 'Next', size: StSize.lg, block: true, loading: _busy == 'code', onPressed: disabled ? null : _checkCode),
          ],
        );
      case _Step.signUpPassword:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StInput(
              controller: _password,
              label: 'Choose a password',
              obscureText: true,
              autofillHints: const [AutofillHints.newPassword],
              hint: 'At least 8 characters.',
            ),
            const SizedBox(height: 16),
            StButton(
              label: 'Create account',
              size: StSize.lg,
              block: true,
              loading: _busy == 'create',
              onPressed: disabled
                  ? null
                  : () {
                      if (_password.text.length < 8) return setState(() => _error = 'Please use at least 8 characters.');
                      _run('create', () => _api.auth.submitPassword(email: _email.text, code: _code.text, password: _password.text));
                    },
            ),
          ],
        );
    }
  }

  void _signInEmail() {
    if (!_validEmail(_email.text)) return setState(() => _error = 'Please enter a valid email.');
    if (_password.text.isEmpty) return setState(() => _error = 'Please enter your password.');
    _run('email', () => _api.auth.signInWithPassword(email: _email.text, password: _password.text));
  }

  void _checkCode() {
    if (_busy != null) return;
    _run('code', () async {
      final ok = await _api.auth.validateCode(email: _email.text, code: _code.text);
      if (!ok) throw ApiException('Verification code is wrong', statusCode: 412);
      setState(() => _step = _Step.signUpPassword);
      return null;
    });
  }
}

/// "→ Heading to Today": where the learner lands after signing in.
class _HeadingPill extends StatelessWidget {
  const _HeadingPill();

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(color: c.primarySoft, borderRadius: StRadius.brPill),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          StIcon(StIcons.next, size: 14, color: c.rose700),
          const SizedBox(width: 8),
          Text('Heading to Today', style: StType.base(size: 12, weight: FontWeight.w800, height: 1).copyWith(color: c.rose700)),
        ],
      ),
    );
  }
}

/// A 52 dp sign-in button: solid (Google, Apple) or outlined (email).
class _BigButton extends StatelessWidget {
  const _BigButton({required this.label, required this.background, required this.foreground, this.border, this.leading, this.loading = false, required this.onPressed});

  final String label;
  final Color background;
  final Color foreground;
  final Color? border;
  final Widget? leading;
  final bool loading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: onPressed != null,
      label: label,
      excludeSemantics: true,
      child: Opacity(
        opacity: onPressed == null && !loading ? 0.5 : 1,
        child: StPressable(
          onTap: loading ? null : onPressed,
          child: Container(
            height: 52,
            decoration: BoxDecoration(
              color: background,
              borderRadius: StRadius.brMd,
              border: border == null ? null : Border.all(color: border!, width: 1.5),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (loading)
                  SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: foreground))
                else
                  ?leading,
                if (loading || leading != null) const SizedBox(width: 11),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: StType.base(size: 16, weight: FontWeight.w800, height: 1).copyWith(color: foreground),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Takes the Google button's place while Google's window is open.
class _WaitingForGoogle extends StatelessWidget {
  const _WaitingForGoogle();

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      liveRegion: true,
      label: 'Waiting for Google',
      excludeSemantics: true,
      child: Container(
        height: 52,
        decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brMd, border: Border.all(color: c.borderSubtle, width: 1.5)),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2.5, color: c.primary, backgroundColor: c.ink200)),
            const SizedBox(width: 12),
            Text('Waiting for Google…', style: StType.base(size: 16, weight: FontWeight.w800, height: 1).copyWith(color: c.textMuted)),
          ],
        ),
      ),
    );
  }
}

/// Error ("That didn't go through") or session-ended note.
class _Banner extends StatelessWidget {
  const _Banner.error(String this.message) : expired = false;
  const _Banner.expired()
      : message = null,
        expired = true;

  final String? message;
  final bool expired;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final body = StType.bodyMedium.copyWith(color: c.ink700);
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: expired ? c.warningSoft : c.dangerSoft, borderRadius: StRadius.brMd),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: StIcon(expired ? StIcons.clockBold : StIcons.danger, size: 20, color: expired ? c.amber600 : c.red600),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: expired
                  ? Text('Your session ended, so we brought you here. Nothing you saved was lost.', style: body)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text("That didn't go through", style: StType.base(size: 14, weight: FontWeight.w800, height: 1.45).copyWith(color: c.red600)),
                        const SizedBox(height: 2),
                        Text(message!, style: body),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Full-screen "Signing you in…" with a pulsing logo, while Google's token is
/// exchanged for ours. The router leaves Sign in as soon as that succeeds.
class _SigningInOverlay extends StatelessWidget {
  const _SigningInOverlay({required this.still});
  final bool still;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      liveRegion: true,
      label: 'Signing you in. Taking you to Today.',
      excludeSemantics: true,
      child: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: ColoredBox(
            color: c.surfaceTopbar,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _Pulse(still: still, child: Image.asset('assets/images/logo.png', width: 56, height: 56)),
                  const SizedBox(height: 20),
                  Text('Signing you in…', style: StType.base(size: 22, weight: FontWeight.w900, height: 1.25).copyWith(color: c.textStrong)),
                  const SizedBox(height: 6),
                  Text('Taking you to Today.', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The blurred, tilted Today board with two drifting phrase cards. Decorative.
class _BoardPreview extends StatelessWidget {
  const _BoardPreview({required this.still});
  final bool still;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final tilt = Matrix4.identity()
      ..setEntry(3, 2, 1 / 1100)
      ..rotateY(-18 * pi / 180)
      ..rotateX(6 * pi / 180)
      ..rotateZ(-3 * pi / 180);
    return ExcludeSemantics(
      child: IgnorePointer(
        child: SizedBox(
          width: 340,
          height: 300,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: Transform(
                  transform: tilt,
                  alignment: Alignment.centerLeft,
                  child: Opacity(
                    opacity: 0.9,
                    child: ImageFiltered(
                      imageFilter: ImageFilter.blur(sigmaX: 3, sigmaY: 3),
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: c.surfacePage,
                          border: Border.all(color: c.borderSubtle),
                          borderRadius: StRadius.brXl,
                          boxShadow: context.stShadows.xl,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(width: 6, height: 6, decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle)),
                                const SizedBox(width: 6),
                                Text('TODAY', style: StType.overline.copyWith(color: c.primary)),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text('Good evening', style: StType.titleMedium.copyWith(color: c.textStrong, fontWeight: FontWeight.w900)),
                            const SizedBox(height: 12),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: c.surfaceCard,
                                  border: Border.all(color: c.borderSubtle),
                                  borderRadius: StRadius.brLg,
                                  boxShadow: context.stShadows.sm,
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Container(
                                          width: 40,
                                          height: 40,
                                          decoration: BoxDecoration(color: c.warningSoft, borderRadius: StRadius.brMd),
                                          alignment: Alignment.center,
                                          child: StIcon(StIcons.layers, size: 22, color: c.amber600),
                                        ),
                                        StBadge('Due', color: StBadgeColor.warning),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    Text('Smart Review', style: StType.titleSmall.copyWith(color: c.textStrong)),
                                    Text('12 phrases are due.', style: StType.bodySmall.copyWith(color: c.textMuted)),
                                    const Spacer(),
                                    Container(
                                      height: 34,
                                      decoration: BoxDecoration(color: c.primary, borderRadius: StRadius.brMd),
                                      alignment: Alignment.center,
                                      child: Text('Start review', style: StType.labelMedium.copyWith(color: c.onPrimary, fontWeight: FontWeight.w800)),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: -46,
                top: 30,
                child: _Drift(still: still, angle: -5, phase: 0, child: const _PhraseCard(phrase: 'get out of', l1: 'بیرون رفتن', width: 176)),
              ),
              Positioned(
                left: -20,
                bottom: 26,
                child: _Drift(still: still, angle: 4, phase: 0.5, child: const _PhraseCard(phrase: 'figure out', l1: 'سر درآوردن', width: 160)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PhraseCard extends StatelessWidget {
  const _PhraseCard({required this.phrase, required this.l1, required this.width});
  final String phrase;
  final String l1;
  final double width;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Container(
      width: width,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        border: Border.all(color: c.borderSubtle),
        borderRadius: StRadius.brLg,
        boxShadow: context.stShadows.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(phrase, style: StType.titleSmall.copyWith(color: c.textStrong)),
          const SizedBox(height: 2),
          StL1Text(l1, rtl: true, style: StType.bodyMedium.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }
}

/// Floats [child] up 6 px and back over 5 s, tilted by [angle] degrees.
/// [phase] (0–1) offsets the loop so two cards do not move together.
class _Drift extends StatefulWidget {
  const _Drift({required this.child, required this.still, required this.angle, required this.phase});
  final Widget child;
  final bool still;
  final double angle;
  final double phase;

  @override
  State<_Drift> createState() => _DriftState();
}

class _DriftState extends State<_Drift> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(seconds: 5))..value = widget.phase;

  @override
  void initState() {
    super.initState();
    if (!widget.still) _c.repeat();
  }

  @override
  void didUpdateWidget(_Drift old) {
    super.didUpdateWidget(old);
    if (widget.still) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, child) {
          // 0 → -6 → 0 with an ease-in-out shape.
          final y = widget.still ? 0.0 : -6 * (0.5 - 0.5 * cos(2 * pi * _c.value));
          return Transform.translate(offset: Offset(0, y), child: Transform.rotate(angle: widget.angle * pi / 180, child: child));
        },
        child: widget.child,
      );
}

/// Logo pulse for the "Signing you in…" overlay.
class _Pulse extends StatefulWidget {
  const _Pulse({required this.child, required this.still});
  final Widget child;
  final bool still;

  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600));

  @override
  void initState() {
    super.initState();
    if (!widget.still) _c.repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.still) return widget.child;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) {
        final t = 0.5 - 0.5 * cos(2 * pi * _c.value); // 0 → 1 → 0
        return Opacity(opacity: 0.45 + 0.55 * t, child: Transform.scale(scale: 0.94 + 0.06 * t, child: child));
      },
      child: widget.child,
    );
  }
}

/// The bottom panel rises 10 px and fades in once.
class _RiseIn extends StatelessWidget {
  const _RiseIn({required this.child, required this.still});
  final Widget child;
  final bool still;

  @override
  Widget build(BuildContext context) {
    if (still) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: StMotion.slow,
      curve: StMotion.easeOut,
      builder: (_, t, child) => Opacity(opacity: t, child: Transform.translate(offset: Offset(0, 10 * (1 - t)), child: child)),
      child: child,
    );
  }
}

class _LegalLinks extends StatelessWidget {
  const _LegalLinks({required this.onOpen});
  final void Function(String url) onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final link = StType.bodySmall.copyWith(color: c.textLink, fontWeight: FontWeight.w700);
    return Row(
      children: [
        _Link('Terms', style: link, onTap: () => onOpen(AppConfig.termsUrl)),
        Text('  ·  ', style: StType.bodySmall.copyWith(color: c.textFaint)),
        _Link('Privacy', style: link, onTap: () => onOpen(AppConfig.privacyUrl)),
      ],
    );
  }
}

class _Link extends StatelessWidget {
  const _Link(this.text, {required this.style, required this.onTap});
  final String text;
  final TextStyle style;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    link: true,
    label: text,
    excludeSemantics: true,
    child: GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Text(text, style: style),
      ),
    ),
  );
}

class _Glow extends StatelessWidget {
  const _Glow({required this.color, required this.size});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)], stops: const [0, 0.62]),
      ),
    ),
  );
}
