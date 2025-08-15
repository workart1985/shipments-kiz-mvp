'use client';
import { useEffect, useRef } from 'react';

type Props = {
  onScan: (payload: { raw: string }) => void;
  /** Блокировать "пропечатывание" символов в полях ввода (рекомендуется для сканера) */
  blockTyping?: boolean;
  /** Прогресс ввода: текущий буфер (для эха в UI) */
  onProgress?: (buf: string) => void;
};

/** Глобальный перехват "сканер как клавиатура".
 * Копим символы в буфер и завершаем пакет ТОЛЬКО по Enter (CR/LF).
 * Опционально блокируем ввод в инпуты, чтобы символы не летели посимвольно в UI.
 */
export default function ScannerCapture({ onScan, blockTyping = true, onProgress }: Props) {
  const buf = useRef<string>('');

  useEffect(() => {
    const flush = () => {
      const s = buf.current;
      if (s.length) {
        buf.current = '';
        onProgress?.('');
        onScan({ raw: s });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Enter = завершение пакета
      if (e.key === 'Enter') {
        if (blockTyping) e.preventDefault();
        flush();
      }
    };

    const onKeyPress = (e: KeyboardEvent) => {
      // печатные символы копим; не даём им "вставиться" в элементы формы
      if (e.key.length !== 1) return;
      buf.current += e.key;
      onProgress?.(buf.current);
      if (blockTyping) e.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keypress', onKeyPress, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keypress', onKeyPress, true);
    };
  }, [onScan, blockTyping, onProgress]);

  return null;
}
