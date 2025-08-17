-- === delete_shipment_cascade(uuid) ==========================================
-- Безопасное удаление поставки:
-- - освобождает связанные KIZ (если они "назначены" на эту поставку)
-- - удаляет строки shipment_kiz и boxes этой поставки
-- - удаляет саму запись shipments
-- Все операции в одной транзакции.
create or replace function public.delete_shipment_cascade(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Освободить KIZ, у которых last_shipment_id = текущая поставка
  --    (то есть они ещё не "shipped")
  update public.kiz k
     set status = 'free',
         last_shipment_id = null
   where k.last_shipment_id = p_shipment_id
     and k.status in ('free','assigned');

  -- 2) Удалить строки журнала по этой поставке
  delete from public.shipment_kiz sk
   where sk.shipment_id = p_shipment_id;

  -- 3) Удалить короба этой поставки
  delete from public.boxes b
   where b.shipment_id = p_shipment_id;

  -- 4) Удалить саму поставку
  delete from public.shipments s
   where s.shipment_id = p_shipment_id;

  -- Готово
end;
$$;

-- по желанию можно разрешить исполнение функции роли anon/ authenticated,
-- но в нашем приложении вызывает Service Role ключ (сервер), так что не требуется.
-- grant execute on function public.delete_shipment_cascade(uuid) to anon, authenticated;
