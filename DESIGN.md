---
name: Tienda pública (plantilla multimarca)
description: Tienda en línea estándar con acabado de primera; precio grande y honesto, foto limpia y cierre por WhatsApp.
colors:
  marca-primario: "var(--primary-color)"
  accion: "color-mix(in srgb, var(--primary-color) 78%, #000)"
  accion-hover: "color-mix(in srgb, var(--primary-color) 64%, #000)"
  accion-suave: "color-mix(in srgb, var(--primary-color) 10%, #fff)"
  wa: "#0e7a3e"
  wa-hover: "#0b6833"
  fondo: "#f2f3f3"
  superficie: "#ffffff"
  tinta: "#161a1b"
  tinta-2: "#46504f"
  tinta-3: "#5f6968"
  linea: "#e1e5e5"
  linea-fuerte: "#c9cfcf"
  peligro: "#b42318"
  peligro-suave: "#fef3f2"
  exito: "#0e7a3e"
  exito-suave: "#e8f5ee"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  card-name:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.5
  meta:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  price:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  price-large:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  code:
    fontFamily: "ui-monospace, SF Mono, Roboto Mono, Menlo, Consolas, monospace"
    fontSize: "2rem"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  sello: "4px"
  radio: "8px"
  radio-grande: "12px"
  pildora: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  margen: "16px"
  bloque: "20px"
  lg: "24px"
  seccion: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accion}"
    textColor: "{colors.superficie}"
    typography: "{typography.label}"
    rounded: "{rounded.radio}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accion-hover}"
  button-secondary:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta}"
    typography: "{typography.label}"
    rounded: "{rounded.radio}"
    padding: "0 18px"
    height: "44px"
  button-whatsapp:
    backgroundColor: "{colors.wa}"
    textColor: "{colors.superficie}"
    typography: "{typography.label}"
    rounded: "{rounded.radio}"
    padding: "0 18px"
    height: "52px"
  button-whatsapp-hover:
    backgroundColor: "{colors.wa-hover}"
  button-disabled:
    backgroundColor: "#e8eaea"
    textColor: "{colors.tinta-3}"
    rounded: "{rounded.radio}"
    height: "44px"
  chip-category:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pildora}"
    padding: "0 18px"
    height: "44px"
  chip-category-active:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.superficie}"
  input-search:
    backgroundColor: "{colors.fondo}"
    textColor: "{colors.tinta}"
    typography: "{typography.body}"
    rounded: "{rounded.radio}"
    padding: "0 14px 0 42px"
    height: "44px"
  card-product:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.radio}"
    padding: "12px"
  stamp-sold-out:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.superficie}"
    rounded: "{rounded.sello}"
    padding: "4px 10px"
  order-bar:
    backgroundColor: "{colors.accion}"
    textColor: "{colors.superficie}"
    rounded: "{rounded.radio-grande}"
    padding: "8px 16px"
    height: "56px"
  order-code:
    backgroundColor: "{colors.fondo}"
    textColor: "{colors.tinta}"
    typography: "{typography.code}"
    rounded: "{rounded.radio-grande}"
    padding: "18px 16px"
---

# Design System: Tienda pública (plantilla multimarca)

Alcance: la tienda pública estática de `catalogo/`. El panel administrativo (`public/`) es otra superficie y no se rige por este documento, salvo la regla de íconos compartida (ver Do's and Don'ts).

## Overview

**Creative North Star: "El mostrador honesto"**

La tienda en línea de siempre, ejecutada con acabado de primera (la referencia de calidad es Mercado Libre). Nada compite con el producto y su precio: fondo gris muy claro, tarjetas blancas planas con borde fino, tinta casi negra y un único color de marca que solo aparece donde el comprador actúa. El precio es la pieza más grande de cada tarjeta, en cifras tabulares, con el monto en Bs y la fecha de la tasa en gris debajo; la confianza nace de ver el dato real, no de la decoración.

Es una plantilla multimarca: el sistema no conoce ningún color de marca. El primario llega en tiempo de ejecución desde `/api/public/marca` y todo lo demás (acción, hover, tinte suave) se deriva de él. La densidad es la de una tienda de celular: cuadrícula de dos columnas, áreas táctiles de 44 px como mínimo, pila tipográfica del sistema para cargar rápido en Android económicos con conexión lenta.

