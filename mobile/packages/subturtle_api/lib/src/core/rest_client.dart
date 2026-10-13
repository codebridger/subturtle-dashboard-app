import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_exception.dart';

/// Where the API lives. Dev is the default; pass the prod URL for a release build.
///
/// These are the Cloud Run URLs the web dashboards call. The dashboard domains
/// also forward API paths, but Firebase Hosting cuts those requests at 60 s, so
/// the mobile app talks to Cloud Run directly, like the web app does.
abstract final class ApiEnvironment {
  static const dev = 'https://subturtle-api-466506592387.europe-west4.run.app';
  static const prod = 'https://subturtle-api-245138511605.europe-west4.run.app';

  /// The web dashboards, for links that open the browser ("Manage", "More on the web").
  static const devDashboard = 'https://dev.dashboard.subturtle.app';
  static const prodDashboard = 'https://dashboard.subturtle.app';
}

/// Low-level HTTP client: a Dart port of the `HTTPClient` in `@modular-rest/client`.
///
/// Same protocol as the web:
/// - the base URL and the path are joined with exactly one `/`;
/// - the token goes in the `authorization` header as the raw JWT (no `Bearer`);
/// - bodies are JSON;
/// - any non-2xx answer becomes an [ApiException] carrying the server's message.
class RestClient {
  RestClient({required this.baseUrl, http.Client? httpClient, this.timeout = const Duration(seconds: 45)}) : _http = httpClient ?? http.Client();

  final String baseUrl;
  final Duration timeout;
  final http.Client _http;

  /// The current JWT. Set by the auth service after sign in.
  String? token;

  /// Called when a request that carried a token comes back 401 or 412: the
  /// token is no longer valid. The app signs the user out (same rule as the web).
  void Function(ApiException error)? onUnauthorized;

  /// Joins like `@modular-rest/client`'s `helper/url.join`.
  Uri url(String path, [Map<String, String>? query]) {
    if (path.startsWith('http')) return Uri.parse(path).replace(queryParameters: query);
    final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final p = path.startsWith('/') ? path.substring(1) : path;
    final u = Uri.parse('$base/$p');
    return query == null || query.isEmpty ? u : u.replace(queryParameters: query);
  }

  Map<String, String> _headers({bool json = true}) => {
        if (json) 'content-type': 'application/json',
        'accept': 'application/json',
        if (token != null && token!.isNotEmpty) 'authorization': token!,
      };

  /// POST a JSON body and return the decoded JSON answer.
  Future<dynamic> post(String path, [Object? body]) {
    return _send(() => _http.post(url(path), headers: _headers(), body: jsonEncode(body ?? const {})));
  }

  /// GET and return the decoded JSON answer.
  Future<dynamic> get(String path, {Map<String, String>? query}) {
    return _send(() => _http.get(url(path, query), headers: _headers(json: false)));
  }

  Future<dynamic> _send(Future<http.Response> Function() request) async {
    final sentToken = token != null && token!.isNotEmpty;
    http.Response res;
    try {
      res = await request().timeout(timeout);
    } on TimeoutException {
      throw ApiException.network('The request took too long.');
    } on http.ClientException catch (e) {
      throw ApiException.network(e.message);
    } catch (e) {
      // SocketException and friends (dart:io is not imported so the package stays pure Dart).
      throw ApiException.network(e.toString());
    }

    final body = _decode(res);
    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    final error = ApiException(_messageOf(body, res), statusCode: res.statusCode);
    if (sentToken && error.isAuthError) onUnauthorized?.call(error);
    throw error;
  }

  static dynamic _decode(http.Response res) {
    final text = utf8.decode(res.bodyBytes, allowMalformed: true);
    if (text.isEmpty) return null;
    try {
      return jsonDecode(text);
    } on FormatException {
      return text;
    }
  }

  /// Pulls a readable message out of the many error shapes the server uses.
  static String _messageOf(dynamic body, http.Response res) {
    if (body is String && body.trim().isNotEmpty) {
      // `ctx.throw(412, JSON.stringify(reply))` arrives as text that is itself JSON.
      try {
        return _messageOf(jsonDecode(body), res);
      } on FormatException {
        return body.trim();
      }
    }
    if (body is Map) {
      for (final key in ['message', 'error', 'e']) {
        final v = body[key];
        if (v is String && v.isNotEmpty) return v;
        if (v is Map && v['message'] is String) return v['message'] as String;
        if (v != null && v is! String) return jsonEncode(v);
      }
      if (body['status'] == 'fail') return 'The request failed.';
    }
    return res.reasonPhrase ?? 'Request failed (${res.statusCode}).';
  }

  void close() => _http.close();
}
