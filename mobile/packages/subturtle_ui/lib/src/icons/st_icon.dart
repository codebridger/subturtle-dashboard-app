import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

part 'st_icon_data.g.dart';

/// One Iconify icon: the SVG body and its view box.
@immutable
class StIconData {
  const StIconData(this.body, this.width, this.height);
  final String body;
  final int width;
  final int height;
}

/// A Solar (or Logos) icon, drawn from the bundled Iconify data.
///
/// Names are Iconify names, the same as on the web: `solar:play-bold`,
/// `solar:notebook-bold-duotone`. Duotone icons keep their two tones because the
/// colour is written into the SVG (`currentColor`), not applied as a flat filter.
///
/// Icons are decorative by default. Give [semanticLabel] only when the icon is
/// the only thing that says what something means.
class StIcon extends StatelessWidget {
  const StIcon(this.name, {super.key, this.size = 20, this.color, this.semanticLabel});

  final String name;
  final double size;
  final Color? color;
  final String? semanticLabel;

  /// True when an icon with this name is bundled.
  static bool exists(String name) => _stIconData.containsKey(name);

  /// Every bundled icon name, sorted. Used by the gallery.
  static List<String> get names => _stIconData.keys.toList()..sort();

  static final Map<String, String> _svgCache = {};

  static String _svg(StIconData d, Color color) {
    final hex = '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
    final alpha = color.a;
    final key = '${d.hashCode}-$hex-$alpha';
    return _svgCache.putIfAbsent(key, () {
      final body = d.body.replaceAll('currentColor', hex);
      final opacity = alpha < 1 ? ' opacity="${alpha.toStringAsFixed(3)}"' : '';
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}"$opacity>$body</svg>';
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = _stIconData[name];
    final color = this.color ?? IconTheme.of(context).color ?? const Color(0xFF1B1620);
    Widget child;
    if (data == null) {
      assert(false, 'StIcon: unknown icon "$name". Add it to tool/gen_icons.mjs sources.');
      child = SizedBox(width: size, height: size);
    } else {
      child = SvgPicture.string(_svg(data, color), width: size, height: size);
    }
    if (semanticLabel == null) return ExcludeSemantics(child: child);
    return Semantics(label: semanticLabel, image: true, child: ExcludeSemantics(child: child));
  }
}

/// The icon names this app uses, so a typo is a compile error, not a blank box.
abstract final class StIcons {
  // Navigation (bold-duotone for nav and tiles).
  static const today = 'solar:home-smile-bold-duotone';
  static const bundles = 'solar:notebook-bold-duotone';
  static const coach = 'solar:chat-round-dots-bold-duotone';
  static const me = 'solar:user-bold-duotone';

  // Top bars (linear).
  static const close = 'solar:close-circle-linear';
  static const back = 'solar:arrow-left-linear';
  static const more = 'solar:menu-dots-bold';
  static const search = 'solar:magnifer-linear';
  static const chevronRight = 'solar:alt-arrow-right-linear';
  static const chevronDown = 'solar:alt-arrow-down-linear';
  static const external = 'solar:arrow-right-up-linear';
  static const undo = 'solar:restart-bold';

  // Actions.
  static const add = 'solar:add-circle-bold';
  static const play = 'solar:play-bold';
  static const playCircle = 'solar:play-circle-bold';
  static const next = 'solar:arrow-right-bold';
  static const flip = 'solar:refresh-bold';
  static const refresh = 'solar:refresh-linear';
  static const speaker = 'solar:volume-loud-bold';
  static const pen = 'solar:pen-2-linear';
  static const trash = 'solar:trash-bin-trash-linear';
  static const bookmark = 'solar:bookmark-bold';
  static const check = 'solar:check-circle-bold';
  static const checkDuo = 'solar:check-circle-bold-duotone';
  static const forgotDuo = 'solar:close-circle-bold-duotone';
  static const closeBold = 'solar:close-circle-bold';
  static const logout = 'solar:logout-2-linear';
  static const keyboard = 'solar:keyboard-linear';
  static const mic = 'solar:microphone-3-bold';
  static const micOff = 'solar:microphone-slash-bold';
  static const captions = 'solar:eye-bold-duotone';
  static const captionsOff = 'solar:eye-closed-bold-duotone';
  static const soundwave = 'solar:soundwave-bold';
  static const send = 'solar:arrow-right-bold';
  static const sendUp = 'solar:arrow-up-bold';

  // Content.
  static const fire = 'solar:fire-bold-duotone';
  static const layers = 'solar:layers-minimalistic-bold-duotone';
  static const stars = 'solar:stars-bold-duotone';
  static const chatDots = 'solar:chat-round-dots-bold';
  static const confetti = 'solar:confetti-bold-duotone';
  static const clock = 'solar:clock-circle-bold-duotone';
  static const clockBold = 'solar:clock-circle-bold';
  static const refreshCircle = 'solar:refresh-circle-bold';
  static const lightbulb = 'solar:lightbulb-bold';
  static const translation = 'solar:translation-2-bold';
  static const translationDuo = 'solar:translation-2-bold-duotone';
  static const crown = 'solar:crown-bold-duotone';
  static const chart = 'solar:chart-2-bold-duotone';
  static const video = 'solar:videocamera-record-bold';
  static const documents = 'solar:documents-bold-duotone';
  static const notebook = 'solar:notebook-bold-duotone';
  static const rocket = 'solar:rocket-2-bold';
  static const danger = 'solar:danger-triangle-bold';
  static const info = 'solar:info-circle-bold';
  static const bell = 'solar:bell-bold';
  static const global = 'solar:global-linear';
  static const settings = 'solar:settings-linear';
  static const lock = 'solar:lock-keyhole-minimalistic-bold-duotone';
  static const inbox = 'solar:inbox-in-bold-duotone';
  static const history = 'solar:history-2-bold-duotone';
  static const sun = 'solar:sun-2-bold-duotone';
  static const moon = 'solar:moon-bold-duotone';
  static const monitor = 'solar:monitor-bold-duotone';
  static const google = 'logos:google-icon';
  static const chrome = 'logos:chrome';
  static const apple = 'logos:apple';
}
