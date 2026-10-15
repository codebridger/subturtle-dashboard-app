import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:subturtle_ui/subturtle_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/config.dart';
import '../app/providers.dart';
import 'format.dart';

/// Shows loading, error and data for an [AsyncValue] with the app's states:
/// skeletons while loading, an inline "Try again" on error.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({super.key, required this.value, required this.data, required this.loading, this.onRetry, this.errorTitle = "We couldn't load this."});

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final Widget loading;
  final VoidCallback? onRetry;
  final String errorTitle;

  @override
  Widget build(BuildContext context) {
    // A language switch reloads scoped data: show the skeleton, never the old
    // language's data under the new one.
    if (value.isReloading) return loading;
    // Keep showing old data while a refresh runs.
    if (value.hasValue) return data(value.requireValue);
    if (value.hasError) return ErrorPanel(title: errorTitle, error: value.error!, onRetry: onRetry);
    return loading;
  }
}

/// Inline error: icon, one kind sentence, "Try again". No dialogs.
class ErrorPanel extends StatelessWidget {
  const ErrorPanel({super.key, required this.title, this.error, this.onRetry, this.compact = true});

  final String title;
  final Object? error;
  final VoidCallback? onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return StEmptyState(
      compact: compact,
      icon: StIcons.danger,
      color: StBadgeColor.warning,
      title: title,
      description: error == null ? null : friendlyError(error!),
      action: onRetry == null ? null : StButton(label: 'Try again', variant: StButtonVariant.soft, tone: StTone.neutral, icon: StIcons.refresh, onPressed: onRetry),
    );
  }
}

/// A list of skeleton rows.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 6, this.height = 68, this.padding = const EdgeInsets.symmetric(horizontal: 16)});
  final int count;
  final double height;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading',
      child: Padding(
        padding: padding,
        child: Column(children: [for (var i = 0; i < count; i++) Padding(padding: const EdgeInsets.only(bottom: 8), child: StSkeleton(height: height, radius: StRadius.md))]),
      ),
    );
  }
}

/// The coloured square at the start of a bundle row (gradient + source icon).
class BundleCover extends StatelessWidget {
  const BundleCover({super.key, required this.title, this.size = 40, this.index});
  final String title;
  final double size;

  /// Picks the colour; defaults to a hash of the title so it stays stable.
  final int? index;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final pick = (index ?? title.codeUnits.fold<int>(0, (a, b) => a + b)) % 3;
    final colors = switch (pick) {
      0 => [c.rose400, c.rose600],
      1 => [c.jade400, c.jade600],
      _ => [StColors.light.ink600, StColors.light.ink800],
    };
    final t = title.toLowerCase();
    final icon = t.contains('phone') || t.contains('saved')
        ? StIcons.bookmark
        : (RegExp(r's\d|season|episode|e\d|youtube|ted|netflix|show|film|movie').hasMatch(t) ? StIcons.video : StIcons.documents);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
          borderRadius: BorderRadius.circular(size >= 56 ? StRadius.md : StRadius.sm),
        ),
        alignment: Alignment.center,
        child: StIcon(icon, size: size * 0.5, color: Colors.white),
      ),
    );
  }
}

/// A card-like list row: leading, title, subtitle, trailing.
class ListRowCard extends StatelessWidget {
  const ListRowCard({super.key, required this.title, this.subtitle, this.leading, this.trailing, this.onTap, this.onLongPress, this.semanticLabel, this.minHeight = 64});

  final Widget title;
  final Widget? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final String? semanticLabel;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final row = Container(
      constraints: BoxConstraints(minHeight: minHeight),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: c.surfaceCard, borderRadius: StRadius.brMd, border: Border.all(color: c.borderSubtle)),
      child: Row(
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 12)],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [title, if (subtitle != null) ...[const SizedBox(height: 2), subtitle!]],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 12), trailing!],
        ],
      ),
    );
    if (onTap == null && onLongPress == null) return row;
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: semanticLabel != null,
      child: StPressable(onTap: onTap, onLongPress: onLongPress, pressedScale: 0.99, child: row),
    );
  }
}

