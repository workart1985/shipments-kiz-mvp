import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { z } from 'zod';

const Body = z.object({ shipment_id: z.string().uuid() });

export async function POST(req: Request) {
  try {
    const { shipment_id } = Body.parse(await req.json());

    const { data, error } = await supabaseServer
      .rpc('create_box', { p_shipment_id: shipment_id });

    if (error) throw error;

    const [row] = data as { box_id: string; ordinal: number; label: string }[];
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'create_box failed' }, { status: 400 });
  }
}