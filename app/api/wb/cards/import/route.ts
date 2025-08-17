import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type WBCard = {
  nmID: number | string | null;
  imtID?: number | string | null;
  nmUUID?: string | null;
  subjectID?: number | string | null;
  subjectName?: string | null;
  vendorCode?: string | null;
  brand?: string | null;
  title?: string | null;
  description?: string | null;
  needKiz?: boolean | null;
  photos?: Array<{ big?: string; c246x328?: string; c516x688?: string; square?: string; tm?: string }>;
  video?: string | null;
  dimensions?: { length?: number | string | null; width?: number | string | null; height?: number | string | null; weightBrutto?: number | string | null; isValid?: boolean | null };
  characteristics?: Array<{ id?: number | string | null; name?: string | null; value?: any }>;
  sizes?: Array<{ chrtID: number | string | null; techSize?: string | null; skus?: (string | number)[] | null }>;
  tags?: Array<{ id?: number | string | null; name?: string | null; color?: string | null }>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function safeParseJSON(text: string | null): any | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function asBigint(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}
const asNumber = asBigint;

function asISODate(s?: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** глубоко: 'null'/'undefined'/'' -> null; NaN -> null */
function deepSanitize(x: any): any {
  if (x === null || x === undefined) return null;
  if (typeof x === 'string') {
    const t = x.trim();
    if (t === '' || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return null;
    return x;
  }
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (Array.isArray(x)) return x.map(deepSanitize);
  if (typeof x === 'object') {
    const out: any = {};
    for (const k of Object.keys(x)) out[k] = deepSanitize(x[k]);
    return out;
  }
  return x;
}

async function wbFetchPage(token: string, cursor?: { updatedAt?: string; nmID?: number }, signal?: AbortSignal) {
  const LIMIT = 100;
  const body: any = {
    settings: {
      cursor: { limit: LIMIT },
      filter: { withPhoto: -1 }
    }
  };
  if (cursor?.updatedAt && cursor?.nmID !== undefined) {
    body.settings.cursor.updatedAt = cursor.updatedAt;
    body.settings.cursor.nmID = cursor.nmID;
  }

  const resp = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': (process.env.WB_API_TOKEN || '').trim().replace(/^Authorization:\s*/i, '').replace(/^Bearer\s+/i, '')
    },
    body: JSON.stringify(body),
    signal
  });

  const text = await resp.text();
  const json = safeParseJSON(text);

  if (!resp.ok) {
    const errText = (json && json.error) || text || `WB API HTTP ${resp.status}`;
    throw new Error(errText);
  }
  if (!json || typeof json !== 'object') throw new Error('WB API: пустой или невалидный JSON');

  const cards: WBCard[] = Array.isArray(json.cards) ? json.cards : [];
  const cursorOut = json.cursor || {};
  const total = asBigint(cursorOut.total) ?? 0;
  const updatedAt = typeof cursorOut.updatedAt === 'string' ? cursorOut.updatedAt : undefined;
  const nmID = asBigint(cursorOut.nmID) ?? undefined;

  return { cards, cursor: { total, updatedAt, nmID } };
}

async function chunkInsert(table: string, rows: any[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    if (!part.length) continue;
    const { error } = await supabase.from(table).insert(part);
    if (error) {
      const sample = part.slice(0, 3);
      throw new Error(`Insert failed for table "${table}": ${error.message}. Sample rows: ` + JSON.stringify(sample));
    }
  }
}

/** удаляем все строки безопасным числовым фильтром (без NULL) */
async function deleteAllNumeric(table: string, key: string, zero: number) {
  const { error } = await supabase.from(table).delete().gt(key as any, zero);
  if (error && error.code !== 'PGRST116') throw error;
}