El movimiento es breve y funcional (150 a 300 ms): entrada de la barra de pedido y de los avisos, cambio de fondo en botones, giro de la flecha de las preguntas. Con "reducir movimiento" todo se apaga.

**Key Characteristics:**
- Gris neutro de fondo, superficies blancas planas con borde de 1 px.
- Un solo color de acción, derivado del primario de la marca y oscurecido para texto blanco.
- Verde de WhatsApp exclusivo de lo que abre WhatsApp.
- Precio grande, tabular y honesto; Bs y tasa en gris debajo.
- Esquinas de 8 px y 12 px, píldoras para categorías, sombras casi nulas.
- Íconos de trazo de Lucide, un solo estilo; sin emoji ni fuentes de íconos.

## Colors

Paleta neutra de gris frío con un acento de marca que se inyecta en tiempo de ejecución y un verde de canal reservado.

### Primary
- **Primario de la marca** (`--primary-color`): llega desde la configuración de la marca. No se pinta directamente en la interfaz; es la materia prima de los tres tokens de acción.
- **Acción** (primario al 78 % mezclado con negro): Agregar, Pedir, Ver pedido, contador del carrito, enlaces, botones de cantidad, borde de la miniatura activa, anillo de foco y los íconos de los tres pasos, de las características y de la entrega.
- **Acción hover** (primario al 64 % con negro): estado hover de todo lo que usa Acción como fondo.
- **Acción suave** (primario al 10 % con blanco): círculo detrás de los íconos de pasos, halo de foco del buscador, hover del control de cantidad y color de selección de texto.

El segundo color de la marca (`--secondary-color`) se recibe y se declara, pero la tienda no lo usa en ningún elemento.

### Secondary
- **Verde WhatsApp** y **Verde WhatsApp hover**: verde oscurecido para que el texto blanco se lea. Solo en el botón "Pedir por WhatsApp", el botón de abrir WhatsApp de la confirmación y el botón flotante de ayuda.

### Neutral
- **Fondo gris claro**: lienzo de la página, fondo del buscador en reposo, caja del código del pedido, hover de botones neutros.
- **Superficie blanca**: encabezado, pie, tarjetas, ficha, resumen, confirmación.
- **Tinta casi negra**: texto principal, píldora de categoría activa, sello "Agotado", avisos flotantes.
- **Tinta 2**: texto secundario (descripciones, respuestas, etiquetas de resumen).
- **Tinta 3**: datos de apoyo (Bs, fecha de la tasa, cuentas, placeholders, íconos neutros).
- **Línea** y **Línea fuerte**: bordes de tarjetas y separadores; la fuerte para controles (píldoras, selector, cantidad, botón secundario).

### Estado
- **Peligro** / **Peligro suave**: agotado en la ficha, avisos de línea, alertas y hover de quitar del pedido.
- **Éxito** / **Éxito suave**: "Disponible" en la ficha y el círculo de la confirmación.

**The One Action Rule.** El color de acción solo aparece en lo que compra, confirma o navega hacia el pedido, y en íconos pequeños de apoyo. Nunca como fondo de sección, banda decorativa o tarjeta.

**The Derived Brand Rule.** Ningún componente usa el primario de la marca crudo ni un hex de marca fijo: todo pasa por Acción, Acción hover o Acción suave, para que cualquier marca que llegue por configuración conserve el contraste del texto blanco.

**The Channel Green Rule.** El verde de WhatsApp significa "esto abre WhatsApp". No se usa para éxito, disponibilidad ni decoración, aunque el verde de éxito tenga el mismo valor.

## Typography

**Fuente única:** pila del sistema (system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif)
**Código del pedido:** pila monoespaciada del sistema (ui-monospace, SF Mono, Roboto Mono, Menlo, Consolas)

**Character:** Una sola familia, la del teléfono del comprador: cero bytes de fuente y lectura familiar. La jerarquía la hacen el tamaño, el peso y las cifras tabulares, no un contraste de familias.

