-- v_listing с полем thumb_url (первая доступная c246x328 для nmid)
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
  sk.created_at,
  p.c246x328 as thumb_url
from shipment_kiz sk
left join wb_size_skus s   on s.sku    = sk.barcode
left join wb_sizes     sz  on sz.chrtid = s.chrtid
left join lateral (
  select ph.c246x328
  from wb_photos ph
  where ph.nmid = sz.nmid and ph.c246x328 is not null
  order by ph.id asc
  limit 1
) p on true;
