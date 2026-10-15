import 'package:flutter/material.dart';

import '../icons/st_icon.dart';
import '../theme/st_theme.dart';
import '../tokens/st_effects.dart';
import '../tokens/st_typography.dart';
import 'st_button.dart';
import 'st_display.dart';
import 'st_pressable.dart';

// Phone-only parts. The design system has no mobile tab bar, bottom sheet or FAB
// yet; these are built from its tokens, following `mobile.css` in the handoff.

/// One tab of [StTabBar].
class StTabItem {
  const StTabItem({required this.label, required this.icon, this.showDot = false});
  final String label;
  final String icon;

  /// A small rose dot (only Today may show one, and never a number).
  final bool showDot;
}

/// Bottom tab bar: 4 tabs, always with labels, a soft rose pill behind the
/// active icon. Labels are clamped at 1.5× text scale so the bar stays usable.
class StTabBar extends StatelessWidget {
  const StTabBar({super.key, required this.items, required this.currentIndex, required this.onTap});

  final List<StTabItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final scaler = MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.5);
    return MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: scaler),
      child: Container(
        decoration: BoxDecoration(color: c.surfaceCard, border: Border(top: BorderSide(color: c.borderSubtle))),
        padding: EdgeInsets.only(bottom: bottom > 0 ? bottom : 6, top: 6),
        child: Row(
          children: [
            for (var i = 0; i < items.length; i++)
              Expanded(child: _Tab(item: items[i], active: i == currentIndex, onTap: () => onTap(i), index: i, count: items.length)),
          ],
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({required this.item, required this.active, required this.onTap, required this.index, required this.count});
  final StTabItem item;
  final bool active;
  final VoidCallback onTap;
  final int index;
  final int count;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final fg = active ? c.textStrong : c.textMuted;
    return Semantics(
      button: true,
      selected: active,
      label: '${item.label}, tab ${index + 1} of $count${item.showDot ? ', new' : ''}',
      excludeSemantics: true,
      child: StPressable(
        pressedScale: 0.96,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 62),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  AnimatedContainer(
                    duration: StMotion.base,
                    curve: StMotion.easeOut,
                    width: 60,
                    height: 32,
                    decoration: BoxDecoration(color: active ? c.primarySoft : Colors.transparent, borderRadius: StRadius.brPill),
                    alignment: Alignment.center,
                    child: StIcon(item.icon, size: 24, color: active ? c.rose600 : c.textMuted),
                  ),
                  if (item.showDot)
                    Positioned(
                      right: 14,
                      top: 3,
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle, border: Border.all(color: c.surfaceCard, width: 1.5)),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                item.label,
                maxLines: 1,
                style: StType.base(size: 12, weight: active ? FontWeight.w800 : FontWeight.w700, height: 1.2).copyWith(color: fg),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The "Save a phrase" floating button. Extended (icon + label) at the top of a
/// list; shrinks to a round "+" when the user scrolls down ([extended] = false).
class StFab extends StatelessWidget {
  const StFab({super.key, required this.label, required this.onPressed, this.extended = true, this.icon = StIcons.add});

  final String label;
  final VoidCallback onPressed;
  final bool extended;
  final String icon;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final reduced = StMotion.reduced(context);
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: StPressable(
        onTap: onPressed,
        pressedScale: 0.95,
        child: AnimatedContainer(
          duration: reduced ? Duration.zero : StMotion.base,
          curve: StMotion.easeOut,
          height: extended ? 52 : 56,
          constraints: BoxConstraints(minWidth: extended ? 0 : 56),
          padding: EdgeInsets.only(left: extended ? 16 : 0, right: extended ? 20 : 0),
          decoration: BoxDecoration(color: c.surfaceInverse, borderRadius: StRadius.brPill, boxShadow: context.stShadows.lg),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              StIcon(icon, size: extended ? 22 : 26, color: c.paper),
              AnimatedSize(
                duration: reduced ? Duration.zero : StMotion.base,
                curve: StMotion.easeOut,
                child: extended
                    ? Padding(padding: const EdgeInsets.only(left: 8), child: Text(label, style: StType.label.copyWith(color: c.paper)))
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shows a Subturtle bottom sheet: rounded top (28), grab handle, solid scrim.
/// Always escapable: swipe down, the back button, a tap on the scrim, or the close button.
Future<T?> showStBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  bool useSafeArea = true,
  double? maxHeightFactor,
  bool useRootNavigator = false,
}) {
  final c = context.st;
  return showModalBottomSheet<T>(
    context: context,
    // Over the tab bar and its floating button, when the sheet opens from a tab.
    useRootNavigator: useRootNavigator,
    isScrollControlled: isScrollControlled,
    useSafeArea: useSafeArea,
    backgroundColor: c.surfaceCard,
    barrierColor: c.surfaceOverlay,
    showDragHandle: false,
    constraints: maxHeightFactor == null ? null : BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * maxHeightFactor),
    builder: builder,
  );
}

/// Standard sheet body: grab handle, eyebrow + title, close button, content and
/// an optional sticky footer (the main action).
class StSheet extends StatelessWidget {
  const StSheet({super.key, this.eyebrow, this.title, required this.child, this.footer, this.onClose, this.closeOnLeft = false, this.scrollable = true, this.padding = const EdgeInsets.fromLTRB(16, 12, 16, 16)});

  final String? eyebrow;
  final String? title;
  final Widget child;
  final Widget? footer;
  final VoidCallback? onClose;

  /// Capture puts the close button on the left; most sheets put it on the right.
  final bool closeOnLeft;
  final bool scrollable;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final close = StTopBarButton(icon: StIcons.close, semanticLabel: 'Close', onPressed: onClose ?? () => Navigator.of(context).maybePop());
    final heading = title == null
        ? const SizedBox.shrink()
        : Padding(
            padding: EdgeInsets.only(left: closeOnLeft ? 0 : 16, top: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (eyebrow != null) ...[StEyebrow(eyebrow!), const SizedBox(height: 4)],
                Semantics(header: true, child: Text(title!, style: StType.titleLarge.copyWith(color: c.textStrong))),
              ],
            ),
          );
    final body = Padding(padding: padding, child: child);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            margin: const EdgeInsets.only(top: 10),
            width: 36,
            height: 4,
            decoration: BoxDecoration(color: c.borderStrong, borderRadius: BorderRadius.circular(2)),
          ),
        ),
        Padding(
          padding: EdgeInsets.only(left: closeOnLeft ? 4 : 0, right: closeOnLeft ? 8 : 4, top: 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: closeOnLeft ? [close, Expanded(child: heading)] : [Expanded(child: heading), close],
          ),
        ),
        if (scrollable) Flexible(child: SingleChildScrollView(child: body)) else Flexible(child: body),
        if (footer != null)
          Container(
            decoration: BoxDecoration(border: Border(top: BorderSide(color: c.borderSubtle))),
            padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.paddingOf(context).bottom),
            child: footer,
          ),
      ],
    );
  }
}

