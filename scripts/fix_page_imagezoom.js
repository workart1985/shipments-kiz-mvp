const fs = require('fs');

const file = 'app/page.tsx';
let s = fs.readFileSync(file, 'utf8');
let changed = false;

// A) Удаляем любые "заблудшие" inline-вставки ImageZoom
const strayRe = /<ImageZoom\s+open=\{\!!zoomSrc\}\s+src=\{zoomSrc\}\s+onClose=\{\(\)=>setZoomSrc\(null\)\}\s*\/>/g;
if (strayRe.test(s)) { s = s.replace(strayRe, ''); changed = true; }

// B) Импорт ImageZoom после ScannerCapture (или в конец блока импортов)
if (!s.includes("from '@/components/ImageZoom'")) {
  if (s.includes("from '@/components/ScannerCapture'")) {
    s = s.replace(
      /(import\s+ScannerCapture[^\n]*;\s*\n)/,
      `$1import ImageZoom from '@/components/ImageZoom';\n`
    );
  } else {
    // fallback: вставим после последнего import
    s = s.replace(/(import[^\n]+\n)(?![\s\S]*import)/, `$1import ImageZoom from '@/components/ImageZoom';\n`);
  }
  changed = true;
}

// C) Состояние zoomSrc
if (!/const\s+\[zoomSrc,\s*setZoomSrc\]/.test(s)) {
  // Вставим после первой строки с useState(
  if (/useState\(/.test(s)) {
    s = s.replace(/(useState\([^\n]*\);\s*\n)/, `$1  const [zoomSrc, setZoomSrc] = useState<string|null>(null);\n`);
  } else {
    // Fallback: после открытия функции
    s = s.replace(/(export\s+default\s+function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{\s*\n)/,
      `$1  const [zoomSrc, setZoomSrc] = useState<string|null>(null);\n`);
  }
  changed = true;
}

// D) Вставляем <ImageZoom .../> перед финальным "); }"
if (!s.includes('<ImageZoom open={!!zoomSrc}')) {
  const endRe = /\)\s*;\s*\}\s*$/;
  if (endRe.test(s)) {
    s = s.replace(endRe,
`    <ImageZoom open={!!zoomSrc} src={zoomSrc} onClose={()=>setZoomSrc(null)} />
  );
}
`);
    changed = true;
  } else {
    console.warn('[warn] Не нашёл конец JSX return — вставь <ImageZoom .../> вручную.');
  }
}

// E) Сужаем колонку КИЗ (оборачиваем вывод)
const kizWrap = `(<div className="max-w-[160px] whitespace-normal break-words leading-tight">{r.kiz_code ?? ''}</div>)`;
if (!s.includes('max-w-[160px]') && s.includes('r.kiz_code')) {
  s = s.replace(/r\.kiz_code\?\?['"]{2}/g, kizWrap);
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, s, 'utf8');
  console.log('✅ app/page.tsx fixed');
} else {
  console.log('ℹ️ app/page.tsx уже в порядке (no changes)');
}
