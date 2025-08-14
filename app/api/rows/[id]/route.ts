import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function DELETE(_: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    const { error } = await supabaseServer.rpc('delete_row', { p_row_id: id });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'delete failed' }, { status: 400 });
  }
}