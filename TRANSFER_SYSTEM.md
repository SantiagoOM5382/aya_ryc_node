# Sistema de Transferencia a Asesor

Este documento explica cómo el bot marca y registra los chats listos para transferir a un asesor de reservas.

## ¿Cómo funciona?

### 1. Detección Automática
El bot detecta automáticamente cuándo un cliente está listo para ser transferido a un asesor. Esto ocurre cuando Claude menciona cualquiera de estas palabras clave:

- `perfecto`, `listo`, `confirmado`
- `reserva confirmada`
- `registro su número`, `registrado su número`
- `asesor de reservas`, `agente de reservas`
- `será direccionado`, `será canalizado`
- `comunicará con usted`, `se comunicará`
- `número registrado`

### 2. Tres Formas de Marcado

Cuando se detecta un chat listo para transferir, el sistema automáticamente:

#### ✅ **Opción 1: Etiqueta Visual en el Chat**
El mensaje del bot incluye un marcador visual:
```
... mensaje del bot ...

✅ *Chat marcado como LISTO PARA TRANSFERIR A ASESOR*
```

#### ✅ **Opción 2: Registro en Log**
Se crea un archivo `logs/advisor-transfer.log` que registra todos los chats listos:
```
[2026-07-21T15:30:45.123Z] User: 573248175348 | Status: READY_FOR_TRANSFER
Bot Response: He registrado su número: 324-817-5348...
---
```

#### ✅ **Opción 3: Archivo de Estado (JSON)**
Se crea/actualiza `logs/advisor-transfer.json` con un listado de chats listos:
```json
{
  "readyForTransfer": [
    {
      "userId": "573248175348",
      "timestamp": "2026-07-21T15:30:45.123Z",
      "readySince": "2026-07-21T15:30:45.123Z",
      "lastBotMessage": "He registrado su número: 324-817-5348. En breve, nuestro asesor...",
      "transferred": false
    }
  ]
}
```

## Comandos para Asesores

### Ver Chats Listos para Transferir
```bash
npm run check-transfers
```

Muestra un resumen visual de:
- ✅ Chats listos (sin transferir)
- 🟡 Chats ya transferidos
- Hora exacta en que quedó listo cada chat

Ejemplo de salida:
```
╔══════════════════════════════════════════════════════════════╗
║    🔄 CHATS LISTOS PARA TRANSFERIR A ASESOR DE RESERVAS     ║
╚══════════════════════════════════════════════════════════════╝

🟢 LISTOS PARA TRANSFERIR (acción requerida):
────────────────────────────────────────────────────────────────
1. Usuario: 573248175348
   Listo desde: 21/7/2026, 3:30:45 p.m.
   Msg bot: "He registrado su número: 324-817-5348..."
```

### Marcar Chat Como Transferido
Una vez que el asesor se ha comunicado con el cliente, marca el chat como transferido:

```bash
npm run mark-transferred -- 573248175348
```

Esto actualiza el archivo de estado marcando ese chat como ya procesado.

## Resumen Automático en Inicio

Cada vez que el bot inicia, muestra automáticamente un resumen de chats listos para transferir:

```
============================================================
📊 RESUMEN - CHATS LISTOS PARA TRANSFERIR A ASESOR
============================================================
1. Cliente: 573248175348
   Listo desde: 2026-07-21T15:30:45.123Z
   Último mensaje: He registrado su número: 324-817-5348...
---
Total: 1 chat(s) listos para transferir
============================================================
```

## Archivos Generados

- `logs/advisor-transfer.log` — Historial completo de transferencias
- `logs/advisor-transfer.json` — Estado actual de chats listos

Estos archivos se crean automáticamente en la carpeta `logs/`.

## Palabras Clave Que Disparan el Marcado

El sistema busca estas palabras en la respuesta del bot:

```javascript
'perfecto'
'listo'
'confirmado'
'reserva confirmada'
'registro su número'
'registrado su número'
'asesor de reservas'
'agente de reservas'
'será direccionado'
'será canalizado'
'comunicará con usted'
'se comunicará'
'número registrado'
```

Si necesitas agregar más palabras clave, edita `src/advisorTransferTracker.js` y actualiza el array `TRANSFER_READY_KEYWORDS`.

## Flujo Completo Ejemplo

1. **Cliente envía mensaje** → "¿Cuál es el precio de Palafitos?"
2. **Bot responde** → Proporciona info, pide datos
3. **Cliente responde** → Comparte número de contacto
4. **Bot responde** → "He registrado su número: 324-817-5348. En breve, nuestro asesor..."
5. **Sistema detecta** → Encuentra "registrado su número" en la respuesta
6. **Sistema marca** → ✅ Agrega etiqueta, registra en log, actualiza JSON
7. **Asesor ve** → Ejecuta `npm run check-transfers` y ve el chat listo
8. **Asesor se comunica** → Contacta al cliente vía WhatsApp
9. **Asesor marca** → Ejecuta `npm run mark-transferred -- 573248175348`
10. **Sistema actualiza** → Mueve chat de "listo" a "transferido"

## Integración con el Prompt de Sistema

El prompt de Claude (en `prompts/ryc-system-prompt.txt`) ya está diseñado para mencionar "asesor de reservas" y "será direccionado", lo que dispara automáticamente el marcado.
