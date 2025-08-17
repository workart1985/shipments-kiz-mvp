import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

type Row = {
  box_id: string | null;
  barcode: string;
  wb_code: string | null;
  supplier_code: string | null;
  size: string | null;
  thumb_url: string | null;
  created_at: string;
};

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const box_id = ctx.params.id;

  const { data, error } = await supabaseServer
    .from('v_listing')
    .select('box_id, barcode, wb_code, supplier_code, size, thumb_url, created_at')
    .eq('box_id', box_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Группируем без KIZ: ключ = barcode|wb_code|supplier_code|size
  const map = new Map<string, {
    box_id: string;
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
      // если у нас ещё нет thumb_url — подхватим
      if (!cur.thumb_url && r.thumb_url) cur.thumb_url = r.thumb_url;
    } else {
      map.set(key, {
        box_id: box_id,
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