### Hierarchy
- **Headline** (700, 1.375rem, 1.2): títulos de listado y de preguntas frecuentes; el nombre en la ficha usa el mismo tamaño con peso 600 y sube a 1.625rem desde 900 px. La confirmación sube a 1.5rem.
- **Title** (700, 1.0625rem): títulos de bloque (Resumen, Características).
- **Body** (400, 1rem, 1.5): texto corrido; descripciones y respuestas con un máximo de 70ch.
- **Card name** (500, 0.9375rem, 1.3): nombre en la tarjeta, recortado a dos líneas con altura reservada para que la cuadrícula no salte.
- **Label** (600, 0.95rem): texto de botones.
- **Meta** (400, 0.8125rem): Bs, fecha de la tasa, notas del resumen, precio unitario de la línea.
- **Price** (600, 1.375rem, 1.1, tabular): precio de la tarjeta; los centavos van a 0.55em elevados. **Price large** (2.125rem) en la ficha; el total del resumen usa 1.75rem.
- **Code** (monoespaciada 700, 2rem, espaciado 0.06em): el código del pedido, seleccionable de un toque.

**The Tabular Money Rule.** Todo número de dinero o cantidad (precios, Bs, totales, contador del carrito, cantidad) usa cifras tabulares.

**The Price Leads Rule.** En una tarjeta o ficha, el precio en dólares es el texto más grande; el Bs siempre va debajo, en gris y más pequeño, con la tasa del día a la vista.

## Layout

Móvil primero, contenedor de 1200 px como máximo con margen lateral de 16 px. El ritmo usa pasos de 4, 8, 12, 16, 20, 24 y 48 px: 8 a 16 px dentro de componentes, 20 px de relleno en bloques de ficha y resumen, 48 px entre secciones grandes y al pie del contenido.

- **Encabezado:** fijo arriba, blanco. En el celular, marca y carrito en una fila y el buscador a todo el ancho debajo; desde 768 px, una sola fila (marca, buscador de hasta 560 px, carrito).
- **Cuadrícula de productos:** 2 columnas (separación 10 px), 3 desde 640 px (14 px), 4 desde 1000 px (16 px).
- **Píldoras de categoría:** fila desplazable de borde a borde, sin barra de desplazamiento.
- **Ficha y pedido:** una columna en el celular; desde 900 px, dos columnas con el bloque de compra (ficha) o el resumen (pedido, 360 px) fijo a 92 px del borde superior.
- **Barra "Ver pedido":** fija abajo, hasta 560 px de ancho, respeta la zona segura del celular; el pie añade 96 px de relleno para que nada quede tapado. Con el botón de ayuda, la barra se corre a la izquierda en el celular y comparten fila.

## Elevation & Depth

Plana por defecto. La profundidad se expresa con bordes de 1 px y el contraste entre el fondo gris y las superficies blancas. Las sombras solo aparecen en lo que flota sobre la página o responde al cursor.

### Shadow Vocabulary
- **Sombra baja** (`0 1px 2px rgba(16,26,26,.06), 0 2px 8px rgba(16,26,26,.06)`): flechas del carrusel sobre la foto.
- **Sombra alta** (`0 10px 28px rgba(16,26,26,.16), 0 2px 6px rgba(16,26,26,.08)`): barra "Ver pedido", avisos flotantes y hover de la tarjeta (solo en dispositivos con cursor).
- **Sombra de ayuda** (`0 6px 20px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.12)`): botón flotante de WhatsApp, más intensa al pasar el cursor.

**The Flat Until Floating Rule.** Una superficie en el flujo de la página no lleva sombra en reposo. Solo lo fijo o flotante (barra, avisos, botón de ayuda, flechas) y el hover de la tarjeta con cursor la tienen.

## Shapes

Esquinas suavemente redondeadas de 8 px en controles, tarjetas de producto y miniaturas; 12 px en contenedores grandes (pasos, ficha, resumen, preguntas, confirmación, caja del código, barra de pedido). Píldora completa para categorías, contadores, avisos y el botón de ayuda; círculo para los íconos de pasos, el de confirmación y las flechas del carrusel. El sello "Agotado" es la única esquina de 4 px: más seco, como una etiqueta pegada.

Las fotos de producto se muestran enteras (`contain`) sobre blanco, en un cuadro 1:1; sin foto, un recuadro neutro con ícono ocupa el mismo cuadro.

## Components

