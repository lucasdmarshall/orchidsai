-- Pool of OpenRouter API keys. Each chat request leases a random active key.
CREATE TABLE api_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider      TEXT NOT NULL DEFAULT 'openrouter',
    key           TEXT NOT NULL UNIQUE,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    usage_count   BIGINT NOT NULL DEFAULT 0,
    last_used_at  TIMESTAMPTZ,
    last_error    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
