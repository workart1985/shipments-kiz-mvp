import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const shipment_id = ctx.params.id;
  const { data, error } = await supabaseServer
    .from('v_listing')
    .select('*')
    .eq('shipment_id', shipment_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}