import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const shipment_id = ctx.params.id;
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const limit = Math.max(1, Math.min(Number(limitParam || '200'), 2000)); // 1..2000, default 200

  const { data, error } = await supabaseServer
    .from('v_listing')
    .select('*')
    .eq('shipment_id', shipment_id)                 // только эта поставка
    .order('created_at', { ascending: false })      // последние сверху
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
