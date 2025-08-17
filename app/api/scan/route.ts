import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type ScanBody = {
  shipment_id: string;
  box_id: string | null;
  barcode: string;
  wb_code?: string | null;
  supplier_code?: string | null;
  size?: string | null;
  with_kiz: boolean;
  kiz_code?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ScanBody;

    if (!body.shipment_id || !body.barcode) {
      return NextResponse.json({ error: 'shipment_id и barcode обязательны' }, { status: 400 });
    }

    let { shipment_id, box_id, barcode, wb_code, supplier_code, size, with_kiz, kiz_code } = body;

    // --- Автоподстановка из WB-таблиц, если каких-то полей нет ---
    if (!wb_code || !supplier_code || !size) {
      // 1) sku -> chrtid
      const { data: skuRow } = await supabase
        .from('wb_size_skus')
        .select('chrtid')
        .eq('sku', barcode)
        .maybeSingle();

      if (skuRow?.chrtid != null) {
        // 2) chrtid -> techsize, nmid
        const { data: sizeRow } = await supabase
          .from('wb_sizes')
          .select('techsize, nmid')
          .eq('chrtid', skuRow.chrtid)
          .maybeSingle();

        if (sizeRow) {
          size = size ?? (sizeRow.techsize ?? null);
          wb_code = wb_code ?? (sizeRow.nmid != null ? String(sizeRow.nmid) : null);

          // 3) nmid -> vendorcode
          if (sizeRow.nmid != null && !supplier_code) {
            const { data: cardRow } = await supabase
              .from('wb_cards')
              .select('vendorcode')
              .eq('nmid', sizeRow.nmid)
              .maybeSingle();
            supplier_code = supplier_code ?? (cardRow?.vendorcode ?? null);
          }
        }
      }
    }

    // --- Вызов RPC: имена аргументов ДОЛЖНЫ совпадать с именами в БД (p_...) ---
    const { data, error } = await supabase.rpc('scan_kiz', {
      p_shipment_id: shipment_id,
      p_box_id: box_id,
      p_barcode: barcode,
      p_wb_code: wb_code ?? null,
      p_supplier_code: supplier_code ?? null,
      p_size: size ?? null,
      p_with_kiz: with_kiz,
      p_kiz_code: with_kiz ? (kiz_code ?? null) : null
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Функция в БД возвращает uuid вставленной строки
    return NextResponse.json({ ok: true, id: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'scan failed' }, { status: 500 });
  }
}
