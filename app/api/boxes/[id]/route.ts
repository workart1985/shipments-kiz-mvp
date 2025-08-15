import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { z } from 'zod';

const DeleteBody = z.object({
  password: z.string(),
});

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  try {
    const box_id = ctx.params.id;
    const { password } = DeleteBody.parse(await req.json());
    if (password !== '000') return NextResponse.json({ error: 'FORBIDDEN: wrong password' }, { status: 403 });

    // найдём shipment и kiz, которые были в этом коробе
    const { data: rows, error: selErr } = await supabaseServer
      .from('shipment_kiz')
      .select('shipment_id, kiz_code')
      .eq('box_id', box_id);
    if (selErr) throw selErr;

    const shipment_id = rows?.[0]?.shipment_id ?? null;
    const kizList = (rows ?? []).map((r: any) => r.kiz_code).filter(Boolean);

    // удалим строки журнала по коробу
    const { error: delListErr } = await supabaseServer.from('shipment_kiz').delete().eq('box_id', box_id);
    if (delListErr) throw delListErr;

    // освободим kiz, которые после удаления больше не встречаются в этой поставке
    if (shipment_id && kizList.length) {
      // проверим какие kiz ещё остались в этой поставке
      const { data: still, error: stillErr } = await supabaseServer
        .from('shipment_kiz')
        .select('kiz_code')
        .eq('shipment_id', shipment_id)
        .not('kiz_code', 'is', null);
      if (stillErr) throw stillErr;
      const stillSet = new Set((still ?? []).map((r: any) => r.kiz_code));

      const toFree = kizList.filter(k => !stillSet.has(k));
      if (toFree.length) {
        const { error: freeErr } = await supabaseServer
          .from('kiz')
          .update({ status: 'free', last_shipment_id: null })
          .in('kiz_code', toFree)
          .eq('last_shipment_id', shipment_id);
        if (freeErr) throw freeErr;
      }
    }

    // удалим сам короб
    const { error: delBoxErr } = await supabaseServer.from('boxes').delete().eq('box_id', box_id);
    if (delBoxErr) throw delBoxErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'delete box failed' }, { status: 400 });
  }
}
