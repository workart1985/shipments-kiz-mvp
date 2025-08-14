import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shipment_id = searchParams.get('shipment_id');

  if (!shipment_id) {
    return NextResponse.json({ error: 'shipment_id required' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from('boxes')
    .select('box_id, ordinal, label')
    .eq('shipment_id', shipment_id)
    .order('ordinal', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}
