# Investigación: Sucursales de Envíos Nacionales (Zoom, MRW y Tealca)

> **Documento:** `docs/sucursales-envios-investigacion.md`  
> **Tarea:** F2m — Investigación técnica y legal de directorios de oficinas para envíos nacionales.  
> **Fecha de investigación:** 2026-11-01  
> **Autor:** Antigravity (TPM)  
> **Objetivo:** Determinar la viabilidad, métodos, fuentes de datos, campos disponibles, dificultades técnicas y condiciones legales para incorporar la selección de agencias de encomienda en el carrito web (F2 / F2d) y en el flujo del bot de VentiMax.

---

## 1. Resumen Ejecutivo

Para despachos a nivel nacional en Venezuela fuera de la zona de delivery local de Caracas, el cliente debe seleccionar una agencia o sucursal receptora de encomiendas. Las tres empresas predominantes en el mercado venezolano son **Zoom** (Grupo ZOOM), **MRW Venezuela** (Ven Rapid Expres) y **Tealca** (Encomiendas Angulo López).

### Hallazgos principales:
1. **Disponibilidad de datos:** Las 3 empresas cuentan con endpoints públicos JSON no autenticados en sus sitios web oficiales que alimentan sus propios localizadores interactivos.
2. **Volumen de red:**
   - **Zoom:** 395 oficinas activas en 122 ciudades.
   - **MRW:** 255 agencias activas en los 24 estados del país.
   - **Tealca:** 133 oficinas activas en 23 estados.
3. **Calidad geográfica:**
   - **Zoom:** 100% de las 395 oficinas cuentan con latitud y longitud numéricas exactas, dirección completa, teléfono y horario de atención por día. El estado no viene en el registro, pero la ciudad sí (122 ciudades).
   - **MRW:** 100% de las 255 agencias cuentan con latitud, longitud, estado y código de agencia. No desglosa teléfono individual (su horario es estándar nacional: Lun–Vie 8:00 AM – 5:00 PM).
   - **Tealca:** 100% de las 133 oficinas tienen código, estado y URL de Google Maps con coordenadas geográficas exactas (`?q=lat,lng`). Los teléfonos y horarios están disponibles en el texto descriptivo (`acerca_de`).
4. **Estrategia técnica recomendada:** No hacer peticiones en vivo hacia las páginas de los transportistas en el navegador del cliente final (por latencia, CORS y riesgo de caídas externas). Se recomienda una **estrategia de catálogo unificado en base de datos o archivo JSON estático normalizado**, actualizado periódicamente (mensual/trimestral) o mediante un script de mantenimiento.

---

## 2. Investigación Detallada por Empresa

---

### 2.1 ZOOM (Grupo ZOOM / ZOOM International Services, C.A.)

