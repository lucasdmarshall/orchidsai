CREATE TABLE tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    color       TEXT NOT NULL DEFAULT '#a3e635',
    type        TEXT NOT NULL DEFAULT 'genre',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE characters (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    title             TEXT NOT NULL DEFAULT '',
    greeting          TEXT NOT NULL DEFAULT '',
    personality       TEXT NOT NULL DEFAULT '',
    scenario          TEXT NOT NULL DEFAULT '',
    example_dialogue  TEXT NOT NULL DEFAULT '',
    avatar_url        TEXT NOT NULL DEFAULT '',
    content_rating    TEXT NOT NULL DEFAULT 'sfw' CHECK (content_rating IN ('sfw', 'nsfw')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX characters_created_at_idx ON characters (created_at DESC);

CREATE TABLE character_tags (
    character_id  UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    tag_id        UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (character_id, tag_id)
);
CREATE INDEX character_tags_tag_idx ON character_tags (tag_id);

CREATE TABLE personas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    personality  TEXT NOT NULL DEFAULT '',
    is_default   BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- At most one default persona.
CREATE UNIQUE INDEX personas_one_default_idx ON personas (is_default) WHERE is_default;

CREATE TABLE chats (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id  UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    persona_id    UUID REFERENCES personas(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chats_character_idx ON chats (character_id, updated_at DESC);
CREATE INDEX chats_updated_at_idx ON chats (updated_at DESC);

CREATE TABLE messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id     UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    thinking    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_chat_idx ON messages (chat_id, created_at);

-- Single-row app settings. NULL fields mean "use the frontend defaults".
CREATE TABLE settings (
    id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    sfw_system_prompt   TEXT,
    nsfw_system_prompt  TEXT,
    max_tokens          INTEGER,
    models              JSONB,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tags (name, slug, color, type) VALUES
    ('Fantasy',       'fantasy',       '#a78bfa', 'genre'),
    ('Romance',       'romance',       '#f472b6', 'genre'),
    ('Adventure',     'adventure',     '#fb923c', 'genre'),
    ('Sci-Fi',        'sci-fi',        '#38bdf8', 'genre'),
    ('Horror',        'horror',        '#ef4444', 'genre'),
    ('Mystery',       'mystery',       '#818cf8', 'genre'),
    ('Comedy',        'comedy',        '#facc15', 'genre'),
    ('Drama',         'drama',         '#c084fc', 'genre'),
    ('Slice of Life', 'slice-of-life', '#4ade80', 'genre'),
    ('Action',        'action',        '#f97316', 'genre'),
    ('Anime',         'anime',         '#fb7185', 'style'),
    ('Game',          'game',          '#22d3ee', 'style'),
    ('Historical',    'historical',    '#d6a76c', 'style'),
    ('Original',      'original',      '#a3e635', 'style'),
    ('Male',          'male',          '#60a5fa', 'gender'),
    ('Female',        'female',        '#f9a8d4', 'gender'),
    ('Non-binary',    'non-binary',    '#fde047', 'gender'),
    ('Helper',        'helper',        '#34d399', 'personality'),
    ('Villain',       'villain',       '#dc2626', 'personality'),
    ('Yandere',       'yandere',       '#e11d48', 'personality'),
    ('Tsundere',      'tsundere',      '#f59e0b', 'personality');
