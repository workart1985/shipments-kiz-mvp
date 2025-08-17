'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WAREHOUSES, type Warehouse, type ListingRow, type BoxSummaryRow } from '@/lib/types';
import { Select } from '@/components/Select';
import { Table } from '@/components/Table';
import { Toast } from '@/components/Toast';
import Modal from '@/components/Modal';
import ScannerCapture from '@/components/ScannerCapture';
import WBSettings from '@/app/wb-settings';

type ShipmentOption = {
  shipment_id: string;
  number_in_day: number;
  status: 'draft'|'ready'|'shipped'|string;
  delivery_date: string | null;
  label: string;
};

type ShipmentListRow = {
  shipment_id: string;
  warehouse: string;
  shipment_date: string;
  delivery_date: string | null;
  number_in_day: number;
  status: 'draft'|'ready'|'shipped'|string;
  label: string;
};

type BoxOption = {
  box_id: string;
  ordinal: number;
  label: string;
};

// ---- helpers ----
const normalizeKiz = (s: string) => {
  const map: Record<string,string> = {
    "А":"A","В":"B","Е":"E","К":"K","М":"M","Н":"H","О":"O","Р":"P","С":"C","Т":"T","У":"Y","Х":"X",
    "а":"a","в":"b","е":"e","к":"k","м":"m","н":"h","о":"o","р":"p","с":"c","т":"t","у":"y","х":"x",
    "Ё":"E","ё":"e"
  };
  return s.replace(/[А-Яа-яЁё]/g, ch => map[ch] ?? ch).replace(/\s+/g, '');
};
const normalizePrintable = (s: string) => s.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, '');
const stripGS = (s: string) => s.replace(/[\x1D]/g, '');
const isLikelyKiz = (v: string) => {
  const t = stripGS(normalizePrintable(v));
  if (!/^01\d{14}/.test(t)) return false;
  if (t.length < 30) return false;
  const p21 = t.indexOf('21', 16);
  if (p21 === -1) return false;
  const p91 = t.indexOf('91', p21 + 2);
  if (p91 === -1) return false;
  const p92 = t.indexOf('92', p91 + 2);
  if (p92 === -1) return false;
  return 0 < p21 && p21 < p91 && p91 < p92;
};
const classifyScan = (raw: string): { type: 'barcode' | 'kiz', value: string } => {
  let v = raw.replace(/[\r\n]+$/g, '');
  if (/^B:/i.test(v)) return { type: 'barcode', value: v.slice(2).trim() };
  if (/^K:/i.test(v)) return { type: 'kiz', value: v.slice(2).trim() };
  const vv = v.trim();
  if (/^\d+$/.test(vv)) return { type: 'barcode', value: vv };
  if (isLikelyKiz(vv)) return { type: 'kiz', value: vv };
  return { type: 'kiz', value: vv };
};

