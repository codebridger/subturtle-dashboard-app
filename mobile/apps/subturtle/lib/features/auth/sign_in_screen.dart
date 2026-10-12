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

/// S1 · Sign in. Google, or email and password. Sign in with Apple is not
/// offered: the backend has no Apple route yet (README, "Needs backend work").
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  _Step _step = _Step.start;
  String? _busy; // which button shows a spinner
  String? _error;
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
      if (e.code != GoogleSignInExceptionCode.canceled) setState(() => _error = "We couldn't sign you in with Google. Please try again.");
    } on ApiException catch (e) {
      setState(() => _error = e.isNetwork ? "You're offline. Connect to sign in." : _messageFor(key, e));
    } catch (_) {
      setState(() => _error = "We couldn't sign you in. Please try again.");
    } finally {
      if (mounted) setState(() => _busy = null);
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
    final g = GoogleSignIn.instance;
    await g.initialize(clientId: AppConfig.googleIosClientId.isEmpty ? null : AppConfig.googleIosClientId, serverClientId: AppConfig.googleServerClientId);
    const scopes = ['email', 'profile'];
    final account = await g.authenticate(scopeHint: scopes);
    final auth = await account.authorizationClient.authorizationForScopes(scopes) ?? await account.authorizationClient.authorizeScopes(scopes);
    return _api.auth.signInWithGoogleAccessToken(auth.accessToken);
  }

  bool _validEmail(String s) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s.trim());

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Scaffold(
      body: Stack(
        children: [
          // Two soft brand washes, purely decorative.
          Positioned(top: -140, left: -160, child: _Blob(color: c.rose500.withValues(alpha: 0.10), size: 420)),
          Positioned(bottom: 120, right: -180, child: _Blob(color: c.jade500.withValues(alpha: 0.10), size: 380)),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, box) => SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + (bottom > 0 ? 0 : 20)),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: box.maxHeight - 16),
                  // The hero sits in the middle; the buttons sit at the bottom, in the thumb zone.
                  child: IntrinsicHeight(
                    child: AutofillGroup(
                      child: Column(
                        children: [
                          Expanded(
                            child: Center(child: _Hero(compact: _step != _Step.start)),
                          ),
                          if (_error != null) ...[
                            Semantics(
                              liveRegion: true,
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Text(
                                  _error!,
                                  textAlign: TextAlign.center,
                                  style: StType.bodyMedium.copyWith(color: c.red600),
                                ),
                              ),
                            ),
                          ],
                          _body(context),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
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
            _GoogleButton(loading: _busy == 'google', onPressed: disabled ? null : () => _run('google', _google)),
            const SizedBox(height: 12),
            StButton(
              label: 'Continue with email',
              variant: StButtonVariant.ghost,
              size: StSize.lg,
              block: true,
              onPressed: disabled ? null : () => setState(() => _step = _Step.email),
            ),
            const SizedBox(height: 4),
            _LegalText(onOpen: (url) => openExternal(context, url)),
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
                onPressed: disabled ? null : () => setState(() => _step = _Step.signUpEmail),
              ),
            ],
            StButton(
              label: 'Back',
              variant: StButtonVariant.ghost,
              tone: StTone.neutral,
              onPressed: disabled ? null : () => setState(() => _step = _Step.start),
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
            StButton(label: 'Back', variant: StButtonVariant.ghost, tone: StTone.neutral, onPressed: () => setState(() => _step = _Step.email)),
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

class _Hero extends StatelessWidget {
  const _Hero({required this.compact});
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Padding(
      padding: EdgeInsets.only(top: compact ? 24 : 48, bottom: 24),
      child: Column(
        children: [
          Image.asset('assets/images/logo.png', width: compact ? 56 : 88, height: compact ? 56 : 88, semanticLabel: 'Subturtle'),
          const SizedBox(height: 22),
          const StEyebrow('Subturtle'),
          const SizedBox(height: 14),
          Semantics(
            header: true,
            child: Text(
              'Learn English from what you watch',
              textAlign: TextAlign.center,
              style: StType.headline.copyWith(color: c.textStrong, height: 1.25),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Your saved phrases, reviews and coach, in your pocket.',
            textAlign: TextAlign.center,
            style: StType.base(size: 16, weight: FontWeight.w600).copyWith(color: c.textMuted),
          ),
        ],
      ),
    );
  }
}

class _GoogleButton extends StatelessWidget {
  const _GoogleButton({required this.loading, required this.onPressed});
  final bool loading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      button: true,
      label: 'Continue with Google',
      excludeSemantics: true,
      child: Opacity(
        opacity: onPressed == null && !loading ? 0.5 : 1,
        child: StPressable(
          onTap: loading ? null : onPressed,
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              color: c.surfaceCard,
              borderRadius: StRadius.brMd,
              border: Border.all(color: c.borderDefault),
              boxShadow: context.stShadows.xs,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                loading
                    ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: c.textMuted))
                    : const StIcon(StIcons.google, size: 20),
                const SizedBox(width: 10),
                Flexible(
                  child: Text(
                    'Continue with Google',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: StType.base(size: 16, weight: FontWeight.w800, height: 1).copyWith(color: c.textStrong),
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

class _LegalText extends StatelessWidget {
  const _LegalText({required this.onOpen});
  final void Function(String url) onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final link = StType.bodySmall.copyWith(color: c.textLink, fontWeight: FontWeight.w700);
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text('By continuing you agree to our ', style: StType.bodySmall.copyWith(color: c.textMuted)),
        _Link('Terms', style: link, onTap: () => onOpen(AppConfig.termsUrl)),
        Text(' and ', style: StType.bodySmall.copyWith(color: c.textMuted)),
        _Link('Privacy Policy', style: link, onTap: () => onOpen(AppConfig.privacyUrl)),
        Text('.', style: StType.bodySmall.copyWith(color: c.textMuted)),
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

class _Blob extends StatelessWidget {
  const _Blob({required this.color, required this.size});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)], stops: const [0, 0.65]),
      ),
    ),
  );
}
