create table if not exists conversation_turns (
  id bigint generated always as identity primary key,
  telegram_user_id bigint not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists conversation_turns_user_idx on conversation_turns (telegram_user_id, created_at desc);
