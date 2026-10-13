import 'package:flutter/material.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

/// Gallery of every subturtle_ui component. The switch in the top bar flips the
/// whole page between the light and dark themes.
void main() => runApp(const GalleryApp());

class GalleryApp extends StatefulWidget {
  const GalleryApp({super.key});

  @override
  State<GalleryApp> createState() => _GalleryAppState();
}

class _GalleryAppState extends State<GalleryApp> {
  ThemeMode _mode = ThemeMode.light;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Subturtle UI',
      debugShowCheckedModeBanner: false,
      theme: StTheme.light(),
      darkTheme: StTheme.dark(),
      themeMode: _mode,
      home: GalleryPage(
        dark: _mode == ThemeMode.dark,
        onToggle: (v) => setState(() => _mode = v ? ThemeMode.dark : ThemeMode.light),
      ),
    );
  }
}

class GalleryPage extends StatefulWidget {
  const GalleryPage({super.key, required this.dark, required this.onToggle});
  final bool dark;
  final ValueChanged<bool> onToggle;

  @override
  State<GalleryPage> createState() => _GalleryPageState();
}

class _GalleryPageState extends State<GalleryPage> {
  int _tab = 0;
  String _mode = 'voice';
  bool _switch = true;
  final Set<int> _words = {3, 4, 5};
  bool _fabExtended = true;

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    return Scaffold(
      body: NotificationListener<ScrollUpdateNotification>(
        onNotification: (n) {
          final extended = n.metrics.pixels < 40;
          if (extended != _fabExtended) setState(() => _fabExtended = extended);
          return false;
        },
        child: ListView(
          padding: EdgeInsets.fromLTRB(16, MediaQuery.paddingOf(context).top + 8, 16, 120),
          children: [
            StPageHeader(
              padding: EdgeInsets.zero,
              eyebrow: 'Design kit',
              title: 'Subturtle UI',
              subtitle: Text('Every component, in ${widget.dark ? 'dark' : 'light'}.', style: StType.bodyMedium.copyWith(color: c.textMuted)),
              trailing: StSwitch(value: widget.dark, onChanged: widget.onToggle, semanticLabel: 'Dark theme'),
            ),
            _section('Buttons'),
            for (final variant in StButtonVariant.values)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Wrap(
                  spacing: 8,
                  children: [
                    for (final tone in StTone.values) StButton(label: '${variant.name} ${tone.name}', variant: variant, tone: tone, size: StSize.sm, onPressed: () {}),
                  ],
                ),
              ),
            StButton(label: 'Start review', icon: StIcons.play, size: StSize.lg, block: true, onPressed: () {}),
            StButton(label: 'Saving', size: StSize.lg, block: true, loading: true, onPressed: () {}),
            StButton(label: 'Tap at least one word', size: StSize.lg, block: true, icon: StIcons.bookmark),
            Row(
              children: [
                Expanded(child: StButton(label: 'Forgot', variant: StButtonVariant.outline, tone: StTone.danger, size: StSize.lg, block: true, icon: StIcons.forgotDuo, onPressed: () {})),
                const SizedBox(width: 10),
                Expanded(child: StButton(label: 'Learned', variant: StButtonVariant.outline, tone: StTone.accent, size: StSize.lg, block: true, icon: StIcons.checkDuo, emphasis: true, onPressed: () {})),
              ],
            ),
            _section('Icon buttons'),
            Wrap(
              spacing: 4,
              children: [
                StIconButton(icon: StIcons.speaker, semanticLabel: 'Play pronunciation', onPressed: () {}),
                StIconButton(icon: StIcons.more, semanticLabel: 'More options', variant: StButtonVariant.ghost, onPressed: () {}),
                StIconButton(icon: StIcons.search, semanticLabel: 'Search', variant: StButtonVariant.ghost, onPressed: () {}),
                StIconButton(icon: StIcons.mic, semanticLabel: 'Microphone', variant: StButtonVariant.solid, tone: StTone.primary, size: StSize.lg, round: true, onPressed: () {}),
                StTopBarButton(icon: StIcons.close, semanticLabel: 'Close', onPressed: () {}),
                StTopBarButton(icon: StIcons.undo, semanticLabel: 'Undo last answer', iconSize: 24, onPressed: () {}),
              ],
            ),
            _section('Badges and tags'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final color in StBadgeColor.values) StBadge(color.name, color: color),
                const StBadge('Learned', color: StBadgeColor.accent, solid: true, icon: StIcons.check),
                const StBadge('Persian', icon: StIcons.translation),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                const StTag('phrasal verb'),
                const StTag('informal'),
                for (final (i, w) in ['I', 'had', 'to', 'get', 'out', 'of', 'there'].indexed)
                  StTag(w, large: true, active: _words.contains(i), onTap: () => setState(() => _words.contains(i) ? _words.remove(i) : _words.add(i))),
              ],
            ),
            _section('Avatars'),
            Row(
              children: [
                for (final s in StAvatarSize.values) Padding(padding: const EdgeInsets.only(right: 8), child: StAvatar(name: 'Sara Ahmadi', size: s)),
              ],
            ),
            _section('Progress, level, segmented, switch'),
            const StProgressBar(value: 4, max: 12),
            const SizedBox(height: 8),
            const StProgressBar(value: 3, max: 8, color: StBadgeColor.accent, size: StSize3.sm),
            const SizedBox(height: 8),
            const StProgressBar(value: 72, max: 90, color: StBadgeColor.warning, size: StSize3.sm),
            const SizedBox(height: 8),
            const StProgressBar(value: 90, max: 90, color: StBadgeColor.danger, size: StSize3.sm),
            const SizedBox(height: 12),
            const StLevelPip(level: 2, label: 'Level 2'),
            const SizedBox(height: 12),
            StSegmentedControl<String>(
              block: true,
              segments: const [StSegment('voice', 'Voice', icon: StIcons.mic), StSegment('text', 'Text', icon: StIcons.keyboard)],
              value: _mode,
              onChanged: (v) => setState(() => _mode = v),
            ),
            Row(children: [Text('Haptics', style: StType.bodyMedium.copyWith(color: c.textStrong)), const Spacer(), StSwitch(value: _switch, onChanged: (v) => setState(() => _switch = v), semanticLabel: 'Haptics')]),
            _section('Input'),
            const StInput(label: 'Type the missing words', icon: StIcons.pen, hint: 'Spelling is forgiving. Case and end marks are ignored.'),
            const SizedBox(height: 12),
            const StInput(label: 'Email', placeholder: 'you@example.com', error: 'Please enter a valid email.'),
            _section('Cards and tiles'),
            StCard(
              child: Row(
                children: [
                  const StIconTile(icon: StIcons.stars, color: StBadgeColor.accent),
                  const SizedBox(width: 12),
                  Expanded(child: Text('8 new words to meet', style: StType.titleSmall.copyWith(color: c.textStrong))),
                  StButton(label: 'Start', variant: StButtonVariant.soft, tone: StTone.accent, size: StSize.sm, onPressed: () {}),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const Row(
              children: [
                Expanded(child: StStatTile(icon: 'solar:check-circle-bold-duotone', value: '9', label: 'Learned', accent: StBadgeColor.accent)),
                SizedBox(width: 8),
                Expanded(child: StStatTile(icon: StIcons.refreshCircle, value: '3', label: 'To review', accent: StBadgeColor.warning)),
                SizedBox(width: 8),
                Expanded(child: StStatTile(icon: StIcons.clock, value: '4m', label: 'Time', accent: StBadgeColor.info)),
              ],
            ),
            _section('L1 text (RTL)'),
            const StL1Text('بیرون رفتن، ترک کردن', rtl: true, languageName: 'Persian'),
            _section('Empty state, skeleton, toast'),
            StEmptyState(
              compact: true,
              icon: StIcons.inbox,
              title: 'No bundles yet',
              description: 'Share a word from any app, or paste one here.',
              action: StButton(label: 'Save a phrase', icon: StIcons.add, onPressed: () {}),
            ),
            const StSkeleton(height: 120),
            const SizedBox(height: 8),
            const StSkeleton(height: 60, radius: StRadius.md),
            const SizedBox(height: 12),
            const StToast(title: 'Saved to Stranger Things S2', actionLabel: 'View'),
            const SizedBox(height: 8),
            StButton(
              label: 'Show toast',
              variant: StButtonVariant.soft,
              onPressed: () => showStToast(context, title: 'Marked Learned', actionLabel: 'Undo', onAction: () {}),
            ),
            StButton(
              label: 'Open bottom sheet',
              variant: StButtonVariant.soft,
              onPressed: () => showStBottomSheet<void>(
                context: context,
                builder: (_) => StSheet(
                  eyebrow: 'AI coaching',
                  title: 'Start a session',
                  footer: StButton(label: 'Start voice chat', icon: StIcons.play, size: StSize.lg, block: true, onPressed: () => Navigator.pop(context)),
                  child: Text('Sheet content goes here.', style: StType.bodyLarge.copyWith(color: c.textBody)),
                ),
              ),
            ),
            _section('Icons (${StIcon.names.length})'),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [for (final n in StIcon.names) Tooltip(message: n, child: StIcon(n, size: 24, color: c.textStrong))],
            ),
          ],
        ),
      ),
      floatingActionButton: StFab(label: 'Save a phrase', extended: _fabExtended, onPressed: () {}),
      bottomNavigationBar: StTabBar(
        currentIndex: _tab,
        onTap: (i) => setState(() => _tab = i),
        items: const [
          StTabItem(label: 'Today', icon: StIcons.today, showDot: true),
          StTabItem(label: 'Bundles', icon: StIcons.bundles),
          StTabItem(label: 'Coach', icon: StIcons.coach),
          StTabItem(label: 'Me', icon: StIcons.me),
        ],
      ),
    );
  }

  Widget _section(String title) => Padding(padding: const EdgeInsets.only(top: 24, bottom: 10), child: StEyebrow.section(title));
}
