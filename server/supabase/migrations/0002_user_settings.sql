create table if not exists user_settings (
  telegram_user_id bigint primary key,
  timezone text not null default 'Europe/Samara'
);
