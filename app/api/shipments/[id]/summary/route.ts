import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const shipment_id = ctx.params.id;

  const { data, error } = await supabaseServer
    .from('shipment_kiz')
    .select('barcode, wb_code, supplier_code, size')
    .eq('shipment_id', shipment_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const map = new Map<string, { barcode: string; wb_code: string | null; supplier_code: string | null; size: string | null; qty: number }>();
  for (const r of (data as any[])) {
    const key = [r.barcode, r.wb_code ?? '', r.supplier_code ?? '', r.size ?? ''].join('|');
    const cur = map.get(key);
    if (cur) cur.qty += 1;
    else map.set(key, { barcode: r.barcode, wb_code: r.wb_code, supplier_code: r.supplier_code, size: r.size, qty: 1 });
  }

  return NextResponse.json(Array.from(map.values()));
}
