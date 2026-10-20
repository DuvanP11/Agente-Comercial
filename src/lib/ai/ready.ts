import { aiStatus } from "./provider";

/** ¿Hay al menos un proveedor de IA configurado? Para activar o desactivar los botones de IA. */
export function aiReady(): boolean { return aiStatus().state === "connected"; }
