import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const warehouse = searchParams.get('warehouse');
  const date = searchParams.get('date');

  if (!warehouse || !date) {
    return NextResponse.json({ error: 'warehouse & date required' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from('shipments')
    .select('*')
    .eq('warehouse', warehouse)
    .eq('shipment_date', date)
    .order('number_in_day', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const mapped = (data ?? []).map((s: any) => {
    const n = String(s.number_in_day).padStart(3,'0');
    const dd = s.delivery_date ?? '—';
    return {
      shipment_id: s.shipment_id,
      number_in_day: s.number_in_day,
      status: s.status,
      delivery_date: s.delivery_date,
      // Формат: Склад-<дата поставки>-<дата отгрузки>-NNN
      label: `${warehouse}-${date}-${dd}-${n}`,
    };
  });

  return NextResponse.json(mapped);
}
