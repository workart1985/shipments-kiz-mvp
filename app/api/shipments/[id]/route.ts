import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// PATCH: delivery_date или status
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const shipment_id = ctx.params.id;
  const body = await req.json().catch(()=> ({}));
  const patch: any = {};
  if ('delivery_date' in body) patch.delivery_date = body.delivery_date;
  if ('status' in body) {
    const st = String(body.status);
    if (!['draft','ready','shipped'].includes(st)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    patch.status = st;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no fields' }, { status: 400 });
  }

  const { error } = await supabaseServer.from('shipments').update(patch).eq('shipment_id', shipment_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE: уже реализовано ранее (с паролем 88889999), оставляем как есть
export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const shipment_id = ctx.params.id;
  const { password } = await req.json().catch(()=>({}));
  if (password !== '88889999') return NextResponse.json({ error: 'Неверный пароль' }, { status: 403 });

  // Удаляем строки поставки, потом саму поставку и освобождаем KIZ
  const { error: e1 } = await supabaseServer.rpc('delete_shipment_cascade', { p_shipment_id: shipment_id });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
