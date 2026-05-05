# Auth Testing Playbook (Emergent Google Auth)

See full playbook from integration_playbook_expert_v2 (Emergent Auth).

## App-specific config
- Allowlist (admin only): `Mrxxdoxdoxx@gmail.com`
- Public reads: GET /api/works, /api/works/{id}/history, /api/history, /api/stats — no auth
- Protected mutations: PUT /api/works/{id}/status, POST /api/works/refresh — require admin session
- Sessions in MongoDB collection `user_sessions` with `expires_at` (7 days)
- Cookie: `session_token` httpOnly, secure, samesite=none, path=/

## Quick test (mongosh)
```
use('test_database');
var sessionToken = 'test_session_' + Date.now();
db.user_sessions.insertOne({
  user_id: 'admin-1', session_token: sessionToken,
  email: 'Mrxxdoxdoxx@gmail.com', is_admin: true,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print(sessionToken);
```
