import { explainError } from "./error-info";

/**
 * Envuelve una acción del servidor llamada desde la pantalla: si la petición falla (el servidor la cortó por tardar demasiado,
 * se perdió la conexión, la pestaña es de una versión anterior…), en vez de romper la página se devuelve un estado de error
 * con un mensaje claro. Esto NO oculta errores del servidor: los que la acción devuelve normalmente pasan intactos.
 */
export function describeActionFailure(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const info = explainError(msg);
  if (info.likelyStale) return "La aplicación se actualizó mientras tenías esta pestaña abierta. Recarga la página (Cmd+Mayús+R) e intenta de nuevo.";
  if (/unexpected response|fetch|network|load failed|connection|timeout|aborted/i.test(msg))
    return "El servidor tardó demasiado o se cortó la conexión (las búsquedas largas se cortan a los ~60 s). Tus datos están a salvo: revisa «Base de prospectos» por si alcanzó a guardar algo, o reintenta con menos zonas o rubros.";
  return "No se pudo completar la acción. Reintenta; si se repite, recarga la página.";
}

export function guardAction<A extends unknown[], S>(action: (...args: A) => Promise<S>, toErrorState: (message: string) => S): (...args: A) => Promise<S> {
  return async (...args: A) => {
    try { return await action(...args); }
    catch (e) { return toErrorState(describeActionFailure(e)); }
  };
}
