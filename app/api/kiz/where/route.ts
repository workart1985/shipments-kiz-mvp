import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kiz = searchParams.get('kiz_code');
  if (!kiz) return NextResponse.json({ error: 'kiz_code required' }, { status: 400 });

  // 1) Находим последнее упоминание этого KIZ в журнале строк
  const { data: rows, error: e1 } = await supabaseServer
    .from('shipment_kiz')
    .select('shipment_id, box_id, created_at')
    .eq('kiz_code', kiz)
    .order('created_at', { ascending: false })
    .limit(1);

  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });
  if (!rows || rows.length === 0) {
    // KIZ в журнале не найден — возможно, assigned в таблице kiz, но без строки
    // Вернём 404, UI покажет «найти не удалось»
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const row = rows[0] as { shipment_id: string; box_id: string | null; created_at: string };

  // 2) Подтягиваем метаданные поставки
  const { data: ship, error: e2 } = await supabaseServer
    .from('shipments')
    .select('shipment_id, warehouse, shipment_date, number_in_day')
    .eq('shipment_id', row.shipment_id)
    .single();

  if (e2 || !ship) return NextResponse.json({ error: e2?.message || 'shipment not found' }, { status: 400 });

  // 3) Короб (если есть)
  let boxLabel = 'без короба';
  if (row.box_id) {
    const { data: box, error: e3 } = await supabaseServer
      .from('boxes')
      .select('box_id, ordinal')
      .eq('box_id', row.box_id)
      .single();
    if (e3) {
      // не критично
    } else if (box) {
      boxLabel = `Короб ${box.ordinal}`;
    }
  }

  const n = String(ship.number_in_day).padStart(3, '0');
  const shipmentLabel = `${ship.warehouse}-${ship.shipment_date}-${n}`;

  return NextResponse.json({
    kiz_code: kiz,
    shipment_id: ship.shipment_id,
    shipment_label: shipmentLabel,
    box_id: row.box_id,
    box_label: boxLabel,
    last_seen_at: row.created_at,
  });
}
