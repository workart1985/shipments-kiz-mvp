-- master.sql — полное начальное развёртывание БД для "Отгрузки + КИЗ" (MVP)
-- Совместимо с Supabase. Запускать целиком в SQL Editor.

-- 0) Расширения
create extension if not exists "pgcrypto";

-- 1) Справочники (на будущее)
create table if not exists items (
  sku text primary key,
  name text,
  gtin text,
  size text,
  color text
);

-- 2) Поставки
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
                 where t.typname='warehouse_enum') then
    create type warehouse_enum as enum ('Черновик','Коледино','Тула','Электросталь','Казань','Сарапул');
  end if;
end$$;

create table if not exists shipments (
  shipment_id uuid primary key default gen_random_uuid(),
  warehouse warehouse_enum not null,
  shipment_date date not null,         -- Дата поставки
  delivery_date date,                  -- Дата отгрузки (информационно)
  number_in_day integer not null,      -- 1,2,3... для нумерации в пределах склада+даты
  status text not null default 'draft' -- draft|ready|shipped
);

create unique index if not exists ux_ship_per_day
  on shipments (warehouse, shipment_date, number_in_day);

-- 3) Короба
create table if not exists boxes (
  box_id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(shipment_id) on delete cascade,
  ordinal integer not null,           -- 1,2,3...
  label text not null                 -- "Короб 1" — присваиваем в функции create_box
);
create unique index if not exists ux_box_per_shipment on boxes (shipment_id, ordinal);

-- 4) КИЗ (код прослеживаемости)
create table if not exists kiz (
  kiz_code text primary key,
  gtin text,
  serial text,
  status text not null default 'free', -- free|assigned|shipped|returned
  last_shipment_id uuid references shipments(shipment_id),
  last_scan_at timestamptz
);

-- 5) Журнал сканирований
create table if not exists shipment_kiz (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(shipment_id) on delete cascade,
  box_id uuid references boxes(box_id) on delete set null,
  barcode text not null,
  wb_code text,
  supplier_code text,
  size text,
  kiz_code text references kiz(kiz_code),
  created_at timestamptz not null default now(),
  unique (shipment_id, kiz_code)
);

-- 6) Представления
create or replace view v_listing as
select
  sk.id,
  sk.shipment_id,
  sk.box_id,
  sk.barcode,
  sk.wb_code,
  sk.supplier_code,
  sk.size,
  sk.kiz_code,
  sk.created_at
from shipment_kiz sk;

create or replace view v_box_summary as
select
  sk.box_id,
  sk.barcode,
  coalesce(sk.wb_code, '') as wb_code,
  coalesce(sk.supplier_code, '') as supplier_code,
  coalesce(sk.size, '') as size,
  count(*)::int as qty
from shipment_kiz sk
group by sk.box_id, sk.barcode, coalesce(sk.wb_code,''), coalesce(sk.supplier_code,''), coalesce(sk.size,'');

-- 7) Функции

-- 7.1 create_shipment(warehouse, shipment_date)
create or replace function create_shipment(p_warehouse warehouse_enum, p_shipment_date date)
returns table (shipment_id uuid, number_in_day integer)
language plpgsql
as $$
declare
  max_num integer;
begin
  select coalesce(max(s.number_in_day),0) into max_num
  from shipments s
  where s.warehouse = p_warehouse and s.shipment_date = p_shipment_date;

  insert into shipments (warehouse, shipment_date, number_in_day)
  values (p_warehouse, p_shipment_date, max_num + 1)
  returning shipments.shipment_id, shipments.number_in_day
  into create_shipment.shipment_id, create_shipment.number_in_day;

  return;
end;
$$;

-- 7.2 create_box(shipment_id)
create or replace function create_box(p_shipment_id uuid)
returns table (box_id uuid, ordinal integer, label text)
language plpgsql
as $$
declare
  max_ord integer;
