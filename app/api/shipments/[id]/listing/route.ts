import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const shipment_id = ctx.params.id;
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const boxId = searchParams.get('box_id');
  const limit = Math.max(1, Math.min(Number(limitParam || '200'), 2000)); // 1..2000, default 200

  let q = supabaseServer
    .from('v_listing')
    .select('*')
    .eq('shipment_id', shipment_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (boxId) {
    q = q.eq('box_id', boxId);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}
