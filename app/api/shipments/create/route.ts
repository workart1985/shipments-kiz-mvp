import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { z } from 'zod';

const Body = z.object({
  warehouse: z.string().min(1),
  shipment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function pad3(n: number) { return String(n).padStart(3, '0'); }

export async function POST(req: Request) {
  try {
    const { warehouse, shipment_date } = Body.parse(await req.json());
    const { data, error } = await supabaseServer
      .rpc('create_shipment', { p_warehouse: warehouse, p_shipment_date: shipment_date });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const row = Array.isArray(data) ? data[0] : data;
    const human_number = `${warehouse}-${shipment_date}-${pad3(row.number_in_day)}`;
    return NextResponse.json({
      shipment_id: row.shipment_id,
      number_in_day: row.number_in_day,
      human_number,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'invalid request' }, { status: 400 });
  }
}
