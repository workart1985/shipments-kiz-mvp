import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const { data, error } = await supabaseServer
    .from('shipments')
    .select('shipment_id, warehouse, shipment_date, delivery_date, number_in_day, status')
    .order('shipment_date', { ascending: false })
    .order('number_in_day', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []).map((s) => ({
    shipment_id: s.shipment_id,
    warehouse: s.warehouse,
    shipment_date: s.shipment_date,
    delivery_date: s.delivery_date,
    number_in_day: s.number_in_day,
    status: s.status,
    label: `${s.warehouse}-${s.shipment_date}-${String(s.number_in_day).padStart(3,'0')}`,
  }));

  return NextResponse.json(rows);
}
