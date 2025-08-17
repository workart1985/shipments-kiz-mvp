export type Warehouse =
  | 'Черновик'
  | 'Коледино'
  | 'Тула'
  | 'Электросталь'
  | 'Казань'
  | 'Сарапул';

export const WAREHOUSES: Warehouse[] = [
  'Черновик','Коледино','Тула','Электросталь','Казань','Сарапул'
];

export type ListingRow = {
  id: string;
  shipment_id: string;
  box_id: string | null;
  barcode: string;
  wb_code: string | null;
  supplier_code: string | null;
  size: string | null;
  kiz_code: string | null;
  created_at: string;
  thumb_url?: string | null;
};

export type BoxSummaryRow = { 
  box_id: string;
  barcode: string;
  wb_code: string | null;
  supplier_code: string | null;
  size: string | null;
  thumb_url?: string | null;
  qty: number;
};

export type ShipmentSummaryRow = { 
  shipment_id: string;
  barcode: string;
  wb_code: string | null;
  supplier_code: string | null;
  size: string | null;
  thumb_url?: string | null;
  qty: number;
};
