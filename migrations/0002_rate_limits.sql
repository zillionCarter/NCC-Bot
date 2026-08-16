CREATE TABLE rate_limits (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
