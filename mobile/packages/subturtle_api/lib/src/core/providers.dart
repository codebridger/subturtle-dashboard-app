import 'rest_client.dart';

/// Runs backend functions: `POST /function/run {name, args}` → `data`.
/// A port of `FunctionProvider` in `@modular-rest/client`.
///
/// The server pins `args.userId` / `args.refId` to the signed-in user, so every
/// repository passes the current user id in those fields.
class FunctionProvider {
  FunctionProvider(this._client);
  final RestClient _client;

  /// [as] sends that token instead of the signed-in one (see [RestClient.post]).
  Future<dynamic> run(String name, [Object? args, String? as]) async {
    final body = await _client.post('/function/run', {'name': name, 'args': args ?? const <String, dynamic>{}}, as);
    return body is Map ? body['data'] : body;
  }
}

/// The modular-rest data provider: Mongo-style CRUD on collections the user
/// may read or write. A port of `DataProvider` in `@modular-rest/client`.
class DataProvider {
  DataProvider(this._client);
  final RestClient _client;

  Future<dynamic> _data(String path, Map<String, dynamic> body) async {
    final res = await _client.post(path, body);
    return res is Map ? res['data'] : res;
  }

  Future<List<Map<String, dynamic>>> find({
    required String database,
    required String collection,
    required Map<String, dynamic> query,
    Map<String, dynamic>? options,
    Map<String, dynamic>? projection,
    List<dynamic>? populates,
  }) async {
    final data = await _data('/data-provider/find', {
      'database': database,
      'collection': collection,
      'query': query,
      'options': ?options,
      'projection': ?projection,
      'populates': ?populates,
    });
    return _list(data);
  }

  Future<Map<String, dynamic>?> findOne({required String database, required String collection, required Map<String, dynamic> query, Map<String, dynamic>? options}) async {
    final data = await _data('/data-provider/find-one', {'database': database, 'collection': collection, 'query': query, 'options': ?options});
    return data is Map ? Map<String, dynamic>.from(data) : null;
  }

  Future<int> count({required String database, required String collection, required Map<String, dynamic> query}) async {
    final data = await _data('/data-provider/count', {'database': database, 'collection': collection, 'query': query});
    return data is num ? data.toInt() : 0;
  }

  Future<Map<String, dynamic>?> insertOne({required String database, required String collection, required Map<String, dynamic> doc}) async {
    final data = await _data('/data-provider/insert-one', {'database': database, 'collection': collection, 'doc': doc});
    return data is Map ? Map<String, dynamic>.from(data) : null;
  }

  Future<dynamic> updateOne({required String database, required String collection, required Map<String, dynamic> query, required Map<String, dynamic> update}) {
    return _data('/data-provider/update-one', {'database': database, 'collection': collection, 'query': query, 'update': update});
  }

  Future<dynamic> removeOne({required String database, required String collection, required Map<String, dynamic> query}) {
    return _data('/data-provider/remove-one', {'database': database, 'collection': collection, 'query': query});
  }

  /// Documents by id, in the server's order. An empty [ids] list returns `[]`
  /// without a request (Mongo rejects an empty `$or`).
  Future<List<Map<String, dynamic>>> findByIds({required String database, required String collection, required List<String> ids, Map<String, dynamic>? accessQuery}) async {
    if (ids.isEmpty) return [];
    final data = await _data('/data-provider/findByIds', {'database': database, 'collection': collection, 'ids': ids, 'accessQuery': ?accessQuery});
    return _list(data);
  }

  static List<Map<String, dynamic>> _list(dynamic data) {
    if (data is! List) return [];
    return [for (final d in data) if (d is Map) Map<String, dynamic>.from(d)];
  }
}

/// Database and collection names (from `server/src/config.ts`).
abstract final class Db {
  static const userContent = 'user_content';
  static const phrase = 'phrase';
  static const bundle = 'phrase_bundle';
  static const profile = 'profile';
  static const liveSession = 'live_session';
  static const liveSessionText = 'live_session_text';
}
