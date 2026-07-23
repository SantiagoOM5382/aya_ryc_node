# Prompts - VIAJA CON CARLOS

Organización de prompts y mensajes para el bot de WhatsApp de VIAJA CON CARLOS.

## Estructura de Archivos

```
prompts/
├── ryc-system-prompt.txt          ← Prompt del sistema (reglas, flujo principal)
├── README.md                       ← Este archivo
├── palafitos/
│   └── palafitos.txt              ← Información del destino (cargada dinámicamente)
├── dunbar_rock/
│   └── dumbar_rock.txt            ← Información del destino (cargada dinámicamente)
└── cayo_espanto/
    └── cayo_espanto.txt           ← Información del destino (cargada dinámicamente)
```

## Cómo Funciona

### 1. **Sistema Principal** (`ryc-system-prompt.txt`)
- Se carga al iniciar el bot
- Contiene las reglas generales y flujo de conversación
- Establece restricciones (solo adultos, sin menores, etc.)
- Información mínima necesaria (sin cargar detalles innecesarios)

### 2. **Información de Destinos** (carpetas individuales)
- Cada destino tiene su propia carpeta con detalles completos
- Se cargan **dinámicamente solo cuando es necesario**
- Cuando el cliente pregunta sobre un destino específico, el bot carga ese archivo
- Contiene: ubicación, precios, características, qué incluye, etc.

## Flujo de Conversación Típica

```
1. Cliente contacta
   ↓
2. Bot saluda (usando ryc-system-prompt.txt)
   ↓
3. Cliente pregunta/elige destino
   ↓
4. Bot detecta mención de destino y carga archivo correspondiente
   ↓
5. Bot responde con info del destino
   ↓
6. Cliente da detalles (fechas, personas, etc.)
   ↓
7. Bot genera resumen y cierra
```

## Personalización

### Cambiar Saludos, Reglas o Flujo
Edita `ryc-system-prompt.txt`

### Actualizar Información de Destino
- Palafitos → edita `palafitos/palafitos.txt`
- Dumbar Rock → edita `dunbar_rock/dumbar_rock.txt`
- Cayo Espanto → edita `cayo_espanto/cayo_espanto.txt`

## Estándares de Formato

- **Encabezados**: Usa `═══════` para separar secciones
- **Emojis**: Usa moderadamente (máximo 2-3 por sección)
- **Estructura**: Ubicación → Descripción → Precios → Qué incluye → Características
- **Tono**: Profesional pero amigable, como un agente real de WhatsApp

## Notas Importantes

⚠️ **RESTRICCIONES CRÍTICAS** (definidas en `ryc-system-prompt.txt`):
- ✅ Solo 3 destinos disponibles (Palafitos, Dumbar Rock, Cayo Espanto)
- ✅ Exclusivamente para adultos — SIN EXCEPCIONES
- ✅ NO inventar precios de vuelos ni hoteles
- ✅ Precios mostrados son "DESDE" esa cantidad (pueden variar)

## Próximas Mejoras Sugeridas

- [ ] Agregar imágenes a los archivos de destino (si el bot las soporta)
- [ ] Crear versión resumida para primera respuesta rápida
- [ ] Agregar FAQ común (covid, cancelaciones, etc.)
- [ ] Crear prompts específicos para preguntas frecuentes
