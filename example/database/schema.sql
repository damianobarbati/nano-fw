create table if not exists users (
  id bigserial primary key,
  created_at timestamp default now(),
  name text not null,
  email text not null unique
);
