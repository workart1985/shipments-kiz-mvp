-- ===== 0. Extensions =====
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ===== 1. Tables =====

-- 1.1 shipments (create first)
create table if not exists shipments (
  shipment_id uuid primary key default gen_random_uuid(),
  warehouse text not null check (warehouse in ('Черновик','Коледино','Тула','Электросталь','Казань','Сарапул')),
  shipment_date date not null,
  delivery_date date,
  number_in_day integer not null,
  status text not null default 'draft'  -- draft|ready|shipped
);

create unique index if not exists ux_ship_per_day
  on shipments (warehouse, shipment_date, number_in_day);

-- 1.2 boxes (immutable generated column for label)
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_name = 'boxes'
  ) then
    create table boxes (
      box_id uuid primary key default gen_random_uuid(),
      shipment_id uuid not null references shipments(shipment_id) on delete cascade,
      ordinal integer not null,  -- 1,2,3...
      label text generated always as ('Короб ' || ordinal::text) stored
    );
    create unique index ux_box_per_shipment on boxes (shipment_id, ordinal);
  end if;
end$$;

-- 1.3 kiz
create table if not exists kiz (
  kiz_code text primary key,
  gtin text,
  serial text,
  status text not null default 'free', -- free|assigned|shipped|returned
  last_shipment_id uuid references shipments(shipment_id),
  last_scan_at timestamptz
);

-- 1.4 shipment_kiz
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

-- (Опционально) items — справочник на будущее
create table if not exists items (
  sku text primary key,
  name text,
  gtin text,
  size text,
  color text
);

-- ===== 2. Views =====
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
  sk.wb_code,
  sk.supplier_code,
  sk.size,
  sk.kiz_code,
  count(*) as qty
from shipment_kiz sk
group by sk.box_id, sk.barcode, sk.wb_code, sk.supplier_code, sk.size, sk.kiz_code;

-- ===== 3. Functions (ambiguous-safe) =====

-- 3.1 create_shipment
create or replace function create_shipment(p_warehouse text, p_shipment_date date)
returns table (shipment_id uuid, number_in_day integer)
language plpgsql
as $$
declare
  v_max int;
  v_ship uuid;
  v_num  int;
begin
  select coalesce(max(shipments.number_in_day), 0)
    into v_max
  from shipments
  where shipments.warehouse = p_warehouse
    and shipments.shipment_date = p_shipment_date;

  insert into shipments (warehouse, shipment_date, number_in_day, status)
  values (p_warehouse, p_shipment_date, v_max + 1, 'draft')
  returning shipments.shipment_id, shipments.number_in_day
    into v_ship, v_num;

  shipment_id   := v_ship;
  number_in_day := v_num;

  return next;
end;
$$;

-- 3.2 create_box
create or replace function create_box(p_shipment_id uuid)
returns table (box_id uuid, ordinal integer, label text)
language plpgsql
as $$
declare
  v_max_ord int;
  v_box uuid;
  v_ord int;
  v_label text;
begin
  select coalesce(max(boxes.ordinal), 0)
    into v_max_ord
  from boxes
  where boxes.shipment_id = p_shipment_id;

  insert into boxes (shipment_id, ordinal)
  values (p_shipment_id, v_max_ord + 1)
  returning boxes.box_id, boxes.ordinal, boxes.label
    into v_box, v_ord, v_label;

  box_id := v_box;
  ordinal := v_ord;
  label := v_label;

  return next;
end;
$$;

-- 3.3 scan_kiz
create or replace function scan_kiz(
  p_shipment_id uuid,
  p_box_id uuid,
  p_barcode text,
  p_wb_code text,
  p_supplier_code text,
  p_size text,
  p_with_kiz boolean,
  p_kiz_code text
) returns uuid language plpgsql as $$
declare
  r_id uuid;
  l_status text;
  l_last_shipment uuid;
begin
  if p_with_kiz then
    insert into kiz (kiz_code, status) values (p_kiz_code, 'free')
    on conflict (kiz_code) do nothing;

    select kiz.status, kiz.last_shipment_id
      into l_status, l_last_shipment
    from kiz
    where kiz.kiz_code = p_kiz_code
    for update;

    if l_status in ('assigned','shipped') then
      raise exception 'KIZ_ALREADY_USED: КИЗ уже привязан (последняя поставка %)', l_last_shipment
        using errcode = 'P0001';
    end if;
  end if;

  insert into shipment_kiz (shipment_id, box_id, barcode, wb_code, supplier_code, size, kiz_code)
  values (p_shipment_id, p_box_id, p_barcode, p_wb_code, p_supplier_code, p_size,
          case when p_with_kiz then p_kiz_code else null end)
  returning shipment_kiz.id into r_id;

  if p_with_kiz then
    update kiz
      set status='assigned', last_shipment_id = p_shipment_id, last_scan_at = now()
    where kiz.kiz_code = p_kiz_code;
  end if;

  return r_id;
exception
  when unique_violation then
    raise exception 'KIZ_DUP_IN_SHIPMENT: КИЗ уже есть в этой поставке' using errcode='P0001';
end;
$$;

-- 3.4 delete_row
create or replace function delete_row(p_row_id uuid)
returns void language plpgsql as $$
declare
  l_kiz text;
  l_shipment uuid;
  cnt int;
begin
  select sk.kiz_code, sk.shipment_id
    into l_kiz, l_shipment
  from shipment_kiz sk
  where sk.id = p_row_id;

  delete from shipment_kiz where id = p_row_id;

  if l_kiz is not null then
    select count(*) into cnt
    from shipment_kiz
    where shipment_id = l_shipment and kiz_code = l_kiz;

    if cnt = 0 then
      update kiz
        set status='free', last_shipment_id = null
      where kiz.kiz_code = l_kiz and kiz.last_shipment_id = l_shipment;
    end if;
  end if;
end;
$$;

-- 3.5 finalize_shipment (заготовка)
create or replace function finalize_shipment(p_shipment_id uuid)
returns void language plpgsql as $$
begin
  update shipments set status='shipped'
  where shipments.shipment_id = p_shipment_id;

  update kiz set status='shipped'
  where kiz.kiz_code in (
    select sk.kiz_code from shipment_kiz sk
    where sk.shipment_id = p_shipment_id and sk.kiz_code is not null
  );
end;
$$;
