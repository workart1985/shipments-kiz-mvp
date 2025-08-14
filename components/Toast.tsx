import React, { useEffect } from 'react';

export const Toast: React.FC<{
  type: 'success' | 'error',
  onClose: ()=>void,
  children: React.ReactNode
}> = ({ type, onClose, children }) => {
  useEffect(()=>{
    const t = setTimeout(onClose, 2500);
    return ()=>clearTimeout(t);
  },[onClose]);
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow text-white ${type==='success'?'bg-green-600':'bg-red-600'}`}>
      {children}
    </div>
  );
};