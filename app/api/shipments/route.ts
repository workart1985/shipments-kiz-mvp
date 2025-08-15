import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

function pad3(n: number) { return String(n).padStart(3, '0'); }

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouse = searchParams.get('warehouse') || '';
    const date = searchParams.get('date') || '';

    if (!warehouse || !date) return NextResponse.json([]);

    const { data, error } = await supabaseServer
      .from('shipments')
      .select('shipment_id, number_in_day, status, delivery_date')
      .eq('warehouse', warehouse)
      .eq('shipment_date', date)
      .order('number_in_day', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const mapped = (data ?? []).map((s: any) => ({
      shipment_id: s.shipment_id,
      number_in_day: s.number_in_day,
      status: s.status,
      delivery_date: s.delivery_date,
      label: `${warehouse}-${date}-${pad3(s.number_in_day)}${s.delivery_date ? ` (отгр. ${s.delivery_date})` : ''}`,
    }));
    return NextResponse.json(mapped);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'unexpected' }, { status: 400 });
  }
}
