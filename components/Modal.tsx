'use client';
import React from 'react';

export default function Modal({
  open, onClose, children, title
}: { open: boolean; onClose: ()=>void; children: React.ReactNode; title?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-10 -translate-x-1/2 w-[min(100%,900px)]">
        <div className="bg-white rounded-2xl shadow-xl border">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="font-semibold">{title}</div>
            <button className="text-gray-500 hover:text-black" onClick={onClose}>✕</button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
