'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';

export default function WBSettings() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runImport = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/wb/cards/import', { method: 'POST' });
      const txt = await res.text();
      let data: any = null;
      try { data = JSON.parse(txt); } catch { /* not json -> keep text */ }

      if (!res.ok) {
        const msg = (data && data.error) ? data.error : (txt || 'Импорт завершился с ошибкой');
        throw new Error(msg);
      }
      setResult(data ?? txt);
    } catch (e:any) {
      setError(e.message || 'Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded border">Настройки</button>
      <Modal open={open} onClose={()=>setOpen(false)} title="Настройки">
        <div className="space-y-4">
          <div className="rounded border p-3">
            <div className="font-semibold mb-2">Wildberries — карточки товаров</div>
            <p className="text-sm text-gray-600">Импортирует все карточки через /content/v2/get/cards/list. Данные перезаписываются полностью.</p>
            <button
              onClick={runImport}
              disabled={loading}
              className="mt-2 px-3 py-2 rounded bg-black text-white disabled:opacity-50"
            >
              {loading ? 'Импорт...' : 'Получить список карточек'}
            </button>

            {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
            {result && (
              <div className="mt-3 text-sm">
                <div className="font-medium">Готово:</div>
                <pre className="text-xs bg-gray-50 p-2 rounded border overflow-auto max-h-64">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