export default function Home() {
  // Meta
  const [warehouse, setWarehouse] = useState<Warehouse>('Казань');
  const [shipDate, setShipDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [shipments, setShipments] = useState<ShipmentOption[]>([]);
  const [shipmentId, setShipmentId] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [shipmentStatus, setShipmentStatus] = useState<'draft'|'ready'|'shipped'|string>('draft');

  const [boxes, setBoxes] = useState<BoxOption[]>([]);
  const [boxId, setBoxId] = useState<string>('');

  // Input/capture
  const [scan, setScan] = useState('');
  const [scanning, setScanning] = useState(false);
  const [captureOn, setCaptureOn] = useState<boolean>(true);
  const [withKIZ, setWithKIZ] = useState<boolean>(true);

  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);

  // Tables
  const [listing, setListing] = useState<ListingRow[]>([]);
  const [summary, setSummary] = useState<BoxSummaryRow[]>([]);
  const [listLimit, setListLimit] = useState<number>(200);

  const [toast, setToast] = useState<{type:'success'|'error', text:string} | null>(null);
  const [changeTick, setChangeTick] = useState<number>(0);

  // "Все поставки"
  const [allOpen, setAllOpen] = useState(false);
  const [allShipments, setAllShipments] = useState<ShipmentListRow[]>([]);

  // Refs/queue
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef<boolean>(false);

  const contextReady = useMemo(() => !!shipmentId && !!boxId, [shipmentId, boxId]);
  const isLocked = useMemo(() => shipmentStatus !== 'draft', [shipmentStatus]);

  // === LOADERS ===
  const loadShipmentsFor = async (wh: Warehouse, date: string) => {
    const res = await fetch(`/api/shipments?warehouse=${encodeURIComponent(wh)}&date=${date}`);
    const data = await res.json();
    if (res.ok) setShipments(data);
    return res.ok ? (data as ShipmentOption[]) : [];
  };

  const loadShipments = async () => {
    setShipments([]); setShipmentId('');
    setBoxes([]); setBoxId('');
    setListing([]); setSummary([]);
    setPendingBarcode(null);
    await loadShipmentsFor(warehouse, shipDate);
  };
  useEffect(() => { loadShipments(); }, [warehouse, shipDate]);

  const loadBoxes = async (sid: string) => {
    if (!sid) { setBoxes([]); setBoxId(''); return; }
    const res = await fetch(`/api/boxes?shipment_id=${sid}`);
    const data = await res.json();
    if (res.ok) {
      setBoxes(data);
      if (data.length) setBoxId(data[0].box_id    
  );
}

  };

  useEffect(() => {
    setListing([]); setSummary([]); setBoxId(''); setBoxes([]);
    setPendingBarcode(null);
    if (shipmentId) loadBoxes(shipmentId);
    const s = shipments.find(x => x.shipment_id === shipmentId);
    setDeliveryDate(s?.delivery_date ?? null);
    setShipmentStatus(s?.status ?? 'draft');
  }, [shipmentId]);

  useEffect(() => { inputRef.current?.focus(); }, [shipmentId, boxId]);

  // === CRUD shipment ===
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
    setPendingBarcode(null);
    setChangeTick(t => t + 1);
    await loadShipments();
  };

  const setStatus = async (status: 'draft'|'ready') => {
    if (!shipmentId) return;
    const res = await fetch(`/api/shipments/${shipmentId}`, {
      method:'PATCH', headers:{ 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) { setToast({ type:'error', text: data.error || 'Не удалось обновить статус' }); return; }
    setShipmentStatus(status);
    setToast({ type:'success', text: status === 'ready' ? 'Поставка завершена' : 'Редактирование включено' });
  };

  // === CRUD boxes ===
  const createBox = async () => {
    if (isLocked) { setToast({ type:'error', text:'Поставка завершена. Редактирование запрещено.' }); return; }
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
    if (isLocked) { setToast({ type:'error', text:'Поставка завершена. Удаление короба запрещено.' }); return; }
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
    await loadBoxes(shipmentId);
    setBoxId('');
    setPendingBarcode(null);
    await refreshDataViews();
    setChangeTick(t => t + 1);
  };

  // === Views refresh ===
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

  // === Scan flow ===
  const commitRow = async (barcode: string, kiz: string | null) => {
    if (isLocked) { setToast({ type:'error', text:'Поставка завершена. Сканирование запрещено.' }); return false; }
    const res = await fetch('/api/scan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        shipment_id: shipmentId, box_id: boxId,
        barcode, wb_code: null, supplier_code: null, size: null,
        with_kiz: !!kiz, kiz_code: kiz
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setToast({ type:'error', text: data.error || 'Ошибка сканирования' });
      const audio = new Audio('/beep-error.mp3'); audio.play().catch(()=>{});
      return false;
    }
    const audio = new Audio('/beep-ok.mp3'); audio.play().catch(()=>{});
    await refreshDataViews();
    setChangeTick(t => t + 1);
    return true;
  };

  const enqueueScan = (raw: string) => {
    if (isLocked) { const a=new Audio('/beep-error.mp3'); a.play().catch(()=>{}); return; }
    queueRef.current.push(raw); processQueue();
  };
  const processQueue = async () => {
    if (processingRef.current) return; processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const raw = queueRef.current.shift()!;
        await processScan(raw);
      }
    } finally {
      processingRef.current = false;
    }
  };
  const processScan = async (raw: string) => {
    if (!contextReady) { setToast({type:'error', text:'Выберите поставку и короб'}); return; }
    const { type, value } = classifyScan(raw);
    if (type === 'barcode') {
      if (!/^\d+$/.test(value)) { setToast({ type:'error', text:'ШК должен содержать только цифры' }); return; }
      if (withKIZ) setPendingBarcode(value);
      else { await commitRow(value, null); setPendingBarcode(null); }
    } else {
      const norm = normalizeKiz(value);
      if (!withKIZ) { setToast({ type:'error', text:'КИЗ не требуется (чекбокс выключен).' }); return; }
      if (pendingBarcode === null) { setToast({ type:'error', text:'Сначала ШК, затем КИЗ' }); return; }
      const ok = await commitRow(pendingBarcode, norm);
      if (ok) setPendingBarcode(null);
    }
  };

  // Manual input
  const onScanKeyDown: React.KeyboardEventHandler<HTMLInputElement> = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = scan.trim();
      if (!v) return;
      setScan('');
      enqueueScan(v);
    }
  };

  // Delete row
  const onDeleteRow = async (id: string) => {
    if (isLocked) { setToast({ type:'error', text:'Поставка завершена. Удаление запрещено.' }); return; }
    const res = await fetch(`/api/rows/${id}`, { method:'DELETE' });
    const data = await res.json();
    if (!res.ok) { setToast({ type:'error', text: data.error || 'Ошибка удаления' }); return; }
    await refreshDataViews();
    setChangeTick(t => t + 1);
  };

  // Save delivery date
  const saveDeliveryDateInfo = async () => {
    if (!shipmentId) { setToast({ type:'error', text:'Сначала выберите поставку' }); return; }
    const res = await fetch(`/api/shipments/${shipmentId}`, {
      method:'PATCH', headers:{ 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivery_date: deliveryDate || null })
    });
    const data = await res.json();
    if (!res.ok) { setToast({ type:'error', text: data.error || 'Не удалось сохранить дату' }); return; }
    await loadShipmentsFor(warehouse, shipDate);
    setToast({ type:'success', text:'Дата сохранена' });
  };

  // "Все поставки"
  const openAll = async () => {
    const res = await fetch('/api/shipments/all');
    const data = await res.json();
    if (res.ok) setAllShipments(data);
    setAllOpen(true);
  };

  const handlePickShipment = async (s: ShipmentListRow) => {
    setWarehouse(s.warehouse as Warehouse);
    setShipDate(s.shipment_date);
    setShipmentStatus(s.status);
    setDeliveryDate(s.delivery_date ?? null);
    const list = await loadShipmentsFor(s.warehouse as Warehouse, s.shipment_date);
    const exists = list.find(x => x.shipment_id === s.shipment_id);
    if (!exists) setShipmentId(s.shipment_id); else setShipmentId(s.shipment_id);
    await loadBoxes(s.shipment_id);
    setAllOpen(false);
  };

  return (
    <>
      {captureOn && (
        <ScannerCapture
          onScan={({raw}) => { setScanning(false); setScan(''); enqueueScan(raw); }}
          blockTyping={true}
          onProgress={(buf) => { setScan(buf); setScanning(!!buf); }}
        />
      )}

      <div className="p-4 max-w-7xl mx-auto">
        {toast && <Toast type={toast.type} onClose={()=>setToast(null)}>{toast.text}</Toast>}

        {/* Блок 1: фильтры/метаданные */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Склад отгрузки</label>
            <Select value={warehouse} onChange={v=>setWarehouse(v as Warehouse)} options={WAREHOUSES.map(w=>({label:w, value:w}))}/>
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Дата поставки</label>
            <input type="date" className="border rounded px-3 py-2" value={shipDate} onChange={e=>setShipDate(e.target.value)} />
          </div>

          {/* Ряд кнопок: Создать / Все поставки / Завершить|Редактировать / Удалить */}
          <div className="flex items-end gap-2 md:col-span-2 flex-wrap">
            <button onClick={createShipment} className="px-3 py-2 rounded bg-black text-white hover:opacity-90">Создать поставку</button>
            <WBSettings />
            <button onClick={openAll} className="px-3 py-2 rounded border">Все поставки</button>
            {isLocked ? (
              <button onClick={()=>setStatus('draft')} className="px-3 py-2 rounded border text-blue-600 border-blue-600 hover:bg-blue-50">Редактировать поставку</button>
            ) : (
              <button onClick={()=>setStatus('ready')} className="px-3 py-2 rounded bg-green-600 text-white hover:opacity-90">Завершить поставку</button>
            )}
            <button onClick={deleteShipment} className="px-3 py-2 rounded border border-red-600 text-red-600 hover:bg-red-50">Удалить</button>
          </div>

          {/* Список поставок */}
          <div className="flex flex-col md:col-span-2">
            <label className="text-sm text-gray-600 mb-1">Список поставок</label>
            <Select
              placeholder={shipments.length ? 'Выбрать поставку' : 'Поставок нет'}
              value={shipmentId}
              onChange={setShipmentId}
              options={shipments.map(s=>({label:s.label + (s.status!=='draft' ? ` [${s.status}]` : ''), value:s.shipment_id}))}
            />
          </div>

          {/* Дата отгрузки + кнопка "Сохранить дату" справа от поля */}
          <div className="flex items-end gap-2 md:col-span-2">
            <div className="flex flex-col flex-1">
              <label className="text-sm text-gray-600 mb-1">Дата отгрузки</label>
              <input type="date" className="border rounded px-3 py-2 w-full" value={deliveryDate ?? ''} onChange={e=>setDeliveryDate(e.target.value)} disabled={isLocked} />
            </div>
            <button onClick={saveDeliveryDateInfo} className="px-3 py-2 rounded border self-end">Сохранить дату</button>
          </div>

          {/* Короба */}
          <div className="flex items-end gap-2 md:col-span-2">
            <button onClick={createBox} className="px-3 py-2 rounded bg-black text-white hover:opacity-90 disabled:opacity-50" disabled={isLocked || !shipmentId}>Создать короб</button>
            <Select className="min-w-[220px]" placeholder="Выбрать короб" value={boxId} onChange={setBoxId}
                    options={boxes.map(b=>({label:b.label, value:b.box_id}))}
            />
            <button onClick={deleteBox} className="px-3 py-2 rounded border border-red-600 text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={isLocked || !boxId}>Удалить короб</button>
          </div>
        </div>

        {/* Блок 2: скан */}
        <div className={`p-3 rounded-2xl border mb-3`}>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="text-sm text-gray-600 mb-1 block">Скан (резерв/ручной ввод)</label>
              <input
                ref={inputRef}
                value={scan}
                onChange={e=>setScan(e.target.value)}
                onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); const v=scan.trim(); if(v){ setScan(''); enqueueScan(v); }}}}
                className={`border rounded px-3 py-2 w-full ${scanning ? "ring-2 ring-green-400" : ""}`}
                placeholder={isLocked ? "Поставка завершена — сканирование отключено" : "Сканируйте — завершение пакета по Enter"}
                disabled={isLocked}
                lang="en" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              />
              <div className="h-5 text-xs text-gray-500 mt-1 select-none">
                {isLocked ? (
                  <span className="text-red-600">Поставка завершена — редактирование недоступно</span>
                ) : scanning ? (
                  <span className="inline-flex items-center gap-1">Идёт сканирование<span className="inline-block h-2 w-2 bg-green-500 rounded-full animate-pulse"></span></span>
                ) : (
                  <span className="opacity-60">Готово к сканированию</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 md:col-span-2">
              <label className="inline-flex items-center gap-2">
                <input id="withKiz" type="checkbox" checked={withKIZ} onChange={e=>{ setWithKIZ(e.target.checked); setPendingBarcode(null); }} disabled={isLocked}/>
                <span>Товар с КИЗ</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={captureOn} onChange={e=>setCaptureOn(e.target.checked)} />
                <span>Перехват сканера</span>
              </label>
            </div>

            <div className="md:col-span-1 text-sm text-gray-600">
              {withKIZ ? (
                pendingBarcode
                  ? <div className="rounded bg-yellow-50 border border-yellow-200 px-3 py-2">
                      Ждём КИЗ для ШК: <span className="font-mono">{pendingBarcode}</span>
                    </div>
                  : <div className="rounded bg-gray-50 border px-3 py-2">
                      Сначала ШК, затем КИЗ (строго).
                    </div>
              ) : (
                <div className="rounded bg-gray-50 border px-3 py-2">
                  КИЗ не требуется: ШК добавляется сразу.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Таблицы */}
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
            header={['Фото', 'ШК','Артикул WB','Артикул пост.','Размер','КИЗ','Время','—']}
            rows={listing.map(r=>[
            r.thumb_url ? <img key={"img-"+r.id} src={r.thumb_url as string} alt="" className="h-12 w-auto rounded cursor-zoom-in" /> : <>—</>,
            
              r.barcode, r.wb_code??'', r.supplier_code??'', r.size??'', (<div className="max-w-[160px] whitespace-normal break-words leading-tight">{r.kiz_code ?? ''}</div>), new Date(r.created_at).toLocaleString(),
              <button key={`del-${r.id}`} onClick={()=>onDeleteRow(r.id)} className="text-red-600 hover:underline" disabled={isLocked}>Удалить</button>
            ])}
            maxHeightClass="max-h-96"
          />
        </div>

        <div className="mb-6">
          <h2 className="font-semibold mb-2">Сводная по коробу</h2>
          <Table
            header={['Фото','ШК','Артикул WB','Артикул пост.','Размер','Кол-во']}
          rows={summary.map(s=>[
            s.thumb_url ? <img key={'img-bx-'+s.barcode} src={s.thumb_url as string} alt="" className="h-12 w-auto rounded cursor-zoom-in" onClick={()=>{ try{ const u=s.thumb_url as string; if(u) window.open(u as string, '_blank'); }catch(e){} }} /> : <>—</>,
            s.barcode, s.wb_code??'', s.supplier_code??'', s.size??'', s.qty
          ])}
            maxHeightClass="max-h-80"
          />
        </div>

        <div className="mt-6">
          <h2 className="font-semibold mb-2">Сводная по поставке</h2>
          <ShipmentSummary shipmentId={shipmentId} changeTick={changeTick} />
        </div>
      </div>

      {/* Модалка "Все поставки" */}
      <Modal open={allOpen} onClose={()=>setAllOpen(false)} title="Все поставки (последние 500)">
        <div className="overflow-auto max-h-[70vh]">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Склад</th>
                <th className="text-left px-3 py-2">Дата поставки</th>
                <th className="text-left px-3 py-2">Номер</th>
                <th className="text-left px-3 py-2">Дата отгрузки</th>
                <th className="text-left px-3 py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {allShipments.map(s=>(
                <tr key={s.shipment_id} className="hover:bg-gray-50 cursor-pointer"
                    onClick={()=>handlePickShipment(s)}>
                  <td className="px-3 py-2">{s.warehouse}</td>
                  <td className="px-3 py-2">{s.shipment_date}</td>
                  <td className="px-3 py-2">{String(s.number_in_day).padStart(3,'0')}</td>
                  <td className="px-3 py-2">{s.delivery_date ?? ''}</td>
                  <td className="px-3 py-2">{s.status}</td>
                </tr>
              ))}
              {allShipments.length===0 && (
                <tr><td className="px-3 py-6 text-gray-500" colSpan={5}>Нет данных</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
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
