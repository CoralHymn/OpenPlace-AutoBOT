<p align="center"><strong>WPlace AutoBOT</strong></p>

<p align="center">
  Scripts prácticos con menús intuitivos para facilitar tu experiencia en <a href="https://wplace.live" target="_blank">WPlace</a>.<br>
  Ideal para quienes quieren subir de nivel automáticamente o crear pixel arts gigantes sin perder tiempo.
</p>

<br>

## 📖 Manual de Usuario - Auto-Farm Bot

### 🚀 Instalación y Configuración Inicial

1. **Copia el código del bot:**
   ```js
   javascript:fetch("https://raw.githubusercontent.com/Alarisco/WPlace-AutoBOTV2/refs/heads/main/Auto-Farm.js").then(t=>t.text()).then(eval);
   ```

2. **Agrega el bookmarklet:**
   - Crea un nuevo marcador/favorito en tu navegador
   - Pega el código JavaScript como URL
   - Asígnale un nombre como "WPlace Auto-Farm"

3. **Ejecuta en WPlace:**
   - Ve a [wplace.live](https://wplace.live)
   - Inicia sesión en tu cuenta
   - Haz clic en el marcador para activar el bot

### 🎯 Calibración Inicial (OBLIGATORIA)

**⚠️ IMPORTANTE:** El bot requiere calibración antes del primer uso para determinar el área de trabajo.

1. **Activación automática:** El bot detectará si necesita calibración al iniciar
2. **Proceso de calibración:**
   - El bot mostrará: `🎯 Calibración requerida: pinta un pixel manualmente...`
   - Pinta UN pixel manualmente en el canvas de WPlace
   - **Zona segura recomendada:** Coordenadas entre 200-3800 (evita los bordes)
   - El bot capturará automáticamente las coordenadas del tile donde pintaste

3. **Confirmación:** Verás `✅ Coordenadas capturadas: X/Y` cuando la calibración sea exitosa

### 🎛️ Configuración del Bot

El panel de control incluye los siguientes ajustes:

#### ⏱️ **Delay (seg)**
- **Función:** Tiempo de espera entre lotes de píxeles
- **Rango:** 5-300 segundos
- **Recomendado:** 15-30 segundos
- **Nota:** Delays muy bajos pueden causar baneos

#### 🔋 **Min. Cargas**
- **Función:** Mínimo de cargas completas antes de empezar a pintar
- **Rango:** 1-50 cargas
- **Recomendado:** 10-20 cargas
- **Comportamiento:** El bot esperará hasta tener este mínimo antes de pintar

#### 🎨 **Píxeles/Lote**
- **Función:** Número de píxeles a pintar simultáneamente
- **Rango:** 1-50 píxeles
- **Recomendado:** 10-30 píxeles
- **Optimización:** El bot ajustará automáticamente según las cargas disponibles

#### 🔑 **Sitekey**
- **Función:** Clave de Turnstile para autenticación
- **Valor por defecto:** `0x4AAAAAAAAAA8FO0N84q0F`
- **Nota:** Solo modifica si cambia el sistema de WPlace

#### 🌈 **Modo de Color**
- **Random:** Colores aleatorios entre 1-32
- **Fijo:** Usar siempre el mismo color
- **Color fijo:** Número del color (1-32) cuando modo fijo está activo

### 🕹️ Controles del Bot

#### **Start**
- Inicia el bot en modo automático continuo
- El bot pintará lotes de píxeles según la configuración
- Respeta los tiempos de delay y mínimos de cargas

#### **Once**
- Pinta un solo lote de píxeles inmediatamente
- Útil para pruebas o pintado manual controlado
- Requiere calibración previa

#### **Stop**
- Detiene completamente el bot
- Cancela cualquier operación en curso
- Mantiene la configuración guardada

### 📊 Panel de Información

#### **Estadísticas del Usuario**
- **User:** Nombre de usuario conectado
- **Charges:** Cargas completas disponibles
- **Painted:** Total de píxeles pintados en la sesión
- **Último:** Información del último intento de pintado
- **Estado:** Estado actual del bot (Activo/Detenido)

#### **Estado del Backend**
- **Backend:** Estado del servidor WPlace
- **Database:** Estado de la base de datos
- **Uptime:** Tiempo de actividad del servidor

### ⚡ Sistema de Cargas Inteligente

El bot maneja las cargas de forma optimizada:

1. **Cargas decimales:** El sistema muestra cargas como 2.84 (2 completas + 84% hacia la siguiente)
2. **Uso inteligente:** Solo usa cargas completas para pintar
3. **Cooldown automático:** Si no hay suficientes cargas, espera automáticamente
4. **Optimización de lotes:** Ajusta el número de píxeles según cargas disponibles

### 🛡️ Sistema Anti-Ban

El bot incluye protecciones contra baneos:

- **Consultas mínimas:** Una sola consulta a `/me` por ciclo de pintado
- **Delays configurables:** Tiempo de espera entre operaciones
- **Reintentos limitados:** Máximo 3 intentos antes de cooldown de 2 minutos
- **Detección de errores:** Manejo inteligente de respuestas del servidor

### 🔧 Funciones Avanzadas (Consola)

Puedes usar comandos avanzados en la consola del navegador:

```javascript
// Iniciar/Detener el bot
WPAUI.start()
WPAUI.stop()

// Pintar una vez
WPAUI.once()

// Modificar configuración
WPAUI.set({ MIN_CHARGES: 15, PIXELS_PER_BATCH: 25 })

// Ver configuración actual
WPAUI.get()

// Diagnosticar problemas
WPAUI.diagnose()

// Verificar estado del backend
WPAUI.checkHealth()

// Resetear configuración (requiere recalibración)
WPAUI.resetConfig()

// Cambiar ajustes específicos
WPAUI.setPixelsPerBatch(20)
WPAUI.setMinCharges(15)
WPAUI.setDelay(30)
```

### ❗ Solución de Problemas

#### **🎯 "Calibración requerida"**
- **Causa:** Bot no tiene coordenadas válidas
- **Solución:** Pinta un pixel manualmente en zona segura (200-3800)

#### **🔋 "Sin cargas disponibles"**
- **Causa:** No hay suficientes cargas completas
- **Solución:** Espera a que se regeneren (1 carga cada 30 segundos)

#### **❌ Error 403/429**
- **Causa:** Problemas de autenticación o límite de tasa
- **Solución:** Aumenta el delay, verifica tu sesión

#### **🚫 "Coordenadas peligrosas"**
- **Causa:** Coordenadas cerca de los bordes del canvas
- **Solución:** Ejecuta `WPAUI.resetConfig()` y recalibra en zona central

#### **🔴 Backend Offline**
- **Causa:** Problemas del servidor WPlace
- **Solución:** Espera a que se restablezca el servicio

### ⚠️ Recomendaciones de Uso

1. **Siempre calibra en zona segura** (coordenadas 200-3800)
2. **Usa delays apropiados** (15-30 segundos) para evitar baneos
3. **Configura cargas mínimas** adecuadas (10-20) para eficiencia
4. **Monitorea el estado del backend** antes de sesiones largas
5. **Guarda tu configuración** - el bot recuerda tus ajustes
6. **No uses coordenadas cerca de los bordes** del canvas 4000x4000

### 📱 Compatibilidad

- **Navegadores:** Chrome, Firefox, Safari, Edge (actualizados)
- **Sistema:** Windows, macOS, Linux
- **Requisitos:** JavaScript habilitado, cookies de WPlace

---

### 🎯┃Código del Bot

```js
javascript:fetch("https://raw.githubusercontent.com/Alarisco/WPlace-AutoBOTV2/refs/heads/main/Auto-Farm.js").then(t=>t.text()).then(eval);
