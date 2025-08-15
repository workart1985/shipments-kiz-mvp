import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { z } from 'zod';

const PatchBody = z.object({
  delivery_date: z.string().nullable().optional(),
});

const DeleteBody = z.object({
  password: z.string(),
});

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const shipment_id = ctx.params.id;
    const { delivery_date } = PatchBody.parse(await req.json());
    const { error } = await supabaseServer
      .from('shipments')
      .update({ delivery_date: delivery_date ?? null })
      .eq('shipment_id', shipment_id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'update delivery_date failed' }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  try {
    const shipment_id = ctx.params.id;
    const { password } = DeleteBody.parse(await req.json());
    if (password !== '88889999') return NextResponse.json({ error: 'FORBIDDEN: wrong password' }, { status: 403 });

    // 1) заберём список kiz по этой поставке, чтобы потом освободить и удалить
    const { data: kizRows, error: kizSelErr } = await supabaseServer
      .from('shipment_kiz')
      .select('kiz_code')
      .eq('shipment_id', shipment_id)
      .not('kiz_code', 'is', null);
    if (kizSelErr) throw kizSelErr;
    const kizList: string[] = (kizRows ?? []).map((r: any) => r.kiz_code).filter(Boolean);

    // 2) журнал сканирований
    const { error: delListErr } = await supabaseServer.from('shipment_kiz').delete().eq('shipment_id', shipment_id);
    if (delListErr) throw delListErr;

    // 3) короба
    const { error: delBoxesErr } = await supabaseServer.from('boxes').delete().eq('shipment_id', shipment_id);
    if (delBoxesErr) throw delBoxesErr;

    // 4) освободим KIZ и удалим их записи
    if (kizList.length) {
      const { error: freeErr } = await supabaseServer
        .from('kiz')
        .update({ status: 'free', last_shipment_id: null })
        .in('kiz_code', kizList)
        .eq('last_shipment_id', shipment_id);
      if (freeErr) throw freeErr;

      const { error: delKizErr } = await supabaseServer.from('kiz').delete().in('kiz_code', kizList);
      if (delKizErr) throw delKizErr;
    }

    // 5) сама поставка
    const { error: delShipErr } = await supabaseServer.from('shipments').delete().eq('shipment_id', shipment_id);
    if (delShipErr) throw delShipErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'delete shipment failed' }, { status: 400 });
  }
}
