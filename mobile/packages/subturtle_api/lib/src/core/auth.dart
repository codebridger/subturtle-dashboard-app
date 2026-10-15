import 'dart:convert';

import 'api_exception.dart';
import 'rest_client.dart';

/// The signed-in user, as `POST /verify/token` returns it.
class AuthUser {
  const AuthUser({required this.id, this.email, this.type = 'user', this.permissionGroup});

  final String id;
  final String? email;

  /// `user` or `anonymous`.
  final String type;
  final String? permissionGroup;

  bool get isAnonymous => type == 'anonymous';

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    final group = json['permissionGroup'];
    return AuthUser(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      email: json['email'] as String?,
      type: (json['type'] as String?) ?? 'user',
      permissionGroup: group is Map ? group['title'] as String? : group?.toString(),
    );
  }
}

/// Where the token is kept between app starts. The app uses secure storage;
/// tests use [MemoryTokenStore].
abstract interface class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this._token]);
  String? _token;
  @override
  Future<String?> read() async => _token;
  @override
  Future<void> write(String token) async => _token = token;
  @override
  Future<void> clear() async => _token = null;
}

/// Sign in, sign out and token checks. A port of `AuthService` in
/// `@modular-rest/client`, plus the Google access-token route from `auth/router.ts`.
///
/// Sign-in paths the backend has today:
/// - Google: `GET /auth/google/access-token-login?access_token=…`. The server only
///   accepts tokens issued to its own OAuth client ids (web + `GOOGLE_OAUTH_CLIENT_ID_EXTENSION`).
/// - Email and password: `POST /user/login`.
/// - New account with a code: `/user/register_id` → `/user/validateCode` → `/user/submit_password`.
///   In production the code is random and never sent anywhere, so this only works
///   against a local or test server (code `123456`).
class AuthService {
  AuthService(this._client, this._store);

  final RestClient _client;
  final TokenStore _store;

  AuthUser? _user;
  AuthUser? get user => _user;
  String? get token => _client.token;
  bool get isSignedIn => _user != null && !_user!.isAnonymous;

  /// Restores the last session. Returns null when there is none or it is no longer valid.
  Future<AuthUser?> restore() async {
    final saved = await _store.read();
    if (saved == null || saved.isEmpty) return null;
    try {
      return await signInWithToken(saved);
    } on ApiException catch (e) {
      if (e.isNetwork) {
        // Offline at start: trust the saved token for now; the next call will check it.
        _client.token = saved;
        final id = userIdFromToken(saved);
        if (id == null) return null;
        return _user = AuthUser(id: id);
      }
      await signOut();
      return null;
    }
  }

  /// Checks [token] with the server, then keeps it.
  Future<AuthUser> signInWithToken(String token) async {
    final user = await validateToken(token);
    _client.token = token;
    _user = user;
    await _store.write(token);
    return user;
  }

  Future<AuthUser> validateToken(String token) async {
    final body = await _client.post('verify/token', {'token': token});
    final u = body is Map ? body['user'] : null;
    if (u is! Map) throw ApiException('The sign-in token is not valid.', statusCode: 412);
    return AuthUser.fromJson(Map<String, dynamic>.from(u));
  }

  /// Email and password (`POST /user/login`).
  Future<AuthUser> signInWithPassword({required String email, required String password}) async {
    final body = await _client.post('/user/login', {'idType': 'email', 'id': email.trim(), 'password': password});
    return signInWithToken(_tokenOf(body));
  }

  /// Google: exchange a Google OAuth access token for a Subturtle token.
  Future<AuthUser> signInWithGoogleAccessToken(String accessToken) async {
    final body = await _client.get('/auth/google/access-token-login', query: {'access_token': accessToken});
    return signInWithToken(_tokenOf(body));
  }

  /// Sign in with Apple: sends Apple's identity token (a JWT the server checks
  /// against Apple's keys). [fullName] is only given by Apple the first time.
  Future<AuthUser> signInWithAppleIdentityToken(String identityToken, {String? fullName}) async {
    final body = await _client.post('/auth/apple/identity-token-login', {
      'identityToken': identityToken,
      if (fullName != null && fullName.trim().isNotEmpty) 'fullName': fullName.trim(),
    });
    return signInWithToken(_tokenOf(body));
  }

  /// Step 1 of a new account: ask the server to create a code for [email].
  Future<void> registerEmail(String email) => _client.post('/user/register_id', {'idType': 'email', 'id': email.trim()});

  /// Step 2: check the code.
  Future<bool> validateCode({required String email, required String code}) async {
    final body = await _client.post('/user/validateCode', {'id': email.trim(), 'code': code.trim()});
    return body is Map && body['isValid'] == true;
  }

  /// Step 3: set the password with the code, then sign in.
  Future<AuthUser> submitPassword({required String email, required String code, required String password}) async {
    await _client.post('/user/submit_password', {'id': email.trim(), 'password': password, 'code': code.trim()});
    return signInWithPassword(email: email, password: password);
  }

  /// An anonymous token, for the few public functions (plans, voices).
  Future<String> anonymousToken() async {
    final body = await _client.get('/user/loginAnonymous');
    return _tokenOf(body);
  }

  Future<void> signOut() async {
    _user = null;
    _client.token = null;
    await _store.clear();
  }

  static String _tokenOf(dynamic body) {
    final t = body is Map ? body['token'] : null;
    if (t is! String || t.isEmpty) throw ApiException('The server did not return a sign-in token.');
    return t;
  }

  /// Reads the user id from a modular-rest JWT without checking the signature
  /// (the server checks it on every call). Returns null for a malformed token.
  static String? userIdFromToken(String token) {
    final parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final claims = jsonDecode(payload);
      final id = claims is Map ? claims['id'] : null;
      return id?.toString();
    } catch (_) {
      return null;
    }
  }
}
