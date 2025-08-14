import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { z } from 'zod';

const Body = z.object({
  warehouse: z.string(),
  shipment_date: z.string(), // 'YYYY-MM-DD'
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());

    const { data, error } = await supabaseServer
      .rpc('create_shipment', { p_warehouse: body.warehouse, p_shipment_date: body.shipment_date });

    if (error) throw error;

    const [row] = data as { shipment_id: string; number_in_day: number }[];
    const number = (row.number_in_day ?? 1).toString().padStart(3, '0');

    return NextResponse.json({
      shipment_id: row.shipment_id,
      number_in_day: row.number_in_day,
      human_number: `${body.warehouse}-${body.shipment_date}-${number}`
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'create_shipment failed' }, { status: 400 });
  }
}