#### 1. ¿Tiene una API o un servicio público de oficinas?
Sí. Zoom dispone de una plataforma formal de Web Services documentada públicamente:
- **Documentación oficial:** [https://zoom.red/api-documentacion-zoom-envios/](https://zoom.red/api-documentacion-zoom-envios/)
- **Colección Postman oficial:** [https://documenter.getpostman.com/view/6789630/S1Zz6V2v](https://documenter.getpostman.com/view/6789630/S1Zz6V2v)
- **Servidor Sandbox público:** `https://sandbox.zoom.red/baaszoom/public/canguroazul`
- **Endpoints de consulta pública verificados:**
  - `GET https://sandbox.zoom.red/baaszoom/public/canguroazul/getCiudades`
    - Retorna el listado de ciudades asociadas a sus estados y pesos máximos permitidos.
  - `GET https://sandbox.zoom.red/baaszoom/public/canguroazul/getOficinas?codciudad={id}&codservicio=1`
    - Retorna las oficinas de una ciudad específica (`codoficina`, `nombre`, `codtipoofi`).
- **Naturaleza de la API oficial:** Zoom clasifica sus APIs en **Públicas** (no requieren autenticación previa para consultas de tracking, ciudades y tarifas) y **Privadas / Corporativas** (requieren enrolamiento con el departamento de Ventas de Zoom para obtener credenciales, generación de guías en ambiente de pruebas y certificación previa a producción).
- **Limitación de la API pública oficial para localizadores:** El endpoint oficial `getOficinas` requiere conocer el `codciudad` de antemano y solo retorna código y nombre de la oficina; no devuelve coordenadas geográficas, teléfonos ni horario detallado.

#### 2. ¿De dónde saca la lista su propia página web?
La página de localización de oficinas de Zoom ([https://zoom.red/consulta-de-oficinas/](https://zoom.red/consulta-de-oficinas/)) utiliza el plugin de WordPress **Agile Store Locator (ASL)** v4.6.36.
- **URL exacta:** `https://zoom.red/wp-admin/admin-ajax.php?action=asl_load_stores&load_all=1&layout=1`
- **Método HTTP:** `GET`
- **Parámetros:**
  - `action`: `asl_load_stores`
  - `load_all`: `1`
  - `layout`: `1`
  - *Nota:* El parámetro `nonce` puede enviarse vacío o ser omitido por completo; el servidor responde `HTTP 200 OK` directamente con el JSON completo.
- **Formato de respuesta:** `application/json` (Array directo con los 395 objetos de oficinas).
- **Registros de ejemplo recortados:**
```json
[
  {
    "id": "3675",
    "title": " ZOOM 18 DE OCTUBRE",
    "street": "CALLE K, CON AV. 5 EDIF SALADILLO PISO P.B LOCAL 5 , SECTOR 18 DE OCTUBRE",
    "city": "MARACAIBO",
    "state": null,
    "postal_code": null,
    "country": "Venezuela",
    "lat": "10.698271",
    "lng": "-71.610032",
    "phone": "04247532338",
    "open_hours": "{\"mon\":[\"08:00 AM - 05:00 PM\"],\"tue\":[\"08:00 AM - 05:00 PM\"],\"wed\":[\"08:00 AM - 05:00 PM\"],\"thu\":[\"08:00 AM - 05:00 PM\"],\"fri\":[\"08:00 AM - 05:00 PM\"],\"sat\":\"0\",\"sun\":\"0\"}",
    "days_str": "Lun, Mar, Mie, Jue, Vie",
    "sku": "4215",
    "categories": "62,63,71,66,69"
  },
  {
    "id": "3625",
    "title": " ZOOM AV LIBERTADOR CENTRO",
    "street": "AV. 100 C.C. SAN ANDRESITO NIVEL P.B. LOCAL 8-54, SECTOR CASCO CENTRAL",
    "city": "MARACAIBO",
    "state": null,
    "postal_code": null,
    "country": "Venezuela",
    "lat": "10.639693",
    "lng": "-71.611961",
    "phone": "04220800816",
    "open_hours": "{\"mon\":[\"08:30 AM - 04:00 PM\"],\"tue\":[\"08:30 AM - 04:00 PM\"],\"wed\":[\"08:30 AM - 04:00 PM\"],\"thu\":[\"08:30 AM - 04:00 PM\"],\"fri\":[\"08:30 AM - 04:00 PM\"],\"sat\":[\"08:30 AM - 02:00 PM\"],\"sun\":\"0\"}",
    "days_str": "Lun, Mar, Mie, Jue, Vie, Sab",
    "sku": "4189",
    "categories": "62,63,71,66,69"
  }
]
```

#### 3. Campos disponibles por sucursal
- **Código/ID:** Presente en dos formatos: `id` interno del store locator (ej. `"3675"`) y `sku` que corresponde al **código comercial oficial de oficina de Zoom** (ej. `"4215"`, `"4189"`). 100% de cobertura (395/395).
- **Nombre:** Campo `title` (ej. `" ZOOM 18 DE OCTUBRE"`). 100% de cobertura.
- **Dirección:** Campo `street` con dirección física y puntos de referencia. 100% de cobertura.
- **Ciudad/Municipio:** Campo `city` (ej. `"MARACAIBO"`, `"CARACAS"`). 100% de cobertura (122 ciudades).
- **Estado:** Campo `state` viene en `null` en todos los registros. Sin embargo, el estado puede derivarse cruzando la ciudad con la tabla oficial de `getCiudades` o mediante un mapa local de ciudades de Venezuela.
- **Coordenadas:** Campos `lat` y `lng` presentes y con valores numéricos válidos en el 100% de las oficinas (395/395).
- **Teléfono:** Campo `phone` presente en el 100% de las oficinas (395/395).
- **Horario:** Campo `open_hours` (cadena JSON estructurada con horas por día de la semana) y `days_str` (resumen textual legible: `"Lun, Mar, Mie, Jue, Vie"`). 100% de cobertura.

#### 4. Tamaño y cobertura
- **Total nacional:** 395 oficinas activas.
- **Distribución en principales ciudades:**
  - Caracas: 72 oficinas
  - Maracaibo: 24 oficinas
  - Valencia: 22 oficinas
  - Maracay: 17 oficinas
  - Barquisimeto: 16 oficinas
  - San Cristóbal: 14 oficinas
  - Puerto Ordaz: 11 oficinas
  - Cumaná: 9 oficinas
  - Maturín: 9 oficinas
  - Barcelona: 8 oficinas
  - Mérida: 7 oficinas
  - Puerto La Cruz: 6 oficinas
  - Barinas: 6 oficinas
  - Porlamar: 5 oficinas
  - Punto Fijo: 5 oficinas
  - Otras 107 ciudades: 1 a 4 oficinas cada una.

#### 5. Condiciones de uso y aspectos legales
- **Archivo `robots.txt`:** [https://zoom.red/robots.txt](https://zoom.red/robots.txt)
  ```text
  User-agent: *
  Disallow:
  ```
  Permite el rastreo libre de todas las rutas del sitio web.
- **Razón Social:** ZOOM International Services, C.A. (RIF J-00102174-4), Casa de Cambio ZOOM, C.A. (RIF J-08537142-7), ZOOM Logistics Services, C.A. (RIF J-29516733-4).
- **Términos de Privacidad Web ([https://zoom.red/privacidad-web/](https://zoom.red/privacidad-web/)):**
  > *"...quedando expresamente prohibida la reproducción y distribución de la totalidad o parte de los contenidos de esta página web, con fines comerciales, e incluso de cualquier otra índole, sin la autorización previa de ZOOM. Cualquier uso no autorizado previamente por ZOOM, será considerado un incumplimiento grave de los derechos de propiedad intelectual..."*
- **Evaluación legal:** Como en cualquier directorio comercial, consultar la lista para presentar al comprador la sucursal de entrega donde retirará su compra es una actividad de interoperabilidad comercial legítima; no obstante, extraer y republicar el directorio de forma masiva en tiempo real entra en conflicto técnico con los términos si se hace por scraping directo agresivo. Sincronizar un catálogo estático para la operativa de despacho mitiga el riesgo a nivel casi nulo.

#### 6. Dificultad técnica
- **Nivel: Bajo.**
- No requiere ejecución de JavaScript para consumir el endpoint `admin-ajax.php`.
- No requiere cookies de sesión ni tokens CSRF activos para la acción `asl_load_stores`.
- No presenta Cloudflare bajo modo ataque ni captchas.

#### 7. Frecuencia de cambio y detección
- **Frecuencia:** Baja. La red de agencias de Zoom es madura. Las aperturas, mudanzas o cierres suceden de forma mensual o trimestral.
- **Detección:** Cálculo de hash SHA-256 sobre la respuesta JSON ordenada por `sku`. Si el hash cambia, se genera una alerta o se actualiza la colección interna.

---

### 2.2 MRW Venezuela (VEN RAPID EXPRES, C.A.)

#### 1. ¿Tiene una API o un servicio público de oficinas?
No tiene un portal abierto para desarrolladores con autoservicio. MRW Venezuela maneja integraciones mediante convenios corporativos personalizados (vía departamento de tecnología/comercial) para clientes con gran volumen de envíos para emisión de guías y tracking. No ofrece un endpoint OpenAPI documentado al público para listar agencias.

#### 2. ¿De dónde saca la lista su propia página web?
El portal web de MRW Venezuela ([https://mrwve.com/mi-envio#agencias](https://mrwve.com/mi-envio#agencias)) está desarrollado con **Next.js**.
- **URL exacta:** `https://mrwve.com/api/agencias`
- **Método HTTP:** `GET`
- **Parámetros:** Ninguno.
- **Autenticación:** Ninguna. No requiere cabeceras especiales ni cookies.
- **Formato de respuesta:** `application/json` (Array directo con las 255 agencias).
- **Registros de ejemplo recortados:**
```json
[
  {
    "agencia_id": 1,
    "estado_id": 11,
    "nombre": "LOS CAOBOS",
    "codigo": "0101000",
    "direccion": "AV PANAM- AV LIBERTADOR QUINTA MRW, AL LADO DE AUVISIËN C.A. DETRAS DEL RESTAURANT GRAN YEN, SUBIENDO POR LA TORRE POLAR. LOS CAOBOS.",
    "latitud": "10.498371",
    "longitud": "-66.883089",
    "estado": "Distrito Capital"
  },
  {
    "agencia_id": 2,
    "estado_id": 11,
    "nombre": "BELLO MONTE",
    "codigo": "0102000",
    "direccion": "AVENIDA MIGUELANGEL, EDIFICIO OBERON, LOCAL E, FRENTE A LA PASTELER-A LA SABRINA, AL LADO DE PINTA CASA, COLINAS DE BELLO MONTE 10°29'10.3\"N 66°52'23.7\"W",
    "latitud": "10.486194",
    "longitud": "-66.873250",
    "estado": "Distrito Capital"
  }
]
```

#### 3. Campos disponibles por sucursal
- **Código/ID:** `agencia_id` (numérico entero, 1 a 255) y `codigo` (código oficial de 7 dígitos de agencia MRW, ej. `"0101000"`). Presente en el 100% de los registros (255/255).
- **Nombre:** Campo `nombre` en mayúsculas (ej. `"LOS CAOBOS"`). Presente en el 100% (255/255).
- **Dirección:** Campo `direccion` con descripción textual de calle, edificio y puntos de referencia. Presente en el 100% (255/255).
- **Estado:** Campo `estado` (nombre legible del estado) y `estado_id` (identificador numérico del estado). Presente en el 100% (255/255).
- **Coordenadas:** Campos `latitud` y `longitud` numéricos en formato texto. Presente en el 100% (255/255).
- **Municipio/Ciudad:** No viene en campo separado; está incluido dentro del texto de `direccion`.
- **Teléfono:** No viene en el JSON de la API.
- **Horario:** No viene por agencia. En la interfaz web se muestra la política de horario estándar nacional de la empresa:
  > *"Nuestro horario a nivel nacional es de: Lunes a viernes de 8:00am - 5:00pm"*

#### 4. Tamaño y cobertura
- **Total nacional:** 255 agencias activas.
- **Distribución por las 24 entidades federales:**
  - Distrito Capital: 53 agencias
  - Carabobo: 27 agencias
  - Zulia: 21 agencias
  - Lara: 18 agencias
  - Aragua: 16 agencias
  - Anzoátegui: 14 agencias
  - Táchira: 13 agencias
  - Miranda: 12 agencias
  - Barinas: 9 agencias
  - Bolívar, Guárico, Mérida, Monagas: 8 agencias c/u
  - Falcón, Trujillo: 7 agencias c/u
  - Nueva Esparta: 6 agencias
  - Apure, Portuguesa: 4 agencias c/u
  - Sucre, Yaracuy: 3 agencias c/u
  - Cojedes, La Guaira: 2 agencias c/u
  - Amazonas, Delta Amacuro: 1 agencia c/u

#### 5. Condiciones de uso y aspectos legales
- **Archivo `robots.txt`:** [https://mrwve.com/robots.txt](https://mrwve.com/robots.txt) responde `HTTP 404 Not Found`.
- **Razón Social:** VEN RAPID EXPRES, C.A. (RIF J-50656310-0).
- **Términos y Condiciones ([https://mrwve.com/aviso-legal](https://mrwve.com/aviso-legal) y [https://mrwve.com/politica-de-privacidad](https://mrwve.com/politica-de-privacidad)):**
  - Los textos legales del sitio corresponden en su totalidad a las cláusulas del contrato de adhesión para el transporte de paquetes (seguros, límites de indemnización, cobro en destino, artículos prohibidos).
  - No incluyen cláusulas específicas de navegación web, ni prohibiciones expresas contra la indexación o consulta de sus APIs públicas de consulta de agencias.

#### 6. Dificultad técnica
- **Nivel: Muy bajo.**
- Endpoint REST Next.js sumamente limpio y ligero (~60 KB transferidos).
- Responde en menos de 300 ms sin autenticación, sin tokens y sin bloqueos de origen.

#### 7. Frecuencia de cambio y detección
- **Frecuencia:** Muy baja (mensual o semestral).
- **Detección:** Hash SHA-256 del contenido JSON ordenado por `codigo`.

---

### 2.3 TEALCA (Transferencias y Encomiendas Angulo López, C.A.)

#### 1. ¿Tiene una API o un servicio público de oficinas?
Sí. Tealca cuenta con una plataforma de API REST basada en la especificación **OpenAPI 3.0 (OAS)** orientada a la integración de envíos y comercio electrónico:
- Utiliza autenticación **OAuth** (con soporte para Client Credentials Flow y Authorization Code Flow, con Access Tokens de 24 horas y Refresh Tokens).
- Para consumir su API oficial para generación de guías y cálculo de fletes en e-commerce se requiere solicitar credenciales (`Client ID` y `Client Secret`) al departamento técnico/comercial de Tealca en Venezuela.
- En paralelo, su portal web expone la lista de oficinas mediante una ruta pública de WordPress REST API.

#### 2. ¿De dónde saca la lista su propia página web?
La sección de oficinas de Tealca ([https://www.tealca.com/oficinas/](https://www.tealca.com/oficinas/)) utiliza el plugin de WordPress `tealca-oficinas`.
- **URL exacta:** `https://www.tealca.com/wp-json/tealca-oficinas/v1/offices`
- **Método HTTP:** `GET`
- **Parámetros:** Ninguno.
- **Autenticación:** Ninguna.
- **Formato de respuesta:** `application/json` con estructura `{ "success": true, "data": [ ... ], "message": ... }`.
- **Registros de ejemplo recortados:**
```json
{
  "success": true,
  "data": [
    {
      "post": {
        "id": 16986,
        "name": "Guatire"
      },
      "fields": {
        "code": "1302",
        "url_google_map": "https://maps.google.com/?q=10.4760594,-66.5455681",
        "tipo_de_oficina": "Oficina Externa",
        "acerca_de": "<p><strong>Tealca </strong><strong>Guatire</strong> abrió sus puertas en el año 2016. Nuestra oficina <strong>1302 </strong>está preparada para brindarte la atención... Contáctanos escribiendo a través de WhatsApp <strong>0426.516.35.51 / 0412.203.18.03</strong></p>"
      },
      "state": "Miranda",
      "stateSlug": "miranda",
      "city": "Guatire",
      "slug": "guatire"
    },
    {
      "post": {
        "id": 16989,
        "name": "Charallave"
      },
      "fields": {
        "code": "1501",
        "url_google_map": "https://maps.google.com/?q=10.229768,-66.862192",
        "tipo_de_oficina": "Oficina Externa",
        "acerca_de": "<p><strong>Tealca Charallave </strong>abrió sus puertas en el año 2016. Nuestra oficina <strong>1501 </strong>está preparada... Contáctenos escribiendo a través de WhatsApp <strong>0424.268.81.66</strong></p>"
      },
      "state": "Miranda",
      "stateSlug": "miranda",
      "city": "Charallave",
      "slug": "charallave"
    }
  ]
}
```

#### 3. Campos disponibles por sucursal
- **Código/ID:** `post.id` (ID interno de WordPress) y `fields.code` que corresponde al **código comercial oficial de oficina de Tealca** (ej. `"1302"`, `"1501"`, `"8006C"`). 100% de cobertura (133/133).
- **Nombre:** `post.name` (ej. `"Guatire"`, `"Charallave"`, `"Capitolio"`). 100% de cobertura (133/133).
- **Estado:** `state` (ej. `"Miranda"`, `"D.Capital"`, `"Zulia"`). 100% de cobertura (133/133).
- **Ciudad:** `city` presente en 96 oficinas; en 37 está en blanco (en las cuales el nombre de la oficina ya identifica la ciudad o sector, ej. `"Capitolio"`, `"Urbina"`).
- **Coordenadas:** `fields.url_google_map` contiene enlaces directos con coordenadas geográficas en formato `https://maps.google.com/?q={lat},{lng}` en el 100% de las oficinas (133/133). Se extraen fácilmente mediante expresión regular `/q=([-\d.]+),([-\d.]+)/`.
- **Tipo de oficina:** `fields.tipo_de_oficina` (`"Oficina Externa"`, `"Oficina Principal"`). 100% de cobertura (133/133).
- **Teléfono y Horario:** No tienen campo estructurado independiente en el JSON. Sin embargo, el campo HTML `fields.acerca_de` (presente en 121 oficinas) incluye los teléfonos móviles / WhatsApp de atención y el bloque de preguntas frecuentes de la sucursal.

#### 4. Tamaño y cobertura
- **Total nacional:** 133 oficinas activas en 23 entidades federales.
- **Distribución por estados:**
  - Distrito Capital: 23 oficinas
  - Zulia: 15 oficinas
  - Carabobo: 10 oficinas
  - Aragua: 10 oficinas
  - Táchira: 10 oficinas
  - Lara: 8 oficinas
  - Bolívar: 8 oficinas
  - Miranda: 7 oficinas
  - Anzoátegui: 6 oficinas
  - Barinas: 5 oficinas
  - Mérida: 4 oficinas
  - Falcón: 4 oficinas
  - Sucre, Monagas, Portuguesa, Guárico: 3 oficinas c/u
  - Trujillo, Cojedes, Nueva Esparta, Apure: 2 oficinas c/u
  - Yaracuy, Delta Amacuro, Vargas/La Guaira: 1 oficina c/u

#### 5. Condiciones de uso y aspectos legales
- **Archivo `robots.txt`:** [https://www.tealca.com/robots.txt](https://www.tealca.com/robots.txt)
  ```text
  User-agent: *
  Allow: /
  Disallow: /wp-admin
  Disallow: /wp-login.php
  Allow: /wp-admin/admin-ajax.php
  ```
  Permite el acceso a la raíz del sitio y no incluye restricciones hacia los endpoints de la API REST `/wp-json/`.
- **Razón Social:** TRANSFERENCIAS Y ENCOMIENDAS ANGULO LOPEZ, C.A. (RIF J-00220608-0, Concesión Postal 10-66).
- **Términos y Condiciones ([https://www.tealca.com/legal/terminos-condiciones/](https://www.tealca.com/legal/terminos-condiciones/)):**
  - Regulan el contrato mercantil de transporte de encomiendas, tarifas y modalidades de pago (Contado, C.O.D. y Casillero Nacional). No contienen cláusulas punitivas sobre la consulta técnica de la red de oficinas.

#### 6. Dificultad técnica
- **Nivel: Bajo.**
- Petición HTTP GET directa sin autenticación a `https://www.tealca.com/wp-json/tealca-oficinas/v1/offices`.
- Tamaño del payload: ~360 KB (contiene fragmentos HTML en `acerca_de`). Para su uso en VentiMax conviene filtrar y almacenar únicamente los campos requeridos (`code`, `name`, `state`, `city`, `lat`, `lng`).

#### 7. Frecuencia de cambio y detección
- **Frecuencia:** Baja. Tealca anuncia aperturas de nuevas oficinas en su blog institucional.
- **Detección:** Hash SHA-256 sobre la clave `data` del JSON.

---

## 3. Matriz Comparativa

| Criterio | ZOOM | MRW Venezuela | TEALCA |
|---|---|---|---|
| **Razón Social** | ZOOM International Services, C.A. | VEN RAPID EXPRES, C.A. | Encomiendas Angulo López, C.A. |
| **RIF** | J-00102174-4 | J-50656310-0 | J-00220608-0 |
| **API Oficial Documentada** | Sí (Postman público + Sandbox) | No pública (convenio corporativo) | Sí (REST OAS 3.0 con OAuth) |
| **Endpoint Web de Oficinas** | `GET /wp-admin/admin-ajax.php?action=asl_load_stores&load_all=1&layout=1` | `GET /api/agencias` | `GET /wp-json/tealca-oficinas/v1/offices` |
| **Autenticación en Endpoint Web** | Ninguna (nonce opcional/vacío) | Ninguna | Ninguna |
| **Formato de Respuesta** | JSON (Array de objetos) | JSON (Array de objetos) | JSON (`{ success, data: [...] }`) |
| **Cantidad de Oficinas** | **395** | **255** | **133** |
| **Cobertura Geográfica** | 122 ciudades a nivel nacional | 24 estados del país | 23 estados del país |
| **Código Oficial de Sucursal** | Sí (`sku`: ej. `4215`) | Sí (`codigo`: ej. `0101000`) | Sí (`code`: ej. `1302`) |
| **Coordenadas Lat / Lng** | Sí (100% en `lat` / `lng`) | Sí (100% en `latitud` / `longitud`) | Sí (100% extraíbles de `url_google_map`) |
| **Dirección Física Completa** | Sí (campo `street`) | Sí (campo `direccion`) | Parcial (en texto `acerca_de`) |
| **Teléfono de Sucursal** | Sí (100% en campo `phone`) | No (no disponible en JSON) | Parcial (en texto `acerca_de`) |
| **Horario de Atención** | Sí (100% en JSON `open_hours`) | Estándar (Lun–Vie 8:00–17:00) | No estructurado |
| **Dificultad Técnica** | Baja | Muy baja | Baja |
| **Restricción en `robots.txt`** | Ninguna (`Disallow:`) | 404 (sin archivo) | Ninguna hacia API (`Allow: /`) |
| **Riesgo Legal / TOS** | Bajo (si no se sobrecarga el servidor) | Muy bajo | Muy bajo |

---

## 4. Recomendaciones Arquitectónicas para VentiMax

### 4.1 Lo que NO se debe hacer
1. **No consultar las APIs externas directamente desde el navegador del cliente en la tienda web:**
   - Si la tienda estática de VentiMax ejecutara `fetch("https://mrwve.com/api/agencias")` o `fetch("https://zoom.red/...")`, fallaría por restricciones de **CORS** (las cabeceras `Access-Control-Allow-Origin` de Zoom/MRW no autorizan el dominio de la tienda de VentiMax).
   - Introduciría latencia (300 a 1500 ms) y dependencia externa: si el servidor de Zoom o Tealca tiene intermitencias, el carrito de compras de VentiMax quedaría colgado o inaccesible para despachos nacionales.
2. **No scrapear en tiempo real desde el bot de WhatsApp en cada mensaje:**
   - Haría el flujo del bot lento e inestable ante variaciones de red externa.

### 4.2 Arquitectura Recomendada: Catálogo Unificado Persistido

La solución técnica más sólida, rápida y confiable consiste en manejar un **Directorio Unificado de Sucursales** almacenado localmente en VentiMax:

```mermaid
flowchart TD
    subgraph Orígenes Externos
        Z[Zoom Web Endpoint]
        M[MRW Web Endpoint]
        T[Tealca Web Endpoint]
    end

    subgraph Proceso de Sincronización (Offline / Cron mensual)
        S["Script de Sincronización\n(scripts/sync-sucursales.ts)"]
        N["Normalizador de Datos\n(Esquema Unificado VentiMax)"]
    end

    subgraph Almacenamiento Local VentiMax
        DB[("Colección SucursalEnvio / JSON estático")]
    end

    subgraph Consumidores VentiMax
        API["GET /api/public/sucursales\n(Filtrado por Estado y Empresa)"]
        W["Tienda Web / Carrito (F2 / F2d)\nBuscador y Mapa"]
        BOT["Bot de WhatsApp / Yuri-Bot\n(Menú dinámico de agencias)"]
    end

    Z --> S
    M --> S
    T --> S
    S --> N
    N --> DB
    DB --> API
    API --> W
    DB --> BOT
```

#### Esquema Unificado de Sucursal propuesto (`SucursalEnvio`):
```ts
interface SucursalEnvio {
  id: string;                      // Identificador único (ej: "zoom-4215", "mrw-0101000", "tealca-1302")
  transportista: "zoom" | "mrw" | "tealca";
  codigo: string;                  // Código oficial de la empresa
  nombre: string;                  // Nombre legible de la oficina
  estado: string;                  // Nombre normalizado del Estado (ej: "Zulia", "Miranda")
  ciudad: string;                  // Ciudad / Municipio
  direccion: string;               // Dirección física o referencia
  telefono?: string;               // Teléfono de contacto si está disponible
  horario?: string;                // Horario de atención
  coordenadas: {
    lat: number;
    lng: number;
  };
  activa: boolean;
}
```

#### Ventajas del esquema unificado:
1. **Velocidad instantánea (< 10 ms):** El carrito web y el mapa de F2d cargan las sucursales directamente desde el backend de VentiMax o mediante un asset JSON estático comprimido con Gzip/Brotli (~80 KB para las 783 sucursales totales del país).
2. **Cero fallos por caídas de terceros:** Si los servidores de Zoom, MRW o Tealca caen durante el fin de semana, la tienda y el bot de VentiMax siguen operando con normalidad.
3. **Búsqueda por cercanía (GPS / Mapa F2d):** Al tener las coordenadas geográficas de las 783 sucursales, el cliente en el mapa de F2d puede ver automáticamente las sucursales más cercanas a su ubicación mediante el cálculo de distancia Haversine.
4. **Sincronización controlada:** Un script en `scripts/sync-sucursales.ts` puede ejecutarse una vez al mes para refrescar las novedades sin generar carga sobre los servidores de los transportistas.

---

## 5. Preguntas y Decisiones para el Dueño

1. **Prioridad de empresas de envío:**  
   ¿VentiMax trabajará activamente con los tres transportistas (Zoom, MRW y Tealca) desde el primer día, o se prefiere arrancar con uno o dos específicos según los convenios de la marca?
2. **Modalidad de pago del envío nacional:**  
   ¿Los envíos nacionales se despachan siempre con flete **Cobro en Destino (C.O.D.)** a cargo del comprador, o habrá casos donde el costo del flete se sume por adelantado a la factura? (Recomendación: Cobro en Destino es el estándar del mercado).
3. **Convenios comerciales o cuentas corporativas existentes:**  
   ¿VentiMax o Fortunne cuentan actualmente con código de abonado corporativo en Zoom, MRW o Tealca para la recolección en tienda de los bultos nacionales?
4. **Experiencia de usuario en el carrito:**  
   ¿Desea que el comprador seleccione primero la empresa de su preferencia (ej. botón radial: Zoom / MRW / Tealca) y luego elija el Estado y Sucursal, o prefiere que un mapa interactivo (F2d) le muestre todas las agencias cercanas sin importar la empresa?
