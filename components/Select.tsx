import React from 'react';

export const Select: React.FC<{
  value?: string;
  onChange: (v: string)=>void;
  options: {label:string, value:string}[];
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, options, placeholder='—', className }) => {
  return (
    <select value={value ?? ''} onChange={e=>onChange(e.target.value)}
            className={`border rounded px-3 py-2 ${className??''}`}>
      {!value && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
};