import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';

/// Chooses an own language from the register (every language our learners
/// speak, not a short list). Returns its code, or null when closed.
///
/// [showReview] marks each one "checked by a teacher" or "checked by AI" (the
/// "Coach explains in" list, S12 and S17).
Future<String?> pickOwnLanguage(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  String? subtitle,
  String? current,
  bool showReview = false,
}) async {
  final caps = await ref.read(languageCapsProvider.future).catchError((_) => LanguageCapabilities.fallback);
  if (!context.mounted) return null;
  return showModalBottomSheet<String>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.st.surfaceCard,
    barrierColor: context.st.surfaceOverlay,
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.85,
      child: OwnLanguagePickerSheet(languages: caps.own, title: title, subtitle: subtitle, current: current, showReview: showReview),
    ),
  );
}

class OwnLanguagePickerSheet extends StatefulWidget {
  const OwnLanguagePickerSheet({super.key, required this.languages, required this.title, this.subtitle, this.current, this.showReview = false});

  final List<OwnLanguage> languages;
  final String title;
  final String? subtitle;
  final String? current;
  final bool showReview;

  @override
  State<OwnLanguagePickerSheet> createState() => _OwnLanguagePickerSheetState();
}

class _OwnLanguagePickerSheetState extends State<OwnLanguagePickerSheet> {
  final _q = TextEditingController();

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final q = _q.text.trim().toLowerCase();
    final list = [
      for (final l in widget.languages)
        if (q.isEmpty || l.name.toLowerCase().contains(q) || l.nativeName.toLowerCase().contains(q) || l.code == q) l,
    ];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: StSheet(
        title: widget.title,
        scrollable: false,
        child: Column(
          children: [
            if (widget.subtitle != null) ...[Text(widget.subtitle!, style: StType.bodyMedium.copyWith(color: c.textMuted)), const SizedBox(height: 10)],
            StInput(controller: _q, placeholder: 'Search languages', icon: StIcons.search, onChanged: (_) => setState(() {})),
            const SizedBox(height: 8),
            Expanded(
              child: list.isEmpty
                  ? Center(child: Text('No language matches "${_q.text.trim()}".', style: StType.bodyMedium.copyWith(color: c.textMuted)))
                  : ListView.builder(
                      itemCount: list.length,
                      itemBuilder: (_, i) {
                        final l = list[i];
                        final selected = l.code == widget.current;
                        final review = l.teacherChecked ? 'checked by a teacher' : 'checked by AI';
                        return Semantics(
                          button: true,
                          selected: selected,
                          label: widget.showReview ? '${l.name}, $review' : l.name,
                          excludeSemantics: true,
                          child: StPressable(
                            pressedScale: 1,
                            onTap: () => Navigator.pop(context, l.code),
                            child: Container(
                              constraints: const BoxConstraints(minHeight: 56),
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.borderSubtle))),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Wrap(
                                          crossAxisAlignment: WrapCrossAlignment.center,
                                          children: [
                                            Text(l.name, style: StType.titleSmall.copyWith(color: c.textStrong)),
                                            if (l.nativeName.isNotEmpty && l.nativeName != l.name) ...[
                                              Text('  ·  ', style: StType.bodyMedium.copyWith(color: c.textMuted)),
                                              StL1Text(l.nativeName, rtl: l.rtl, style: StType.bodyMedium.copyWith(color: c.textMuted)),
                                            ],
                                          ],
                                        ),
                                        if (widget.showReview) Text(review, style: StType.bodySmall.copyWith(color: l.teacherChecked ? c.jade700 : c.textMuted)),
                                      ],
                                    ),
                                  ),
                                  if (selected) StIcon(StIcons.check, size: 20, color: c.rose600),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
