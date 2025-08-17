import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

type Row = {
  shipment_id: string;
  barcode: string;
  wb_code: string | null;
  supplier_code: string | null;
  size: string | null;
  thumb_url: string | null;
  created_at: string;
};

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const shipment_id = ctx.params.id;

  const { data, error } = await supabaseServer
    .from('v_listing')
    .select('shipment_id, barcode, wb_code, supplier_code, size, thumb_url, created_at')
    .eq('shipment_id', shipment_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const map = new Map<string, {
    shipment_id: string;
    barcode: string;
    wb_code: string | null;
    supplier_code: string | null;
    size: string | null;
    thumb_url: string | null;
    qty: number;
  }>();

  for (const r of (data as Row[])) {
    const key = [r.barcode, r.wb_code ?? '', r.supplier_code ?? '', r.size ?? ''].join('|');
    const cur = map.get(key);
    if (cur) {
      cur.qty += 1;
      if (!cur.thumb_url && r.thumb_url) cur.thumb_url = r.thumb_url;
    } else {
      map.set(key, {
        shipment_id,
        barcode: r.barcode,
        wb_code: r.wb_code ?? null,
        supplier_code: r.supplier_code ?? null,
        size: r.size ?? null,
        thumb_url: r.thumb_url ?? null,
        qty: 1
      });
    }
  }

  return NextResponse.json(Array.from(map.values()));
}
