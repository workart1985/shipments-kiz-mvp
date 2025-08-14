import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { z } from 'zod';

const Body = z.object({
  shipment_id: z.string().uuid(),
  box_id: z.string().uuid(),
  barcode: z.string().min(1),
  wb_code: z.string().optional().nullable(),
  supplier_code: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  with_kiz: z.boolean(),
  kiz_code: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const payload = Body.parse(await req.json());

    if (payload.with_kiz && !payload.kiz_code) {
      return NextResponse.json({ error: 'Заполните КИЗ' }, { status: 400 });
    }

    const { data, error } = await supabaseServer.rpc('scan_kiz', {
      p_shipment_id: payload.shipment_id,
      p_box_id: payload.box_id,
      p_barcode: payload.barcode,
      p_wb_code: payload.wb_code ?? null,
      p_supplier_code: payload.supplier_code ?? null,
      p_size: payload.size ?? null,
      p_with_kiz: payload.with_kiz,
      p_kiz_code: payload.kiz_code ?? null
    });

    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('KIZ_ALREADY_USED')) {
        return NextResponse.json({ error: 'КИЗ уже был отсканирован в другой отгрузке' }, { status: 409 });
      }
      if (msg.includes('KIZ_DUP_IN_SHIPMENT')) {
        return NextResponse.json({ error: 'КИЗ уже есть в этой поставке' }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ id: data as string });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'scan failed' }, { status: 400 });
  }
}