import { useEffect, useState } from 'react';

// Relógio que "anda": reavalia a cada `ms` (padrão 1 min). Sem ele, "há 11 h" ficaria parado
// e um empréstimo só viraria "atrasado" quando algum dado mudasse.
export function useNow(ms = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
