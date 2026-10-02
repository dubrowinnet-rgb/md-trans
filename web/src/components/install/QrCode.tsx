import { useMemo } from 'react';
import { encode } from 'uqr';

// QR-код одной SVG-фигурой: каждая тёмная клетка — квадрат 1×1 в общем
// контуре, рамка (border) уже входит в матрицу.
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const { n, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      })
    );
    return { n: qr.size, path: d };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR-код: ${value}`}
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
