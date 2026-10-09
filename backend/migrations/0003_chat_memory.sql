-- Long-term memory: older messages are folded into an AI-written summary.
ALTER TABLE chats
    ADD COLUMN summary TEXT,
    -- created_at of the newest message already folded into `summary`.
    ADD COLUMN summarized_until TIMESTAMPTZ;
