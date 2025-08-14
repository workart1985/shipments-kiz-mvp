'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WAREHOUSES, type Warehouse, type ListingRow, type BoxSummaryRow } from '@/lib/types';
import { Select } from '@/components/Select';
import { Table } from '@/components/Table';
import { Toast } from '@/components/Toast';

type ShipmentOption = {
  shipment_id: string;
  number_in_day: number;
  status: string;
  delivery_date: string | null;
  label: string;
};

type BoxOption = {
  box_id: string;
  ordinal: number;
  label: string;
};

export default function Home() {
  // Блок 1
  const [warehouse, setWarehouse] = useState<Warehouse>('Казань');
  const [shipDate, setShipDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [shipments, setShipments] = useState<ShipmentOption[]>([]);
  const [shipmentId, setShipmentId] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);

  const [boxes, setBoxes] = useState<BoxOption[]>([]);
  const [boxId, setBoxId] = useState<string>('');

  // Блок 2
  const [barcode, setBarcode] = useState('');
  const [withKIZ, setWithKIZ] = useState(true); // включаем по умолчанию
  const [kiz, setKiz] = useState('');
  const [wbCode, setWbCode] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [size, setSize] = useState('');

  // Блок 3
  const [listing, setListing] = useState<ListingRow[]>([]);
  const [summary, setSummary] = useState<BoxSummaryRow[]>([]);

  // Уведомления
  const [toast, setToast] = useState<{type:'success'|'error', text:string} | null>(null);

  // Рефы для быстрого фокуса
  const barcodeRef = useRef<HTMLInputElement>(null);
  const kizRef = useRef<HTMLInputElement>(null);

  const canAdd = useMemo(() => {
    if (!shipmentId || !boxId) return false;
    if (!barcode.trim()) return false;
    if (withKIZ && !kiz.trim()) return false;
    return true;
  }, [shipmentId, boxId, barcode, withKIZ, kiz]);

  // Подгрузка поставок при смене склада/даты
  const loadShipments = async () => {
    setShipments([]);
    setShipmentId('');
    setBoxes([]);
    setBoxId('');
    setListing([]);
    setSummary([]);

    const res = await fetch(`/api/shipments?warehouse=${encodeURIComponent(warehouse)}&date=${shipDate}`);
    const data = await res.json();
    if (res.ok) setShipments(data);
  };

  useEffect(() => { loadShipments(); }, [warehouse, shipDate]);

  // Когда выбрали поставку — чистим короба/таблицы
  useEffect(() => {
    setBoxes([]);
    setBoxId('');
    setListing([]);
    setSummary([]);
  }, [shipmentId]);

  // При выборе поставки — подтягиваем её текущую дату отгрузки
  useEffect(() => {
    if (!shipmentId) { setDeliveryDate(null); return; }
    const s = shipments.find(x => x.shipment_id === shipmentId);
    setDeliveryDate(s?.delivery_date ?? null);
  }, [shipmentId, shipments]);

  // Автофокус на поле ШК
  useEffect(() => {
    barcodeRef.current?.focus();
  }, [shipmentId, boxId]);

  // Если включили КИЗ и контекст готов — ведём фокус на поле КИЗ
  useEffect(() => {
    if (withKIZ && shipmentId && boxId && barcode.trim()) {
      kizRef.current?.focus();
    }
  }, [withKIZ, shipmentId, boxId, barcode]);

  const createShipment = async () => {
    const res = await fetch('/api/shipments/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouse, shipment_date: shipDate })
    });
    const data = await res.json();
    if (!res.ok) {
      setToast({ type:'error', text: data.error || 'Ошибка создания поставки' });
      return;
    }
    await loadShipments();
    setShipmentId(data.shipment_id);
    setToast({ type:'success', text: `Создана поставка ${data.human_number}` });
  };

  const createBox = async () => {
    if (!shipmentId) { setToast({ type:'error', text:'Сначала выберите поставку' }); return; }
    const res = await fetch('/api/boxes/create', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ shipment_id: shipmentId })
    });
    const data = await res.json();
    if (!res.ok) {
      setToast({ type:'error', text: data.error || 'Ошибка создания короба' });
      return;
    }
    const newBox: BoxOption = data;
    const list = [...boxes, newBox].sort((a,b)=>a.ordinal-b.ordinal);
    setBoxes(list);
    setBoxId(newBox.box_id);
  };

  // Обновление листинга+сводки
  const refreshDataViews = async () => {
    if (!shipmentId) return;
    const [lres, sres] = await Promise.all([
      fetch(`/api/shipments/${shipmentId}/listing`),
      boxId ? fetch(`/api/boxes/${boxId}/summary`) : Promise.resolve({ ok:true, json: async()=>[] as any })
    ]);
    const ldata = await lres.json();
    const sdata = await (boxId ? sres.json() : []);
    if (lres.ok) setListing(ldata);
    if (boxId && sres.ok) setSummary(sdata);
  };
  useEffect(() => { refreshDataViews(); }, [shipmentId, boxId]);

  const onAdd = async () => {
    if (!shipmentId || !boxId) { setToast({ type:'error', text:'Выберите поставку и короб' }); return; }
    if (!barcode.trim()) { setToast({ type:'error', text:'Заполните ШК' }); return; }
    if (withKIZ && !kiz.trim()) { setToast({ type:'error', text:'Заполните КИЗ' }); return; }

    const res = await fetch('/api/scan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        shipment_id: shipmentId,
        box_id: boxId,
        barcode,
        wb_code: wbCode || null,
        supplier_code: supplierCode || null,
        size: size || null,
        with_kiz: withKIZ,
        kiz_code: kiz || null
      })
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = data.error || 'Ошибка сканирования';
      setToast({ type:'error', text: msg });
      const audio = new Audio('/beep-error.mp3'); audio.play().catch(()=>{});
      return;
    }

    // Успешное добавление — очистка полей и фокус обратно в ШК
    setBarcode('');
    setKiz('');
    barcodeRef.current?.focus();
    const audio = new Audio('/beep-ok.mp3'); audio.play().catch(()=>{});
    await refreshDataViews();
  };

  const onDeleteRow = async (id: string) => {
    const res = await fetch(`/api/rows/${id}`, { method:'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setToast({ type:'error', text: data.error || 'Ошибка удаления' });
      return;
    }
    await refreshDataViews();
  };

  const saveDeliveryDateInfo = async () => {
    if (!shipmentId) { setToast({ type:'error', text:'Сначала выберите поставку' }); return; }
    const res = await fetch(`/api/shipments/${shipmentId}`, {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ delivery_date: deliveryDate || null })
    });
    const data = await res.json();
    if (!res.ok) {
      setToast({ type:'error', text: data.error || 'Не удалось сохранить дату отгрузки' });
      return;
    }
    await loadShipments(); // обновим ярлыки
    setToast({ type:'success', text:'Дата отгрузки сохранена' });
  };

  // Быстрый ввод: Enter в ШК → фокус в КИЗ (если нужен); Enter в КИЗ → добавить
  const handleBarcodeKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      if (withKIZ) {
        e.preventDefault();
        if (!barcode.trim()) { setToast({ type:'error', text:'Заполните ШК' }); return; }
        kizRef.current?.focus();
      } else {
        if (canAdd) onAdd();
        else setToast({ type:'error', text:'Выберите поставку и короб' });
      }
    }
  };

  const handleKizKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canAdd) onAdd();
      else setToast({ type:'error', text:'Заполните КИЗ' });
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {toast && <Toast type={toast.type} onClose={()=>setToast(null)}>{toast.text}</Toast>}

      {/* Блок 1: фильтры/метаданные */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Склад отгрузки</label>
          <Select value={warehouse} onChange={v=>setWarehouse(v as Warehouse)} options={WAREHOUSES.map(w=>({label:w, value:w}))}/>
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Дата поставки</label>
          <input type="date" className="border rounded px-3 py-2"
                 value={shipDate} onChange={e=>setShipDate(e.target.value)} />
        </div>

        <div className="flex items-end gap-2">
          <button onClick={createShipment} className="px-3 py-2 rounded bg-black text-white hover:opacity-90">Создать поставку</button>
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Список поставок</label>
          <Select
            placeholder={shipments.length ? 'Выбрать поставку' : 'Поставок нет'}
            value={shipmentId}
            onChange={setShipmentId}
            options={shipments.map(s=>({label:s.label, value:s.shipment_id}))}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Дата отгрузки (инфо)</label>
          <input type="date" className="border rounded px-3 py-2"
                 value={deliveryDate ?? ''}
                 onChange={e=>setDeliveryDate(e.target.value)} />
        </div>

        <div className="flex items-end gap-2">
          <button onClick={saveDeliveryDateInfo} className="px-3 py-2 rounded border">Сохранить дату</button>
        </div>

        <div className="flex items-end gap-2 md:col-span-3">
          <button onClick={createBox} className="px-3 py-2 rounded bg-black text-white hover:opacity-90">Создать короб</button>
          <Select
            className="min-w-[220px]"
            placeholder="Выбрать короб"
            value={boxId}
            onChange={setBoxId}
            options={boxes.map(b=>({label:b.label, value:b.box_id}))}
          />
        </div>
      </div>

      {/* Блок 2: ввод */}
      <div className="p-3 rounded-2xl border mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-sm text-gray-600 mb-1 block">ШК</label>
            <input
              ref={barcodeRef}
              value={barcode}
              onChange={e=>setBarcode(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              className="border rounded px-3 py-2 w-full"
              placeholder="Сканируй или вводи"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="withKiz"
              type="checkbox"
              checked={withKIZ}
              onChange={e=>setWithKIZ(e.target.checked)}
            />
            <label htmlFor="withKiz">Товар с КИЗ</label>
          </div>

          {withKIZ && (
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">КИЗ</label>
              <input
                ref={kizRef}
                value={kiz}
                onChange={e=>setKiz(e.target.value)}
                onKeyDown={handleKizKeyDown}
                className="border rounded px-3 py-2 w-full"
                placeholder="Код DataMatrix"
              />
            </div>
          )}

          <div className="md:col-span-1">
            <button
              disabled={!canAdd}
              onClick={onAdd}
              className={`w/full px-3 py-2 rounded ${canAdd?'bg-green-600 text-white':'bg-gray-200 text-gray-500'}`}
            >
              Добавить
            </button>
          </div>

          {/* Доп.поля — по желанию */}
          <div>
            <label className="text-xs text-gray-500 block">Артикул WB</label>
            <input value={wbCode} onChange={e=>setWbCode(e.target.value)} className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block">Артикул поставщика</label>
            <input value={supplierCode} onChange={e=>setSupplierCode(e.target.value)} className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block">Размер</label>
            <input value={size} onChange={e=>setSize(e.target.value)} className="border rounded px-2 py-1 w-full" />
          </div>
        </div>
      </div>

      {/* Блок 3: Таблицы */}
      <div className="mb-4">
        <h2 className="font-semibold mb-2">Таблица сканирований</h2>
        <Table
          header={['ШК','Артикул WB','Артикул пост.','Размер','КИЗ','Время','—']}
          rows={listing.map(r=>[
            r.barcode, r.wb_code??'', r.supplier_code??'', r.size??'', r.kiz_code??'', new Date(r.created_at).toLocaleString(),
            <button key={`del-${r.id}`} onClick={()=>onDeleteRow(r.id)} className="text-red-600 hover:underline">Удалить</button>
          ])}
        />
      </div>

      <div>
        <h2 className="font-semibold mb-2">Сводная по коробу</h2>
        <Table
          header={['ШК','Артикул WB','Артикул пост.','Размер','КИЗ','Кол-во']}
          rows={summary.map(s=>[s.barcode, s.wb_code??'', s.supplier_code??'', s.size??'', s.kiz_code??'', s.qty])}
        />
      </div>
    </div>
  );
}
