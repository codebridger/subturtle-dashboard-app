/// Small, forgiving JSON readers. The backend returns Mongoose documents, so
/// numbers can be int or double, ids can be strings or `{_id}` objects, and
/// some joined docs still carry their fields under `_doc`.
library;

typedef Json = Map<String, dynamic>;

Json asJson(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

/// The fields of a Mongoose document, merging `_doc` (raw subdocuments) on top-level.
Json docOf(dynamic v) {
  final j = asJson(v);
  final inner = j['_doc'];
  if (inner is Map) return {...Map<String, dynamic>.from(inner), ...j..remove('_doc')};
  return j;
}

String str(dynamic v, [String fallback = '']) {
  if (v == null) return fallback;
  if (v is String) return v;
  if (v is Map && v['_id'] != null) return v['_id'].toString();
  return v.toString();
}

String? strOrNull(dynamic v) {
  final s = v == null ? null : str(v);
  return s == null || s.isEmpty ? null : s;
}

int integer(dynamic v, [int fallback = 0]) {
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? double.tryParse(v)?.round() ?? fallback;
  return fallback;
}

int? intOrNull(dynamic v) => v == null ? null : integer(v);

double number(dynamic v, [double fallback = 0]) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? fallback;
  return fallback;
}

bool boolean(dynamic v, [bool fallback = false]) => v is bool ? v : fallback;

DateTime? date(dynamic v) {
  if (v is String) return DateTime.tryParse(v)?.toLocal();
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v).toLocal();
  return null;
}

List<T> listOf<T>(dynamic v, T Function(dynamic) f) => v is List ? [for (final e in v) f(e)] : <T>[];

/// The `_id` of a document as a string.
String idOf(Json j) => str(j['_id'] ?? j['id']);
