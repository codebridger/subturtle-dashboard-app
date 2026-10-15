import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:subturtle_api/subturtle_api.dart';
import 'package:subturtle_ui/subturtle_ui.dart';

import '../../app/providers.dart';
import '../../shared/format.dart';
import '../../shared/widgets.dart';

/// Bundle picker: search, "+ New bundle", the 5 newest, then all A–Z.
/// One tap picks and closes. Returns the chosen (or new) bundle.
Future<Bundle?> pickBundle(BuildContext context, {String? current, String? suggestedNew, String title = 'Choose a bundle'}) {
  return showModalBottomSheet<Bundle>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.st.surfaceCard,
    barrierColor: context.st.surfaceOverlay,
    builder: (_) => FractionallySizedBox(heightFactor: 0.85, child: _BundlePicker(current: current, suggestedNew: suggestedNew, title: title)),
  );
}

class _BundlePicker extends ConsumerStatefulWidget {
  const _BundlePicker({this.current, this.suggestedNew, required this.title});
  final String? current;
  final String? suggestedNew;
  final String title;

  @override
  ConsumerState<_BundlePicker> createState() => _BundlePickerState();
}

class _BundlePickerState extends ConsumerState<_BundlePicker> {
  final _search = TextEditingController();
  bool _creating = false;
  String? _error;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _create(String title) async {
    if (title.trim().isEmpty) return;
    setState(() {
      _creating = true;
      _error = null;
    });
    try {
      final b = await ref.read(apiProvider).bundles.createBundle(title);
      ref.invalidate(bundlesProvider);
      if (mounted) Navigator.pop(context, b);
    } catch (e) {
      setState(() => _error = e is ApiException && (e.message.contains('duplicate') || e.message.contains('E11000')) ? 'You already have a bundle with this name.' : friendlyError(e));
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.st;
    final bundles = ref.watch(bundlesProvider);
    final q = _search.text.trim().toLowerCase();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: StSheet(
        title: widget.title,
        scrollable: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StInput(controller: _search, placeholder: 'Search or name a new bundle', icon: StIcons.search, onChanged: (_) => setState(() {})),
            const SizedBox(height: 10),
            StButton(
              label: q.isEmpty ? (widget.suggestedNew == null ? 'New bundle' : 'New: ${widget.suggestedNew}') : 'New bundle "${_search.text.trim()}"',
              icon: StIcons.add,
              variant: StButtonVariant.soft,
              block: true,
              loading: _creating,
              onPressed: q.isEmpty && widget.suggestedNew == null ? _askName : () => _create(q.isEmpty ? widget.suggestedNew! : _search.text.trim()),
            ),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_error!, style: StType.bodySmall.copyWith(color: c.red600))),
            const SizedBox(height: 8),
            Expanded(
              child: AsyncBody<List<Bundle>>(
                value: bundles,
                onRetry: () => ref.invalidate(bundlesProvider),
                loading: const SkeletonList(count: 5, height: 56, padding: EdgeInsets.zero),
                data: (all) {
                  final filtered = all.where((b) => q.isEmpty || b.title.toLowerCase().contains(q)).toList();
                  final recent = q.isEmpty ? filtered.take(5).toList() : <Bundle>[];
                  final az = [...filtered]..sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
                  return ListView(
                    children: [
                      if (recent.isNotEmpty) ...[
                        const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: StEyebrow.section('Recent')),
                        for (final b in recent) _row(b),
                      ],
                      if (az.isNotEmpty) ...[
                        const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: StEyebrow.section('All bundles')),
                        for (final b in az) _row(b),
                      ],
                      if (filtered.isEmpty && q.isNotEmpty) Padding(padding: const EdgeInsets.all(16), child: Text('No bundle matches "$q".', style: StType.bodyMedium.copyWith(color: c.textMuted))),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _askName() async {
    final ctrl = TextEditingController();
    final name = await showStBottomSheet<String>(
      context: context,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: StSheet(
          title: 'New bundle',
          footer: StButton(label: 'Create', size: StSize.lg, block: true, onPressed: () => Navigator.pop(ctx, ctrl.text.trim())),
          child: StInput(controller: ctrl, label: 'Name', autofocus: true, textCapitalization: TextCapitalization.sentences, onSubmitted: (v) => Navigator.pop(ctx, v.trim())),
        ),
      ),
    );
    if (name != null && name.isNotEmpty) await _create(name);
  }

  Widget _row(Bundle b) {
    final c = context.st;
    final selected = b.id == widget.current;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: ListRowCard(
        minHeight: 56,
        leading: BundleCover(title: b.title, size: 36),
        title: Text(b.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: StType.titleSmall.copyWith(color: c.textStrong)),
        subtitle: Text(Fmt.plural(b.phraseCount, 'phrase'), style: StType.bodySmall.copyWith(color: c.textMuted)),
        trailing: selected ? StIcon(StIcons.check, size: 20, color: c.rose600) : null,
        semanticLabel: '${b.title}${selected ? ', selected' : ''}',
        onTap: () => Navigator.pop(context, b),
      ),
    );
  }
}
