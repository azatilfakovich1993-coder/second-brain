-- Run this in the Supabase project's SQL editor once the project exists.
--
-- vector(384): dimension of Xenova/multilingual-e5-small (src/llm/embeddings.js) —
-- switched from GigaChat's embeddings API after it returned 402 Payment
-- Required on the free personal tier.

create extension if not exists vector;

create table if not exists notes (
  id bigint generated always as identity primary key,
  telegram_user_id bigint not null,
  text text not null,
  type text not null check (type in ('task', 'idea', 'note')),
  embedding vector(384),
  due_at timestamptz,
  status text not null default 'pending', -- pending | sent | done
  created_at timestamptz not null default now()
);

create index if not exists notes_user_idx on notes (telegram_user_id);
create index if not exists notes_due_idx on notes (due_at) where status = 'pending';
create index if not exists notes_embedding_idx on notes using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function match_notes(query_embedding vector(384), match_user_id bigint, match_count int default 5)
returns table (id bigint, text text, type text, similarity float)
language sql stable
as $$
  select id, text, type, 1 - (embedding <=> query_embedding) as similarity
  from notes
  where telegram_user_id = match_user_id and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