begin
  select coalesce(max(b.ordinal),0) into max_ord
  from boxes b
  where b.shipment_id = p_shipment_id;

  insert into boxes (shipment_id, ordinal, label)
  values (p_shipment_id, max_ord + 1, format('Короб %s', max_ord + 1))
  returning boxes.box_id, boxes.ordinal, boxes.label
  into create_box.box_id, create_box.ordinal, create_box.label;

  return;
end;
$$;

-- 7.3 scan_kiz(...)
create or replace function scan_kiz(
  p_shipment_id uuid,
  p_box_id uuid,
  p_barcode text,
  p_wb_code text,
  p_supplier_code text,
  p_size text,
  p_with_kiz boolean,
  p_kiz_code text
)
returns uuid
language plpgsql
as $$
declare
  row_id uuid;
  st text;
  last_sid uuid;
begin
  if p_with_kiz then
    -- вставим КИЗ при отсутствии
    insert into kiz (kiz_code, status)
    values (p_kiz_code, 'free')
    on conflict (kiz_code) do nothing;

    -- блокируем запись КИЗ
    select status, last_shipment_id
      into st, last_sid
    from kiz
    where kiz_code = p_kiz_code
    for update;

    if st in ('assigned','shipped') then
      raise exception 'КИЗ уже использован (поставка %)', last_sid using errcode='P0001';
    end if;

    insert into shipment_kiz (shipment_id, box_id, barcode, wb_code, supplier_code, size, kiz_code)
    values (p_shipment_id, p_box_id, p_barcode, p_wb_code, p_supplier_code, p_size, p_kiz_code)
    returning id into row_id;

    update kiz
      set status = 'assigned',
          last_shipment_id = p_shipment_id,
          last_scan_at = now()
    where kiz_code = p_kiz_code;

    return row_id;
  else
    insert into shipment_kiz (shipment_id, box_id, barcode, wb_code, supplier_code, size, kiz_code)
    values (p_shipment_id, p_box_id, p_barcode, p_wb_code, p_supplier_code, p_size, null)
    returning id into row_id;
    return row_id;
  end if;
end;
$$;

-- 7.4 delete_row(row_id)
create or replace function delete_row(p_row_id uuid)
returns void
language plpgsql
as $$
declare
  v_shipment uuid;
  v_kiz text;
  v_count int;
begin
  select shipment_id, kiz_code
    into v_shipment, v_kiz
  from shipment_kiz
  where id = p_row_id;

  -- удаляем саму строку
  delete from shipment_kiz where id = p_row_id;

  -- если в этой поставке больше нет строк с этим КИЗ — освобождаем его
  if v_kiz is not null then
    select count(*) into v_count
    from shipment_kiz
    where shipment_id = v_shipment and kiz_code = v_kiz;

    if v_count = 0 then
      update kiz
        set status = 'free',
            last_shipment_id = null
      where kiz_code = v_kiz;
    end if;
  end if;
end;
$$;

-- 7.5 finalize_shipment (на будущее)
create or replace function finalize_shipment(p_shipment_id uuid)
returns void
language plpgsql
as $$
begin
  update shipments set status='shipped' where shipment_id = p_shipment_id;

  update kiz
    set status='shipped'
  where last_shipment_id = p_shipment_id;
end;
$$;

-- 7.6 delete_shipment_cascade (с паролем)
-- Порядок: сначала журнал, потом коробки, потом kiz, потом shipment.
create or replace function delete_shipment_cascade(p_shipment_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_password <> '88889999' then
    raise exception 'FORBIDDEN: wrong password' using errcode = '28000';
  end if;

  -- 1) журнал сканирований
  delete from shipment_kiz where shipment_id = p_shipment_id;

  -- 2) короба
  delete from boxes where shipment_id = p_shipment_id;

  -- 3) kiz, у которых последняя привязка к этой поставке
  delete from kiz where last_shipment_id = p_shipment_id;

  -- 4) сама поставка
  delete from shipments where shipment_id = p_shipment_id;
end;
$$;

-- Готово