/// A sentence with the saved [highlight] in bold rose and [chunks] underlined in jade.
/// Bold + background and underline + colour stay clear in greyscale.
class HighlightedSentence extends StatelessWidget {
  const HighlightedSentence({super.key, required this.sentence, this.highlight, this.chunks = const [], this.style, this.quote = true});

  final String sentence;
  final String? highlight;
  final List<String> chunks;
  final TextStyle? style;
  final bool quote;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final base = style ?? StType.bodyLarge.copyWith(color: c.textBody);
    final text = quote ? '"$sentence"' : sentence;
    final lower = text.toLowerCase();

    // Mark ranges: 1 = phrase, 2 = chunk.
    final marks = List<int>.filled(text.length, 0);
    void mark(String? s, int kind) {
      if (s == null || s.trim().isEmpty) return;
      final i = lower.indexOf(s.trim().toLowerCase());
      if (i < 0) return;
      for (var k = i; k < i + s.trim().length && k < marks.length; k++) {
        if (marks[k] == 0 || kind == 1) marks[k] = kind;
      }
    }

    for (final ch in chunks) {
      mark(ch, 2);
    }
    mark(highlight, 1);

    final spans = <InlineSpan>[];
    var start = 0;
    for (var i = 1; i <= text.length; i++) {
      if (i == text.length || marks[i] != marks[start]) {
        final part = text.substring(start, i);
        final kind = marks[start];
        spans.add(TextSpan(
          text: part,
          style: switch (kind) {
            1 => TextStyle(fontWeight: FontWeight.w800, color: c.rose700, backgroundColor: c.primarySoft),
            2 => TextStyle(decoration: TextDecoration.underline, decorationColor: c.accent, decorationThickness: 2, color: c.jade700, fontWeight: FontWeight.w700),
            _ => null,
          },
        ));
        start = i;
      }
    }
    return Text.rich(TextSpan(style: base, children: spans));
  }
}

/// Opens [url] in the browser (or the mail app for `mailto:`).
/// Opens the web dashboard at [path] (a hash route such as
/// `/settings/subscription?suggest=learner`), already signed in.
///
/// Uses the dashboard's `login_with_token` handoff, as the Chrome extension
/// does: the token rides in the URL fragment, which is never sent to a
/// server, and the page drops it from the address bar before anything reads
/// the URL. `redirect` must be a same-origin path; the page checks it.
Future<void> openDashboard(BuildContext context, WidgetRef ref, String path) =>
    openExternal(context, dashboardLink(AppConfig.dashboardUrl, path, token: ref.read(apiProvider).auth.token));

/// The URL [openDashboard] opens. Without a token it is the plain page (the
/// dashboard then asks to sign in).
String dashboardLink(String base, String path, {String? token}) => token == null || token.isEmpty
    ? '$base/#$path'
    : '$base/#/auth/login_with_token?${Uri(queryParameters: {'token': token, 'redirect': path}).query}';

Future<void> openExternal(BuildContext context, String url) async {
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) showStToast(context, title: "Couldn't open the link.", color: StToastColor.danger);
}

/// Confirm sheet with a main and a second button. Returns true for the main one.
Future<bool> confirmSheet(BuildContext context, {required String title, String? body, required String confirm, String cancel = 'Cancel', bool danger = false}) async {
  final res = await showStBottomSheet<bool>(
    context: context,
    builder: (ctx) => StSheet(
      title: title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (body != null) ...[Text(body, style: StType.bodyLarge.copyWith(color: ctx.st.textMuted)), const SizedBox(height: 16)],
          StButton(label: confirm, size: StSize.lg, block: true, tone: danger ? StTone.danger : StTone.primary, onPressed: () => Navigator.pop(ctx, true)),
          const SizedBox(height: 8),
          StButton(label: cancel, size: StSize.lg, block: true, variant: StButtonVariant.ghost, tone: StTone.neutral, onPressed: () => Navigator.pop(ctx, false)),
          SizedBox(height: MediaQuery.paddingOf(ctx).bottom),
        ],
      ),
    ),
  );
  return res ?? false;
}
