const fs = require('fs');
const file = 'app/page.tsx';
let s = fs.readFileSync(file, 'utf8');
let changed = false;

// A) Удаляем импорт ImageZoom
s = s.replace(/^\s*import\s+ImageZoom\s+from\s+['"]@\/components\/ImageZoom['"];\s*\n/m, () => { changed = true; return ''; });

// B) Удаляем состояния zoomSrc
s = s.replace(/^\s*const\s*\[\s*zoomSrc\s*,\s*setZoomSrc\s*\]\s*=\s*useState<[^>]*>\([^)]*\);\s*\n/m, () => { changed = true; return ''; });

// C) Удаляем любые вхождения компонента <ImageZoom .../>
s = s.replace(/<ImageZoom[\s\S]*?\/>\s*/g, () => { changed = true; return ''; });

// D) Заменяем onClick={()=>setZoomSrc(....)} -> window.open(...)
s = s.replace(/onClick=\{\(\)\s*=>\s*setZoomSrc\(\s*([^)]+?)\s*\)\s*\}/g, (m, urlExpr) => {
  changed = true;
  return `onClick={()=>{ try{ const u=${urlExpr}; if(u) window.open(u as string, '_blank'); }catch(e){} }}`;
});

// E) На всякий — где мог остаться вызов setZoomSrc(null)
s = s.replace(/setZoomSrc\(null\);?/g, () => { changed = true; return ''; });

// F) Сужение колонки КИЗ — оставим, но убедимся, что у нас JSX-выражение не поломано
// (ничего не делаем, если уже заменено ранее)

// G) Слегка улучшим превью в листинге: по клику открывать в новой вкладке
s = s.replace(
  /(\{[a-zA-Z0-9_]+\.thumb_url\s*\?\s*<img[^>]*?)\/>/g,
  (m) => {
    if (m.includes('onClick')) return m; // уже есть
    changed = true;
    // добавим onClick c window.open и cursor-zoom-in
    return m.replace('<img', `<img onClick={()=>window.open(${m.match(/\{([a-zA-Z0-9_]+\.thumb_url)[^}]*\}/)?.[1] || 'undefined'} as string,'_blank')} className="cursor-zoom-in h-12 w-auto rounded"`);
  }
);

// H) В сводках могли остаться onClick с setZoomSrc — уже заменили в (D),
// но убедимся, что у превью есть cursor-zoom-in класс
s = s.replace(/className="h-12 w-auto rounded"/g, () => { changed = true; return 'className="h-12 w-auto rounded cursor-zoom-in"'; });

if (changed) {
  fs.writeFileSync(file, s, 'utf8');
  console.log('✅ app/page.tsx очищен от модалки, зум через window.open установлен.');
} else {
  console.log('ℹ️ Изменений не требуется — файл уже чист.');
}