export async function POST() {
  try {
    const tokenRaw = process.env.WB_API_TOKEN || '';
    const token = tokenRaw.trim().replace(/^Authorization:\s*/i, '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'WB_API_TOKEN не задан в окружении сервера' }, { status: 500 });
    }
    if (/[^\x00-\x7F]/.test(token)) {
      return NextResponse.json({ error: 'WB_API_TOKEN содержит недопустимые символы (только латиница/цифры). Проверь .env.local' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    const allCardsRaw: WBCard[] = [];
    let page = 0;
    let cursor: { updatedAt?: string; nmID?: number } | undefined = undefined;

    while (true) {
      page++;
      const { cards, cursor: curOut } = await wbFetchPage(token, cursor, controller.signal);
      allCardsRaw.push(...cards);

      if ((curOut.total ?? 0) < 100) break;
      cursor = { updatedAt: curOut.updatedAt, nmID: curOut.nmID };
      if (page > 5000) break;
    }

    clearTimeout(timeout);

    // --- Разворачиваем данные с нормализацией и приведением КЛЮЧЕЙ к lowercase ---
    const cardsRows: any[] = [];
    const photosRows: any[] = [];
    const tagsRows: any[] = [];
    const charsRows: any[] = [];
    const sizesRows: any[] = [];
    const skusRows: any[] = [];

    for (const raw of allCardsRaw) {
      const c = deepSanitize(raw) as WBCard;

      const nmid = asBigint(c.nmID);
      if (nmid === null) continue;

      cardsRows.push({
        nmid,
        imtid: asBigint(c.imtID),
        nmuuid: c.nmUUID ?? null,
        subjectid: asBigint(c.subjectID),
        subjectname: c.subjectName ?? null,
        vendorcode: c.vendorCode ?? null,
        brand: c.brand ?? null,
        title: c.title ?? null,
        description: c.description ?? null,
        needkiz: c.needKiz ?? null,
        video: c.video ?? null,
        createdat: asISODate(c.createdAt),
        updatedat: asISODate(c.updatedAt),
        dim_length: asNumber(c.dimensions?.length),
        dim_width: asNumber(c.dimensions?.width),
        dim_height: asNumber(c.dimensions?.height),
        weightbrutto: ((): number | null => {
          const v = c.dimensions?.weightBrutto;
          if (v === null || v === undefined) return null;
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : null;
        })(),
        dim_isvalid: c.dimensions?.isValid ?? null
      });

      (c.photos ?? []).forEach(p => photosRows.push({
        nmid,
        big: p.big ?? null,
        c246x328: p.c246x328 ?? null,
        c516x688: p.c516x688 ?? null,
        square: p.square ?? null,
        tm: p.tm ?? null
      }));

      (c.tags ?? []).forEach(t => {
        const tag_id = asBigint(t.id);
        tagsRows.push({ nmid, tag_id, name: t.name ?? null, color: t.color ?? null });
      });

      (c.characteristics ?? []).forEach(ch => {
        const char_id = asBigint(ch.id);
        charsRows.push({ nmid, char_id, name: ch.name ?? null, value: deepSanitize(ch.value ?? null) });
      });

      (c.sizes ?? []).forEach(s => {
        const chrtid = asBigint(s.chrtID);
        if (chrtid === null) return;
        sizesRows.push({ chrtid, nmid, techsize: s.techSize ?? null });
        (s.skus ?? []).forEach(sku => {
          const skuStr = String(sku);
          skusRows.push({ chrtid, sku: skuStr });
        });
      });
    }

    // --- Очищаем и заливаем заново (ключи в нижнем регистре) ---
    await deleteAllNumeric('wb_size_skus', 'id', 0);
    await deleteAllNumeric('wb_sizes', 'chrtid', 0);
    await deleteAllNumeric('wb_photos', 'id', 0);
    await deleteAllNumeric('wb_tags', 'id', 0);
    await deleteAllNumeric('wb_characteristics', 'id', 0);
    await deleteAllNumeric('wb_cards', 'nmid', -1);

    await chunkInsert('wb_cards', cardsRows);
    await chunkInsert('wb_photos', photosRows);
    await chunkInsert('wb_tags', tagsRows);
    await chunkInsert('wb_characteristics', charsRows);
    await chunkInsert('wb_sizes', sizesRows);
    await chunkInsert('wb_size_skus', skusRows);

    const last = cardsRows.at(-1);
    const { error: metaErr } = await supabase
      .from('wb_sync_meta')
      .upsert({
        id: true,
        last_run_at: new Date().toISOString(),
        last_updatedAt: last?.updatedat ?? null,
        last_nmID: last?.nmid ?? null,
        last_total: cardsRows.length,
        last_count_cards: cardsRows.length,
        last_count_photos: photosRows.length,
        last_count_sizes: sizesRows.length,
        last_count_skus: skusRows.length,
        last_count_tags: tagsRows.length,
        last_count_chars: charsRows.length
      }, { onConflict: 'id' });
    if (metaErr) console.warn('wb_sync_meta upsert error:', metaErr.message);

    return NextResponse.json({
      pages: page,
      total_cards: cardsRows.length,
      inserted: {
        cards: cardsRows.length,
        photos: photosRows.length,
        tags: tagsRows.length,
        characteristics: charsRows.length,
        sizes: sizesRows.length,
        skus: skusRows.length
      }
    });
  } catch (e: any) {
    const msg = e?.message || 'WB импорт: неизвестная ошибка';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
