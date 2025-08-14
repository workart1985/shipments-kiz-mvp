import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const box_id = ctx.params.id;
  const { data, error } = await supabaseServer
    .from('v_box_summary')
    .select('*')
    .eq('box_id', box_id)
    .order('barcode', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}