### Buttons
Firmes y sobrios: rellenos planos, sin degradado ni sombra.
- **Shape:** 8 px; altura mínima 44 px; la versión grande, 52 px. A ancho completo en tarjetas, ficha y resumen.
- **Primario:** fondo Acción, texto blanco, peso 600. Agregar, Pedir, Reintentar, Ver productos.
- **Secundario:** blanco con borde Línea fuerte y texto Tinta; hover a Fondo.
- **WhatsApp:** fondo verde WhatsApp con la marca de WhatsApp en blanco (22 px); siempre en tamaño grande.
- **Deshabilitado:** gris plano con texto Tinta 3; es el estado de "Agotado" en la tarjeta.
- **Hover / Active:** cambio de fondo en 150 ms; al presionar, escala 0.98. Foco: anillo de 3 px en Acción separado 2 px.
- **Ícono (quitar):** 44 px transparente; hover en Peligro suave con ícono Peligro.

### Chips (categorías)
- **Style:** píldora blanca con borde Línea fuerte, 44 px de alto, peso 500.
- **State:** activa en Tinta sólida con texto blanco (marcada con `aria-current`); hover oscurece el borde.

### Cards / Containers
- **Tarjeta de producto:** blanca, borde Línea, 8 px; foto cuadrada con borde inferior, cuerpo de 12 px con nombre, precio, Bs y botón al pie. Agotada: foto en gris al 50 % y sello.
- **Bloques (pasos, ficha, resumen, preguntas, confirmación):** blancos, borde Línea, 12 px, relleno de 20 px; filas separadas por bordes de 1 px, sin tarjetas anidadas.

### Inputs / Fields
- **Buscador:** 44 px, fondo Fondo sin borde visible, ícono de lupa a la izquierda. Al enfocar: fondo blanco, borde Acción y halo de 3 px en Acción suave.
- **Selector de orden:** 44 px, blanco, borde Línea fuerte.
- **Control de cantidad:** caja de 44 px con borde Línea fuerte; botones de 44 px en Acción, valor tabular en negrita; en 1 unidad el menos se vuelve papelera.

### Navigation
Encabezado blanco fijo con borde inferior; carrito de 44 px con contador en píldora Acción. Migas de pan con separador chevron en Tinta 3. Enlace "Saltar al contenido" visible al enfocar.

### Sello "Agotado"
Etiqueta sólida en Tinta con texto blanco 0.75rem en negrita, arriba a la izquierda de la foto. El agotado se ve, pero no se puede agregar.

### Barra "Ver pedido"
Aparece cuando hay algo en el pedido: barra flotante en Acción, 56 px, ícono de carrito con la cuenta en un globito blanco, total tabular y "Ver pedido" con chevron. Entra deslizándose 24 px en 300 ms.

### Código del pedido
Caja gris de 12 px con el código en monoespaciada de 2rem, seleccionable completo, y botón de copiar. Es el dato que el comprador lleva a WhatsApp.

### Botón de ayuda por WhatsApp
Píldora flotante verde de 56 px abajo a la derecha con la marca de WhatsApp (28 px) y texto; tras unos segundos queda solo el ícono y la etiqueta vuelve con hover o foco.

## Do's and Don'ts

### Do:
- **Do** derivar todo color de acción del primario de la marca con `color-mix` (78 % para fondo, 64 % para hover, 10 % sobre blanco para el tinte), nunca escribir el hex de una marca.
- **Do** reservar el verde de WhatsApp a lo que abre WhatsApp, acompañado de la marca de WhatsApp en blanco.
- **Do** mostrar precio en dólares grande y tabular, y debajo el Bs con la tasa del día en Tinta 3.
- **Do** dar 44 px de área táctil a todo control (52 px para la acción final, 56 px para la barra y la ayuda).
- **Do** usar solo íconos de Lucide (vendorizados en `catalogo/js/lucide.js`, trazo 2 px, dibujados con `createElementNS`, decorativos con `aria-hidden`) y, para canales, solo las marcas oficiales en SVG (WhatsApp en la tienda; simple-icons en el panel).
- **Do** mantener superficies planas con borde de 1 px; la sombra solo en lo que flota.
- **Do** apagar animaciones y transiciones con `prefers-reduced-motion`.

### Don't:
- **Don't** usar el color de acción como fondo de secciones, bandas o banners de marca.
- **Don't** poner emoji ni fuentes de íconos en la interfaz.
- **Don't** usar el verde de WhatsApp para estados de éxito o disponibilidad.
- **Don't** anidar tarjetas dentro de tarjetas ni poner sombra a superficies en reposo.
- **Don't** cargar fuentes web ni recursos de CDN de terceros: la pila es la del sistema.
- **Don't** nombrar tokens con el nombre de una marca: la tienda es una plantilla.
