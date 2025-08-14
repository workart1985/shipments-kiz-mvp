import React from 'react';

export const Table: React.FC<{
  header: (string|React.ReactNode)[];
  rows: ( (string|number|React.ReactNode)[] )[];
  maxHeightClass?: string; // например, 'max-h-96' (24rem) или 'max-h-80'
}> = ({ header, rows, maxHeightClass = 'max-h-96' }) => {
  return (
    <div className="border rounded-2xl">
      <div className={`overflow-x-auto ${maxHeightClass} overflow-y-auto rounded-2xl`}>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100/70 sticky top-0">
            <tr>
              {header.map((h,i)=>(<th key={i} className="text-left px-3 py-2 font-medium">{h}</th>))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,ri)=>(
              <tr key={ri} className="hover:bg-gray-50">
                {r.map((c,ci)=>(<td key={ci} className="px-3 py-2 align-top">{c}</td>))}
              </tr>
            ))}
            {rows.length===0 && (
              <tr><td className="px-3 py-3 text-gray-500" colSpan={header.length}>Нет данных</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
