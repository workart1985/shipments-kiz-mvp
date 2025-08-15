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
  const [warehouse, setWarehouse] = useState<Warehouse>('Казань');
  const [shipDate, setShipDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [shipments, setShipments] = useState<ShipmentOption[]>([]);
  const [shipmentId, setShipmentId] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);

  const [boxes, setBoxes] = useState<BoxOption[]>([]);
  const [boxId, setBoxId] = useState<string>('');

  const [barcode, setBarcode] = useState('');
  const [withKIZ, setWithKIZ] = useState(true);
  const [kiz, setKiz] = useState('');
  const [wbCode, setWbCode] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [size, setSize] = useState('');

  const [listing, setListing] = useState<ListingRow[]>([]);
  const [summary, setSummary] = useState<BoxSummaryRow[]>([]);
  const [listLimit, setListLimit] = useState<number>(200);

  const [toast, setToast] = useState<{type:'success'|'error', text:string} | null>(null);
  const [changeTick, setChangeTick] = useState<number>(0);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const kizRef = useRef<HTMLInputElement>(null);

  const canAdd = useMemo(() => {
    if (!shipmentId || !boxId) return false;
    if (!barcode.trim()) return false;
    if (withKIZ && !kiz.trim()) return false;
    return true;
  }, [shipmentId, boxId, barcode, withKIZ, kiz]);

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

  const loadBoxes = async (sid: string) => {
    if (!sid) { setBoxes([]); setBoxId(''); return; }
    const res = await fetch(`/api/boxes?shipment_id=${sid}`);
    const data = await res.json();
    if (res.ok) {
      setBoxes(data);
      if (data.length && !boxId) setBoxId(data[0].box_id);
    }
  };

  useEffect(() => {
    setListing([]); setSummary([]); setBoxId(''); setBoxes([]);
    if (shipmentId) loadBoxes(shipmentId);
    const s = shipments.find(x => x.shipment_id === shipmentId);
    setDeliveryDate(s?.delivery_date ?? null);
  }, [shipmentId]);

  useEffect(() => { barcodeRef.current?.focus(); }, [shipmentId, boxId]);

  const createShipment = async () => {
    const res = await fetch('/api/shipments/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouse, shipment_date: shipDate })
    });
    const data = await res.json();
    if (!res.ok) { setToast({ type:'error', text: data.error || 'Ошибка создания поставки' }); return; }
    await loadShipments();
    setShipmentId(data.shipment_id);
    setToast({ type:'success', text: `Создана поставка ${data.human_number}` });
  };

  const deleteShipment = async () => {
    if (!shipmentId) { setToast({ type:'error', text:'Сначала выберите поставку' }); return; }
    const pwd = prompt('Пароль для удаления поставки (внимание: удалится всё):');
    if (pwd === null) return;
    const res = await fetch(`/api/shipments/${shipmentId}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (!res.ok) { setToast({ type:'error', text: data.error || 'Не удалось удалить поставку' }); return; }
    setToast({ type:'success', text:'Поставка удалена' });
    setBoxes([]); setBoxId(''); setListing([]); setSummary([]); setShipmentId('');
    setChangeTick(t => t + 1);
    await loadShipments();
  };

  const createBox = async () => {
    if (!shipmentId) { setToast({ type:'error', text:'Сначала выберите поставку' }); return; }
    const res = await fetch('/api/boxes/create', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ shipment_id: shipmentId })
    });
    const data = await res.json();
    if (!res.ok) { setToast({ type:'error', text: data.error || 'Ошибка создания короба' }); return; }
    const newBox: BoxOption = data;
    const list = [...boxes, newBox].sort((a,b)=>a.ordinal-b.ordinal);
    setBoxes(list);
    setBoxId(newBox.box_id);
    setChangeTick(t => t + 1);
  };

  const deleteBox = async () => {
    if (!boxId) { setToast({ type:'error', text:'Сначала выберите короб' }); return; }
    const pwd = prompt('Пароль для удаления короба:');
    if (pwd === null) return;
    const res = await fetch(`/api/boxes/${boxId}`, {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (!res.ok) { setToast({ type:'error', text: data.error || 'Не удалось удалить короб' }); return; }
    setToast({ type:'success', text:'Короб удалён' });
    // перезагрузим список коробов
    await loadBoxes(shipmentId);
    setBoxId('');
    await refreshDataViews();
    setChangeTick(t => t + 1);
  };

  const refreshDataViews = async () => {
    if (!shipmentId) return;
    const [lres, sres] = await Promise.all([
      fetch(`/api/shipments/${shipmentId}/listing?limit=${listLimit}&box_id=${boxId}`),
      boxId ? fetch(`/api/boxes/${boxId}/summary`) : Promise.resolve({ ok:true, json: async()=>[] as any })
    ]);
    const ldata = await lres.json();
    const sdata = await (boxId ? sres.json() : []);
    if (lres.ok) setListing(ldata);
    if (boxId && sres.ok) setSummary(sdata);
  };
  useEffect(() => { refreshDataViews(); }, [shipmentId, boxId, listLimit, changeTick]);

  const onAdd = async () => {
    if (!shipmentId || !boxId) { setToast({ type:'error', text:'Выберите поставку и короб' }); return; }
    if (!barcode.trim()) { setToast({ type:'error', text:'Заполните ШК' }); return; }
    if (withKIZ && !kiz.trim()) { setToast({ type:'error', text:'Заполните КИЗ' }); return; }

    const res = await fetch('/api/scan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        shipment_id: shipmentId, box_id: boxId,
        barcode, wb_code: wbCode || null, supplier_code: supplierCode || null, size: size || null,
        with_kiz: withKIZ, kiz_code: kiz || null
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setToast({ type:'error', text: data.error || 'Ошибка сканирования' });
      const audio = new Audio('/beep-error.mp3'); audio.play().catch(()=>{});
      return;
    }
    setBarcode(''); setKiz(''); barcodeRef.current?.focus();
    const audio = new Audio('/beep-ok.mp3'); audio.play().catch(()=>{});
    await refreshDataViews();
    setChangeTick(t => t + 1);
  };

  const onDeleteRow = async (id: string) => {
    const res = await fetch(`/api/rows/${id}`, { method:'DELETE' });
    const data = await res.json();
    if (!res.ok) { setToast({ type:'error', text: data.error || 'Ошибка удаления' }); return; }
    await refreshDataViews();
    setChangeTick(t => t + 1);
  };

  const saveDeliveryDateInfo = async () => {
    if (!shipmentId) { setToast({ type:'error', text:'Сначала выберите поставку' }); return; }
    const res = await fetch(`/api/shipments/${shipmentId}`, {
      method:'PATCH', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ delivery_date: deliveryDate || null })
    });
    const data = await res.json();
    if (!res.ok) { setToast({ type:'error', text: data.error || 'Не удалось сохранить дату отгрузки' }); return; }
    await loadShipments();
    setToast({ type:'success', text:'Дата отгрузки сохранена' });
  };

  const handleBarcodeKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      if (withKIZ) {
        e.preventDefault();
        if (!barcode.trim()) { setToast({ type:'error', text:'Заполните ШК' }); return; }
        kizRef.current?.focus();
      } else {
        if (canAdd) onAdd(); else setToast({ type:'error', text:'Выберите поставку и короб' });
      }
    }
  };
  const handleKizKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canAdd) onAdd(); else setToast({ type:'error', text:'Заполните КИЗ' });
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
          <input type="date" className="border rounded px-3 py-2" value={shipDate} onChange={e=>setShipDate(e.target.value)} />
        </div>

        <div className="flex items-end gap-2">
          <button onClick={createShipment} className="px-3 py-2 rounded bg-black text-white hover:opacity-90">Создать поставку</button>
          <button onClick={deleteShipment} className="px-3 py-2 rounded border border-red-600 text-red-600 hover:bg-red-50">Удалить поставку</button>
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
          <input type="date" className="border rounded px-3 py-2" value={deliveryDate ?? ''} onChange={e=>setDeliveryDate(e.target.value)} />
        </div>

        <div className="flex items-end gap-2">
          <button onClick={saveDeliveryDateInfo} className="px-3 py-2 rounded border">Сохранить дату</button>
        </div>

        <div className="flex items-end gap-2 md:col-span-3">
          <button onClick={createBox} className="px-3 py-2 rounded bg-black text-white hover:opacity-90">Создать короб</button>
<Select className="min-w-[220px]" placeholder="Выбрать короб" value={boxId} onChange={setBoxId}
                  options={boxes.map(b=>({label:b.label, value:b.box_id}))}
          />
        <button onClick={deleteBox} className="px-3 py-2 rounded border border-red-600 text-red-600 hover:bg-red-50">Удалить короб</button>
</div>
      </div>

      {/* Блок 2: ввод */}
      <div className="p-3 rounded-2xl border mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-sm text-gray-600 mb-1 block">ШК</label>
            <input ref={barcodeRef} value={barcode} onChange={e=>setBarcode(e.target.value)} onKeyDown={handleBarcodeKeyDown}
                   className="border rounded px-3 py-2 w-full" placeholder="Сканируй или вводи" />
          </div>
          <div className="flex items-center gap-2">
            <input id="withKiz" type="checkbox" checked={withKIZ} onChange={e=>setWithKIZ(e.target.checked)} />
            <label htmlFor="withKiz">Товар с КИЗ</label>
          </div>
          {withKIZ && (
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">КИЗ</label>
              <input ref={kizRef} value={kiz} onChange={e=>setKiz(e.target.value)} onKeyDown={handleKizKeyDown}
                     className="border rounded px-3 py-2 w-full" placeholder="Код DataMatrix" />
            </div>
          )}
          <div className="md:col-span-1">
            <button disabled={!canAdd} onClick={onAdd}
                    className={`w-full px-3 py-2 rounded ${canAdd?'bg-green-600 text-white':'bg-gray-200 text-gray-500'}`}>
              Добавить
            </button>
          </div>
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
        <div className="mb-2 text-sm text-gray-600 flex items-center gap-2">
          Показать последние:
          <select className="border rounded px-2 py-1" value={listLimit} onChange={e=>setListLimit(Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>
        <Table
          header={['ШК','Артикул WB','Артикул пост.','Размер','КИЗ','Время','—']}
          rows={listing.map(r=>[
            r.barcode, r.wb_code??'', r.supplier_code??'', r.size??'', r.kiz_code??'', new Date(r.created_at).toLocaleString(),
            <button key={`del-${r.id}`} onClick={()=>onDeleteRow(r.id)} className="text-red-600 hover:underline">Удалить</button>
          ])}
          maxHeightClass="max-h-96"
        />
      </div>

      <div className="mb-6">
        <h2 className="font-semibold mb-2">Сводная по коробу</h2>
        <Table
          header={['ШК','Артикул WB','Артикул пост.','Размер','Кол-во']}
          rows={summary.map(s=>[s.barcode, s.wb_code??'', s.supplier_code??'', s.size??'', s.qty])}
          maxHeightClass="max-h-80"
        />
      </div>

      <div className="mt-6">
        <h2 className="font-semibold mb-2">Сводная по поставке</h2>
        <ShipmentSummary shipmentId={shipmentId} changeTick={changeTick} />
      </div>
    </div>
  );
}

function ShipmentSummary({ shipmentId, changeTick }: { shipmentId: string; changeTick: number }) {
  const [rows, setRows] = useState<Array<{ barcode: string; wb_code: string | null; supplier_code: string | null; size: string | null; qty: number }>>([]);

  useEffect(() => {
    const load = async () => {
      if (!shipmentId) { setRows([]); return; }
      const res = await fetch(`/api/shipments/${shipmentId}/summary`);
      const data = await res.json();
      if (res.ok) setRows(data); else setRows([]);
    };
    load();
  }, [shipmentId, changeTick]);

  return (
    <Table
      header={['ШК','Артикул WB','Артикул пост.','Размер','Кол-во']}
      rows={rows.map(s=>[s.barcode, s.wb_code??'', s.supplier_code??'', s.size??'', s.qty])}
      maxHeightClass="max-h-80"
    />
  );
}