/// Loading placeholder block (`.sk`): pulses between ink-100 and ink-150; still
/// under reduced motion.
class StSkeleton extends StatefulWidget {
  const StSkeleton({super.key, this.width, this.height = 16, this.radius = StRadius.lg});

  final double? width;
  final double height;
  final double radius;

  @override
  State<StSkeleton> createState() => _StSkeletonState();
}

class _StSkeletonState extends State<StSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (StMotion.reduced(context)) {
      _ctrl.stop();
    } else if (!_ctrl.isAnimating) {
      _ctrl.repeat();
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final reduced = StMotion.reduced(context);
    return ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) {
          final t = reduced ? 1.0 : StMotion.easeInOut.transform(1 - (2 * _ctrl.value - 1).abs());
          return Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(color: Color.lerp(c.ink100, c.ink150, t), borderRadius: BorderRadius.circular(widget.radius)),
          );
        },
      ),
    );
  }
}

/// Toast colour.
enum StToastColor { success, danger, warning, info, neutral }

/// Dark pill message with an icon and an optional action. Mirrors the design
/// system `Toast`. Show it with [showStToast] (it rides on the SnackBar system).
class StToast extends StatelessWidget {
  const StToast({super.key, required this.title, this.description, this.color = StToastColor.success, this.icon, this.actionLabel, this.onAction});

