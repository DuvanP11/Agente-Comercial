import { HelpPanel } from "@/components/Insight";

/** Guía de uso de Buscar clientes: cómo se busca, qué hace la IA, qué hacen los filtros y qué se ve y qué no. */
export function SearchHelp() {
  return (
    <HelpPanel title="Cómo funciona esta búsqueda (filtros, IA, qué se ve y qué no)">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-1">
          <h3 className="font-semibold">1. Cómo se busca</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Ciudad</b> y <b>Categorías</b> son obligatorias. Las categorías van separadas por coma (por ejemplo: <i>ferretería, panadería</i>); mejor pocas y concretas.</li>
            <li><b>Localidades o zonas</b> es opcional: acota la búsqueda a un barrio o localidad (Chapinero, Usaquén, Suba…). Si la zona es muy pequeña, puede haber pocos resultados; prueba con la localidad completa.</li>
            <li><b>Excluir si el nombre contiene</b> descarta negocios cuyo nombre incluya esas palabras (por ejemplo cadenas que no te interesan).</li>
            <li><b>Máximo de resultados</b>: de 1 a 60. Más resultados tardan más.</li>
            <li>Cada resultado se compara con tus clientes y prospectos: los repetidos se marcan y no se duplican.</li>
          </ul>
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold">2. Qué hace «Interpretar con IA»</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Lee tu descripción (por ejemplo «cosmética y moda con tienda online en Chapinero y Usaquén») y <b>llena los campos</b> de abajo: ciudad, zonas, categorías y exclusiones.</li>
            <li><b>No busca por sí sola</b>: tú revisas y corriges los campos y luego pulsas Buscar. Debajo aparece una frase con lo que va a buscar.</li>
            <li>Solo cambia un campo si encontró un valor en tu texto; lo que ya escribiste y no se menciona se <b>conserva</b>.</li>
            <li>Usa máximo 3 categorías principales; si entendió más, las deja como <b>sugerencias</b> para agregar con un clic.</li>
            <li>Si la zona que escribes es una localidad de Bogotá, la pone como zona y la ciudad como Bogotá.</li>
            <li>A la IA solo se le envía el texto de la descripción: ningún dato de prospectos ni de clientes.</li>
            <li>Puede equivocarse: por eso siempre se revisa antes de buscar. Si la IA no está configurada, el botón aparece apagado y puedes llenar los campos a mano.</li>
          </ul>
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold">3. Filtros</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>«Solo negocios con teléfono, correo o web»</b> (antes de buscar): le pide a la fuente solo los que tengan alguno de esos datos. En OpenStreetMap son pocos, así que puede devolver menos de lo pedido.</li>
            <li><b>Botones de contacto</b> (después de buscar): Todos, Con algún contacto, Con teléfono, Con correo, Con web. Solo filtran lo que ya está en pantalla; no vuelven a consultar ni borran nada.</li>
            <li>Los resultados con más datos de contacto salen primero.</li>
          </ul>
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold">4. Qué se ve y qué no</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Se ve:</b> nombre, categoría, dirección y, cuando existen en la fuente, teléfono, sitio web y correo. Cada dato queda con su fuente y la fecha de consulta.</li>
            <li><b>No se ve:</b> tamaño del negocio, volumen de envíos, horarios, calificaciones, redes sociales ni si necesita mensajería. Eso se valora después, con evidencia, en Analizar clientes.</li>
            <li><b>OpenStreetMap</b> (gratis) es información colaborativa: encuentra bien nombre y dirección, pero pocos negocios traen teléfono o web. Su servidor público a veces tarda o se satura; la app prueba con otro servidor y avisa si no pudo.</li>
            <li><b>Google Places</b> trae más teléfonos y webs, pero requiere clave y cobra por consulta.</li>
            <li>Lo que no aparece como dato nunca se inventa: queda vacío. «Sin teléfono» significa que la fuente no lo trae, no que el negocio no tenga.</li>
          </ul>
        </section>
        <section className="space-y-1 lg:col-span-2">
          <h3 className="font-semibold">5. Después de buscar</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Analizar resultados con IA</b> lee hasta 8 resultados por clic y propone una lectura (nada se guarda hasta que tú la revisas en Analizar). Si dice «Aún sin prioridad», es porque falta información, no porque sea un mal prospecto.</li>
            <li>Con <b>Ver ficha</b> abres el detalle de un prospecto y puedes volver a esta misma búsqueda sin perder los resultados.</li>
            <li>Si no encuentras teléfonos o webs, puedes completarlos a mano en la ficha o cargar tu propia lista en Importar prospectos.</li>
          </ul>
        </section>
      </div>
    </HelpPanel>
  );
}
