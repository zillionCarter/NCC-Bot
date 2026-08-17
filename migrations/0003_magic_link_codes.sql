-- Adds a typed 6-digit alternative to clicking the magic link, so a second device
-- can be signed in without opening email on it.
--
-- `attempts` is the brute-force guard: a 6-digit code is only 10^6 wide, so each
-- wrong guess burns an attempt against every live link for that address and the
-- code stops being accepted once the allowance is gone.
ALTER TABLE magic_links ADD COLUMN code TEXT;
ALTER TABLE magic_links ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_magic_links_email_code ON magic_links(email, code);
