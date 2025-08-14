import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { z } from 'zod';

const Body = z.object({
  delivery_date: z.string().nullable().optional(), // 'YYYY-MM-DD' | null
});

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const shipment_id = ctx.params.id;
    const { delivery_date } = Body.parse(await req.json());

    const { error } = await supabaseServer
      .from('shipments')
      .update({ delivery_date: delivery_date ?? null })
      .eq('shipment_id', shipment_id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'update delivery_date failed' }, { status: 400 });
  }
}
