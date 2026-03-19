import { useState, useEffect } from 'react';
import { getCargos } from '../services/cargosService';

interface Cargo {
  id: number;
  nome: string;
}

const useCargos = () => {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCargos = async () => {
      try {
        const data = await getCargos();
        setCargos(data);
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar cargos');
      } finally {
        setLoading(false);
      }
    };

    fetchCargos();
  }, []);

  return { cargos, loading, error };
};

export default useCargos;
