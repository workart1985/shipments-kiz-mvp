const fs = require('fs');

function patchTypes() {
  const path = 'lib/types.ts';
  let txt = fs.readFileSync(path, 'utf8');
  if (/thumb_url\?\:/.test(txt)) return false;
  const replaced = txt.replace(
    /created_at:\s*string;\s*\n\s*};/,
    "created_at: string;\n  thumb_url?: string | null;\n};"
  );
  if (replaced === txt) {
    console.warn('[types] Не нашёл место для вставки thumb_url в lib/types.ts — проверь вручную.');
    return false;
  }
  fs.writeFileSync(path, replaced, 'utf8');
  return true;
}

function patchPage() {
  const path = 'app/page.tsx';
  let src = fs.readFileSync(path, 'utf8');

  // 1) Найти блок <Table ...> с rows={listing.map(...)}
  const rowsRe = /rows=\{listing\.map\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=>\s*\[/m;
  if (!rowsRe.test(src)) {
    console.warn('[page] Не нашёл rows={listing.map(...)} в app/page.tsx — проверь файл вручную.');
    return false;
  }
  const varName = src.match(rowsRe)[1];

  // 2) Добавить мини-фото как первый элемент массива строк
  src = src.replace(
    rowsRe,
    match =>
      `rows={listing.map(${varName}=>[\n            ${varName}.thumb_url ? <img key={"img-"+${varName}.id} src={${varName}.thumb_url as string} alt="" className="h-12 w-auto rounded" /> : <>—</>,\n            `
  );

  // 3) Добавить 'Фото' в header того же <Table> (ищем ближайший header={[...]})
  // Простая стратегия: первый header={ [...]} перед rows={listing.map(...)} расширяем.
  const beforeRowsIdx = src.indexOf('rows={listing.map');
  const before = src.slice(0, beforeRowsIdx);
  const headerRe = /header=\{\s*\[([\s\S]*?)\]\s*\}/m;
  const m = headerRe.exec(before);
  if (m && !/['"]Фото['"]/.test(m[1])) {
    const headerStart = m.index;
    const headerEnd = m.index + m[0].length;
    const newHeader = m[0].replace(/\[\s*/, "['Фото', ");
    src = src.slice(0, headerStart) + newHeader + src.slice(headerEnd);
  } else if (!m) {
    console.warn('[page] Не нашёл header={[...]} перед listing.map — добавь "Фото" в заголовок вручную.');
  }

  fs.writeFileSync(path, src, 'utf8');
  return true;
}

const t = patchTypes();
const p = patchPage();
console.log(`Done. types:${t?'ok':'skip'} page:${p?'ok':'skip'}`);