  final String title;
  final String? description;
  final StToastColor color;
  final String? icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    // The DS toast is ink-950 with white text. The ink ramp inverts in dark, so
    // use surface-inverse + paper to keep it readable in both themes.
    final (String ic, Color fg) = switch (color) {
      StToastColor.success => ('solar:check-circle-bold', c.jade400),
      StToastColor.danger => ('solar:close-circle-bold', c.rose400),
      StToastColor.warning => ('solar:danger-triangle-bold', c.amber500),
      StToastColor.info => ('solar:info-circle-bold', c.sky500),
      StToastColor.neutral => ('solar:bell-bold', c.ink400),
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: description == null ? 11 : 13),
        decoration: BoxDecoration(color: c.surfaceInverse, borderRadius: StRadius.brMd, boxShadow: context.stShadows.lg),
        child: Row(
          children: [
            StIcon(icon ?? ic, size: 20, color: fg),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title, style: StType.base(size: 14, weight: FontWeight.w800, height: 1.35).copyWith(color: c.paper)),
                  if (description != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(description!, style: StType.bodySmall.copyWith(color: c.ink300)),
                    ),
                ],
              ),
            ),
            if (actionLabel != null)
              Semantics(
                button: true,
                label: actionLabel,
                excludeSemantics: true,
                child: StPressable(
                  onTap: onAction,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 40, minWidth: 48),
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: Text(actionLabel!, style: StType.base(size: 14, weight: FontWeight.w800, height: 1).copyWith(color: c.rose400)),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Shows a [StToast] above the bottom of the screen (in-app only, never a system notification).
void showStToast(
  BuildContext context, {
  required String title,
  String? description,
  StToastColor color = StToastColor.success,
  String? actionLabel,
  VoidCallback? onAction,
  Duration duration = const Duration(seconds: 4),
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      backgroundColor: Colors.transparent,
      elevation: 0,
      padding: EdgeInsets.zero,
      duration: duration,
      behavior: SnackBarBehavior.floating,
      content: StToast(
        title: title,
        description: description,
        color: color,
        actionLabel: actionLabel,
        onAction: () {
          messenger.hideCurrentSnackBar();
          onAction?.call();
        },
      ),
    ),
  );
}

/// Header of a tab screen: eyebrow, big title, optional subtitle and a trailing widget.
class StPageHeader extends StatelessWidget {
  const StPageHeader({super.key, this.eyebrow, required this.title, this.subtitle, this.trailing, this.padding = const EdgeInsets.fromLTRB(16, 12, 16, 4)});

  final String? eyebrow;
  final String title;
  final Widget? subtitle;
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null) ...[StEyebrow(eyebrow!), const SizedBox(height: 6)],
                Semantics(header: true, child: Text(title, style: StType.headline.copyWith(color: c.textStrong))),
                if (subtitle != null) ...[const SizedBox(height: 6), subtitle!],
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Top bar of a full-screen task (review, pool): close on the left, title and
/// "N of M" with a progress bar in the middle, an optional action on the right.
class StTaskHeader extends StatelessWidget {
  const StTaskHeader({
    super.key,
    required this.title,
    required this.onClose,
    this.closeLabel = 'End',
    this.progress,
    this.total,
    this.progressColor = StBadgeColor.primary,
    this.trailing,
  });

  final String title;
  final VoidCallback onClose;
  final String closeLabel;
  final int? progress;
  final int? total;
  final StBadgeColor progressColor;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Container(
      decoration: BoxDecoration(color: c.surfaceCard, border: Border(bottom: BorderSide(color: c.borderSubtle))),
      padding: EdgeInsets.fromLTRB(4, MediaQuery.paddingOf(context).top + 4, trailing == null ? 16 : 4, 10),
      child: Row(
        children: [
          StTopBarButton(icon: StIcons.close, semanticLabel: closeLabel, onPressed: onClose),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Expanded(child: Semantics(header: true, child: Text(title, style: StType.titleMedium.copyWith(color: c.textStrong, fontWeight: FontWeight.w900)))),
                    if (progress != null && total != null)
                      Semantics(
                        liveRegion: true,
                        label: 'Card $progress of $total',
                        excludeSemantics: true,
                        child: Text('$progress of $total', style: StType.base(size: 12, weight: FontWeight.w800).copyWith(color: c.textMuted)),
                      ),
                  ],
                ),
                if (progress != null && total != null) ...[
                  const SizedBox(height: 5),
                  StProgressBar(value: progress!.toDouble(), max: total!.toDouble(), color: progressColor, size: StSize3.sm),
                ],
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// A rounded icon tile (44–48 dp) used at the start of Today and Coach cards.
class StIconTile extends StatelessWidget {
  const StIconTile({super.key, required this.icon, required this.color, this.size = 44});

  final String icon;

  /// primary, accent, warning or info.
  final StBadgeColor color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final (Color bg, Color fg) = switch (color) {
      StBadgeColor.accent => (c.accentSoft, c.jade600),
      StBadgeColor.warning => (c.warningSoft, c.amber600),
      StBadgeColor.info => (c.infoSoft, c.sky600),
      StBadgeColor.neutral => (c.ink100, c.ink600),
      StBadgeColor.danger => (c.dangerSoft, c.red600),
      StBadgeColor.primary => (c.primarySoft, c.rose600),
    };
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: bg, borderRadius: StRadius.brMd),
      alignment: Alignment.center,
      child: StIcon(icon, size: size * 0.55, color: fg),
    );
  }
}

/// A grey bar under the top of the screen: "You're offline."
class StOfflineBar extends StatelessWidget {
  const StOfflineBar({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        color: c.ink100,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Text(message, style: StType.bodySmall.copyWith(color: c.textBody)),
      ),
    );
  }
}
