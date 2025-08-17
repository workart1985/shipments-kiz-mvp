-- Полная схема хранения карточек WB (ответ /content/v2/get/cards/list)
-- ТАБЛИЦЫ ОЧИЩАЮТСЯ ПЕРЕД КАЖДЫМ ИМПОРТОМ (см. API-роут).
-- Порядок связей: wb_cards (1) -> photos/tags/characteristics/sizes (N) -> size_skus (N)

create table if not exists wb_cards (
  nmID           bigint primary key,
  imtID          bigint,
  nmUUID         text,
  subjectID      bigint,
  subjectName    text,
  vendorCode     text,
  brand          text,
  title          text,
  description    text,
  needKiz        boolean,
  video          text,
  createdAt      timestamptz,
  updatedAt      timestamptz,
  -- dimensions
  dim_length     integer,
  dim_width      integer,
  dim_height     integer,
  weightBrutto   numeric,
  dim_isValid    boolean
);

create table if not exists wb_photos (
  id bigserial primary key,
  nmID bigint references wb_cards(nmID) on delete cascade,
  big text,
  c246x328 text,
  c516x688 text,
  square text,
  tm text
);

create table if not exists wb_tags (
  id bigserial primary key,
  nmID bigint references wb_cards(nmID) on delete cascade,
  tag_id bigint,
  name text,
  color text
);

create table if not exists wb_characteristics (
  id bigserial primary key,
  nmID bigint references wb_cards(nmID) on delete cascade,
  char_id bigint,
  name text,
  value jsonb
);

create table if not exists wb_sizes (
  chrtID bigint primary key,
  nmID bigint references wb_cards(nmID) on delete cascade,
  techSize text
);

create table if not exists wb_size_skus (
  id bigserial primary key,
  chrtID bigint references wb_sizes(chrtID) on delete cascade,
  sku text
);

-- тех. таблица для отображения статуса синхронизации
create table if not exists wb_sync_meta (
  id boolean primary key default true, -- единственная строка (id=true)
  last_run_at timestamptz,
  last_updatedAt timestamptz,
  last_nmID bigint,
  last_total integer,
  last_count_cards integer,
  last_count_photos integer,
  last_count_sizes integer,
  last_count_skus integer,
  last_count_tags integer,
  last_count_chars integer
);
insert into wb_sync_meta(id) values(true) on conflict (id) do nothing;
