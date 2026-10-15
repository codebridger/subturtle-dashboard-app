import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// A recorded request.
class Call {
  Call(this.method, this.url, this.headers, this.body);
  final String method;
  final Uri url;
  final Map<String, String> headers;
  final dynamic body;

  /// For `/function/run`: the function name and its args.
  String? get fn => body is Map ? body['name'] as String? : null;
  Map<String, dynamic> get args => body is Map && body['args'] is Map ? Map<String, dynamic>.from(body['args'] as Map) : {};
}

/// A fake backend: routes by path (and function name), records every call.
class FakeServer {
  final calls = <Call>[];
  final Map<String, http.Response Function(Call)> routes = {};
  final Map<String, http.Response Function(Call)> functions = {};

  void onFunction(String name, Object? data, {int status = 200}) {
    functions[name] = (_) => json(status == 200 ? {'status': 'success', 'data': data} : data, status: status);
  }

  void onPath(String path, http.Response Function(Call) handler) => routes[path] = handler;

  static http.Response json(Object? body, {int status = 200}) =>
      http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

  late final http.Client client = MockClient((req) async {
    final body = req.body.isEmpty ? null : jsonDecode(req.body);
    final call = Call(req.method, req.url, req.headers, body);
    calls.add(call);
    if (req.url.path == '/function/run') {
      final h = functions[call.fn];
      if (h == null) return json({'status': 'error', 'message': 'Function ${call.fn} not found'}, status: 400);
      return h(call);
    }
    final h = routes[req.url.path];
    if (h == null) return http.Response('Not found', 404);
    return h(call);
  });

  Call last(String fn) => calls.lastWhere((c) => c.fn == fn);
}

/// A token whose payload is `{"id": id}` (signature is not checked by the client).
String fakeJwt(String id) {
  String b64(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${b64({'alg': 'RS256'})}.${b64({'id': id, 'permissionGroup': {'title': 'user'}})}.sig';
}
