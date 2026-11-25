import { createContext, useContext, useReducer } from "react";

export const Borradores = createContext(null);

export function useBorrador(modulo, clave, inicial, tieneCambios = Boolean) {
  const borradores = useContext(Borradores);
  const [, actualizar] = useReducer((numero) => numero + 1, 0);
  const id = `${modulo}:${clave}`;
  const valor = borradores.has(id) ? borradores.get(id).valor : inicial;

  function cambiar(cambio) {
    const actual = borradores.has(id) ? borradores.get(id).valor : inicial;
    const siguiente = typeof cambio === "function" ? cambio(actual) : cambio;
    borradores.set(id, { modulo, valor: siguiente, pendiente: tieneCambios(siguiente) });
    actualizar();
  }

  function descartar() {
    borradores.delete(id);
    actualizar();
  }

  return [valor, cambiar, descartar];
}
