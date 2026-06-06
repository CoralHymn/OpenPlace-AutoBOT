import { log } from "../core/logger.js";
import { sleep } from "../core/timing.js";
import { postPixelBatchImage, getSession } from "../core/wplace-api.js";
import { ensureToken } from "../core/turnstile.js";
import { imageState, IMAGE_DEFAULTS } from "./config.js";
import { t } from "../locales/index.js";
import { pixelsPainted } from "../core/metrics/client.js";

import { applyPaintPattern } from "./patterns.js";

// Variables para manejo de visibilidad de página
let pageVisibilityHandler = null;
let wasHiddenDuringCooldown = false;
let cooldownStartTime = null;
let cooldownDuration = null;

// Variables para monitoreo de cargas
let chargeMonitorInterval = null;
let _lastChargeCheck = 0;
const CHARGE_CHECK_INTERVAL = 30000; // 30 segundos máximo

/**
 * Configurar manejo de visibilidad de página
 */
function setupPageVisibilityHandling() {
  if (pageVisibilityHandler) {
    document.removeEventListener('visibilitychange', pageVisibilityHandler);
  }
  
  pageVisibilityHandler = () => {
    if (document.hidden) {
      log('📱 Pestaña oculta - pausando timers');
      if (imageState.inCooldown) {
        wasHiddenDuringCooldown = true;
      }
    } else {
      log('📱 Pestaña visible - reanudando timers');
      if (wasHiddenDuringCooldown && imageState.inCooldown) {
        recalculateCooldownTime();
        wasHiddenDuringCooldown = false;
      }
    }
  };
  
  document.addEventListener('visibilitychange', pageVisibilityHandler);
}

/**
 * Recalcular tiempo de cooldown cuando la pestaña vuelve a estar activa
 */
function recalculateCooldownTime() {
  if (!cooldownStartTime || !cooldownDuration) return;
  
  const now = Date.now();
  const elapsed = now - cooldownStartTime;
  const remaining = Math.max(0, cooldownDuration - elapsed);
  
  imageState.nextBatchCooldown = Math.ceil(remaining / 1000);
  imageState.cooldownEndTime = now + remaining;
  
  log(`🔄 Recalculando cooldown: ${Math.ceil(remaining/1000)}s restantes`);
}

// Variable para controlar logs de monitoreo
let _lastChargeMonitorLog = 0;
const MONITOR_LOG_THROTTLE = 120000; // 2 minutos entre logs de monitoreo

/**
 * Monitorear cargas periódicamente y continuar pintando si hay píxeles pendientes
 */
async function startChargeMonitoring() {
  if (chargeMonitorInterval) {
    window.clearInterval(chargeMonitorInterval);
  }
  
  // Configurar manejo de visibilidad de página
  setupPageVisibilityHandling();
  
  chargeMonitorInterval = window.setInterval(async () => {
    try {
      // Saltar verificación si la pestaña está oculta para ahorrar recursos
      if (document.hidden) {
        return;
      }
      
      // Solo verificar si hay píxeles pendientes y no estamos pintando activamente
      if (imageState.remainingPixels.length > 0 && !imageState.running) {
        const sessionResult = await getSession();
        
        if (sessionResult.success && sessionResult.data.charges > 0) {
          const availableCharges = Math.floor(sessionResult.data.charges);
          const now = Date.now();
          
          // Solo loggear cada 2 minutos para reducir spam
          if (now - _lastChargeMonitorLog > MONITOR_LOG_THROTTLE) {
            log(`🔄 Monitoreo: ${availableCharges} cargas disponibles`);
            _lastChargeMonitorLog = now;
          }
          
          // Actualizar estado de cargas
          imageState.currentCharges = sessionResult.data.charges;
          imageState.maxCharges = sessionResult.data.maxCharges;
          
          // Reanudar pintado automáticamente si hay cargas suficientes
          if (availableCharges >= imageState.pixelsPerBatch) {
            if (window.imageBot && typeof window.imageBot.onStartPainting === 'function') {
              log(`🚀 Reanudando pintado automáticamente con ${availableCharges} cargas`);
              window.imageBot.onStartPainting();
            }
          }
        }
      }
    } catch (error) {
      // Solo loggear errores de monitoreo ocasionalmente
      const now = Date.now();
      if (now - _lastChargeMonitorLog > MONITOR_LOG_THROTTLE) {
        log(`⚠️ Error en monitoreo de cargas: ${error.message}`);
        _lastChargeMonitorLog = now;
      }
    }
  }, CHARGE_CHECK_INTERVAL);
  
  log(`✅ Monitoreo de cargas iniciado (cada ${CHARGE_CHECK_INTERVAL/1000}s)`);
}

/**
 * Detener monitoreo de cargas
 */
function stopChargeMonitoring() {
  if (chargeMonitorInterval) {
    window.clearInterval(chargeMonitorInterval);
    chargeMonitorInterval = null;
    log(`⏹️ Monitoreo de cargas detenido`);
  }
  
  // Limpiar manejo de visibilidad de página
  if (pageVisibilityHandler) {
    document.removeEventListener('visibilitychange', pageVisibilityHandler);
    pageVisibilityHandler = null;
  }
  
  // Limpiar variables de cooldown
  cooldownStartTime = null;
  cooldownDuration = null;
  wasHiddenDuringCooldown = false;
}

// Variable para controlar logs repetitivos
let _lastInsufficientChargesLog = 0;
const LOG_THROTTLE_MS = 30000; // 30 segundos entre logs similares

/**
 * Verificar cargas antes de cada lote y esperar si es necesario
 */
async function ensureSufficientCharges(requiredCharges, onProgress) {
  // Verificar si el bot se ha detenido antes de hacer cualquier operación
  if (imageState.stopFlag) {
    log(`🛑 Bot detenido, cancelando verificación de cargas`);
    return false;
  }
  
  const sessionResult = await getSession();
  
  if (sessionResult.success) {
    const availableCharges = Math.floor(sessionResult.data.charges);
    imageState.currentCharges = sessionResult.data.charges;
    imageState.maxCharges = sessionResult.data.maxCharges;
    
    if (availableCharges < requiredCharges) {
      // Verificar nuevamente si el bot se ha detenido antes de esperar
      if (imageState.stopFlag) {
        log(`🛑 Bot detenido durante verificación de cargas`);
        return false;
      }
      
      // Solo mostrar log si han pasado más de 30 segundos desde el último
      const now = Date.now();
      if (now - _lastInsufficientChargesLog > LOG_THROTTLE_MS) {
        log(`⏳ Cargas insuficientes: ${availableCharges}/${requiredCharges}. Esperando regeneración...`);
        _lastInsufficientChargesLog = now;
      }
      
      await waitForCooldown(requiredCharges - availableCharges, onProgress);
      
      // Verificar si el bot se detuvo durante el cooldown antes de recursión
      if (imageState.stopFlag) {
        log(`🛑 Bot detenido durante cooldown, cancelando recursión`);
        return false;
      }
      
      // Verificar nuevamente después del cooldown
      return await ensureSufficientCharges(requiredCharges, onProgress);
    }
    
    // Reset del throttle cuando hay suficientes cargas
    _lastInsufficientChargesLog = 0;
    return true;
  }
  
  log(`⚠️ No se pudo verificar cargas, continuando con valor cached: ${imageState.currentCharges}`);
  return imageState.currentCharges >= requiredCharges;
}












export async function processImage(imageData, startPosition, onProgress, onComplete, onError) {
  const { width, height } = imageData;
  const { x: localStartX, y: localStartY } = startPosition;
  
  log(`Iniciando pintado: imagen(${width}x${height}) inicio LOCAL(${localStartX},${localStartY}) tile(${imageState.tileX},${imageState.tileY})`);
  log(`🎨 Patrón: ${imageState.paintPattern}`);
  
  // Iniciar monitoreo de cargas
  startChargeMonitoring();
  
  // *** NUEVO: Generar token al inicio del proceso ***
  try {
    log("🔑 Generando token Turnstile al inicio del proceso...");
    const initialToken = await ensureToken();
    if (!initialToken) {
      log("⚠️ No se pudo generar token inicial, continuando con flujo normal");
    } else {
      log("✅ Token inicial generado exitosamente");
    }
  } catch (error) {
    log("⚠️ Error generando token inicial:", error.message);
  }
  
  // Generar cola de píxeles si no existe
  if (!imageState.remainingPixels || imageState.remainingPixels.length === 0 || (imageState.lastPosition.x === 0 && imageState.lastPosition.y === 0)) {
    log('Generando cola de píxeles...');
    imageState.remainingPixels = generatePixelQueue(imageData, startPosition, imageState.tileX, imageState.tileY);
    
    // Aplicar patrón de pintado
    if (imageState.paintPattern && imageState.paintPattern !== 'linear_start') {
      log(`🎨 Aplicando patrón de pintado: ${imageState.paintPattern}`);
      imageState.remainingPixels = applyPaintPattern(imageState.remainingPixels, imageState.paintPattern, imageData);
    }
    
    // Si hay una posición de continuación, filtrar píxeles ya pintados
    if (imageState.lastPosition.x > 0 || imageState.lastPosition.y > 0) {
      imageState.remainingPixels = imageState.remainingPixels.filter(pixel => {
        const pixelIndex = pixel.imageY * width + pixel.imageX;
        const lastIndex = imageState.lastPosition.y * width + imageState.lastPosition.x;
        return pixelIndex >= lastIndex;
      });
    }
    


    log(`Cola generada: ${imageState.remainingPixels.length} píxeles pendientes`);
    // Actualizar overlay del plan al (re)generar la cola
    try {
      if (window.__WPA_PLAN_OVERLAY__) {
        window.__WPA_PLAN_OVERLAY__.injectStyles();
        window.__WPA_PLAN_OVERLAY__.setEnabled(true);
        if (imageState.startPosition && imageState.tileX !== undefined && imageState.tileY !== undefined) {
          window.__WPA_PLAN_OVERLAY__.setAnchor({
            tileX: imageState.tileX,
            tileY: imageState.tileY,
            pxX: imageState.startPosition.x,
            pxY: imageState.startPosition.y
          });
        }
        window.__WPA_PLAN_OVERLAY__.setPlan(imageState.remainingPixels, {
          enabled: true,
          nextBatchCount: imageState.pixelsPerBatch
        });
      }
    } catch (e) {
      log('⚠️ Error actualizando plan overlay:', e);
    }

    // (ANTES) NUEVO: Prevalidar toda la cola antes de comenzar a pintar
    // await prevalidateAllPixelsOnStart(onProgress);
  }
  


  try {
    while (imageState.remainingPixels.length > 0 && !imageState.stopFlag) {
      // Verificar cargas disponibles
      let availableCharges = Math.floor(imageState.currentCharges);
      
      // Determinar tamaño del lote basado en configuración
      let pixelsPerBatch;
      
      // Debug logging para diagnosticar problema del primer lote
      log(`🔍 Estado del primer lote - isFirstBatch: ${imageState.isFirstBatch}, useAllChargesFirst: ${imageState.useAllChargesFirst}, availableCharges: ${availableCharges}`);
      
      if (imageState.isFirstBatch && imageState.useAllChargesFirst && availableCharges > 0) {
        // Primera pasada: usar todas las cargas disponibles
        pixelsPerBatch = Math.min(availableCharges, imageState.remainingPixels.length);
        imageState.isFirstBatch = false; // Marcar que ya no es la primera pasada
        log(`🚀 Primera pasada: usando ${pixelsPerBatch} cargas de ${availableCharges} disponibles`);
      } else {
        // Pasadas siguientes: usar configuración normal
        pixelsPerBatch = Math.min(imageState.pixelsPerBatch, imageState.remainingPixels.length);
        log(`⚙️ Pasada normal: usando ${pixelsPerBatch} píxeles (configurado: ${imageState.pixelsPerBatch})`);
      }
      
      // Usar la nueva función de verificación de cargas
      const hasEnoughCharges = await ensureSufficientCharges(pixelsPerBatch, onProgress);
      if (!hasEnoughCharges) {
        log(`⚠️ No se pudieron obtener suficientes cargas, pausando pintado`);
        break;
      }
      
      // Actualizar availableCharges después de la verificación
      availableCharges = Math.floor(imageState.currentCharges);
      
  // Tomar el siguiente lote de píxeles
      const initialBatch = imageState.remainingPixels.splice(0, pixelsPerBatch);
      let batch = initialBatch;
      let skippedCount = 0;
      
      log(`Verificando lote de ${initialBatch.length} píxeles...`);
      
      log(`Pintando lote de ${batch.length} píxeles...`);
      

      
      // Actualizar overlay del plan para reflejar el lote siguiente resaltado
      try {
        if (window.__WPA_PLAN_OVERLAY__) {
          window.__WPA_PLAN_OVERLAY__.setPlan(imageState.remainingPixels, {
            enabled: true, // Mantener habilitado
            nextBatchCount: imageState.pixelsPerBatch
          });
        }
      } catch (e) {
        log('⚠️ Error actualizando plan overlay durante pintado:', e);
      }

      // Pintar el lote con sistema de reintentos
      const result = await paintPixelBatchWithRetry(batch, onProgress);
      
      if (result.success && result.painted > 0) {
        // Sumar píxeles realmente pintados + píxeles omitidos por verificación inteligente
        imageState.paintedPixels += result.painted + skippedCount;
        
        // Reportar métricas del lote actual
        try {
          const metadata = {
            details: `Lote pintado: ${result.painted + skippedCount}/${batch.length} px · patrón ${imageState.paintPattern} · restantes ${imageState.remainingPixels.length}`,
            batch_size: batch.length,
            painted_count: result.painted,
            skipped_count: skippedCount,
            pattern: imageState.paintPattern,
            remaining_pixels: imageState.remainingPixels.length,
            tile: { x: imageState.tileX, y: imageState.tileY }
          };
          pixelsPainted(result.painted + skippedCount, { botVariant: 'auto-image', metadata });
        } catch (e) {
          log('⚠️ Error reportando métricas:', e);
        }

        
  // Actualizar cargas consumidas (una sola vez)
  imageState.currentCharges = Math.max(0, imageState.currentCharges - result.painted);
  log(`Cargas después del lote: ${imageState.currentCharges.toFixed(1)} (consumidas: ${result.painted})`);
        
        // Actualizar posición para continuar desde aquí si se interrumpe
        if (batch.length > 0) {
          const lastPixel = batch[batch.length - 1];
          imageState.lastPosition = { x: lastPixel.imageX, y: lastPixel.imageY };
        }
        
        log(`Lote exitoso: ${result.painted}/${batch.length} píxeles pintados. Total: ${imageState.paintedPixels}/${imageState.totalPixels}`);
        
        // Calcular tiempo estimado
        const estimatedTime = calculateEstimatedTime();
        
        // Mostrar mensaje de confirmación de pasada completada
        const progressPercent = ((imageState.paintedPixels / imageState.totalPixels) * 100).toFixed(1);
        const successMessage = t('image.passCompleted', {
          painted: result.painted,
          percent: progressPercent,
          current: imageState.paintedPixels,
          total: imageState.totalPixels
        });
        
        // Actualizar progreso con mensaje de éxito
        if (onProgress) {
          onProgress(imageState.paintedPixels, imageState.totalPixels, successMessage, estimatedTime);
        }
        
  // Pausa para que el usuario vea el mensaje de éxito antes del cooldown
        await sleep(2000);
      } else if (result.shouldContinue) {
        // Si el sistema de reintentos falló pero debe continuar
        log(`Lote falló después de todos los reintentos, continuando con siguiente lote...`);
      } else {
        // En caso de fallo, devolver el lote a la cola
        imageState.remainingPixels.unshift(...batch);
        log(`Lote falló: reintentando en 5 segundos...`);
        await sleep(5000);
      }
      
  // Pausa breve entre lotes
      await sleep(500);
    }
    
    if (imageState.stopFlag) {
      log(`Pintado pausado en píxel imagen(${imageState.lastPosition.x},${imageState.lastPosition.y})`);
      // Mantener monitoreo activo para reanudar automáticamente
      if (onComplete) {
        onComplete(false, imageState.paintedPixels);
      }
    } else {
      log(`Pintado completado: ${imageState.paintedPixels} píxeles pintados`);
      imageState.lastPosition = { x: 0, y: 0 };
      imageState.remainingPixels = [];
      // Detener monitoreo al completar
      stopChargeMonitoring();
      // Limpiar overlay del plan al completar
      try {
        if (window.__WPA_PLAN_OVERLAY__) {
          window.__WPA_PLAN_OVERLAY__.setPlan([], { 
            enabled: true, // Mantener habilitado pero sin píxeles
            nextBatchCount: 0 
          });
          log('✅ Plan overlay limpiado al completar pintado');
        }
      } catch (e) {
        log('⚠️ Error limpiando plan overlay:', e);
      }
      if (onComplete) {
        onComplete(true, imageState.paintedPixels);
      }
    }
  } catch (error) {
    log('Error en proceso de pintado:', error);
    stopChargeMonitoring();
    if (onError) {
      onError(error);
    }
  }
}

export async function paintPixelBatch(batch, providedToken = null) {
  try {
    if (!batch || batch.length === 0) {
      return { success: false, painted: 0, error: 'Lote vacío' };
    }
    
    // Agrupar el lote por tile como hace wplacer
    const byTile = new Map(); // key: `${tx},${ty}` -> { coords: [], colors: [], tx: p.tileX, ty: p.tileY }
    for (const p of batch) {
      const key = `${p.tileX},${p.tileY}`;
      if (!byTile.has(key)) byTile.set(key, { coords: [], colors: [], tx: p.tileX, ty: p.tileY });
      const bucket = byTile.get(key);
      bucket.coords.push(p.localX, p.localY);
      bucket.colors.push(p.color.id || p.color.value || 1);
    }

  // Obtener un único token (reutilizar si se pasa desde nivel superior)
  const token = providedToken !== undefined ? providedToken : await ensureToken();

    let totalPainted = 0;
    for (const { coords, colors, tx, ty } of byTile.values()) {
      if (colors.length === 0) continue;
      // Saneado extra de coords (0..999) y depuración de rangos
      const sanitized = [];
      for (let i = 0; i < coords.length; i += 2) {
        const x = ((Number(coords[i]) % 1000) + 1000) % 1000;
        const y = ((Number(coords[i + 1]) % 1000) + 1000) % 1000;
        // Filtrar NaN/undefined
        if (Number.isFinite(x) && Number.isFinite(y)) {
          sanitized.push(x, y);
        }
      }
      // Log de diagnóstico
      try {
        let minX = 999, maxX = 0, minY = 999, maxY = 0;
        for (let i = 0; i < sanitized.length; i += 2) {
          const x = sanitized[i], y = sanitized[i + 1];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        log(`[IMG] Enviando tile ${tx},${ty}: ${colors.length} px | x:[${minX},${maxX}] y:[${minY},${maxY}]`);
      } catch {
        // noop (solo diagnóstico)
      }

      const resp = await postPixelBatchImage(tx, ty, sanitized, colors, token);
      if (resp.status !== 200) {
        return {
          success: false,
          painted: totalPainted,
          error: resp.json?.message || `HTTP ${resp.status}`,
          status: resp.status
        };
      }
      
      // Verificar que realmente se pintaron píxeles
      const actualPainted = resp.painted || 0;
      if (actualPainted === 0 && colors.length > 0) {
        log(`⚠️ API devolvió 200 OK pero painted=0 para ${colors.length} píxeles en tile ${tx},${ty}`);
        // Considerar esto como un fallo parcial para activar reintentos
        return {
          success: false,
          painted: totalPainted,
          error: `API devolvió painted=0 para ${colors.length} píxeles`,
          status: 200,
          shouldRetry: true
        };
      }
      
      totalPainted += actualPainted;
      log(`✅ Tile ${tx},${ty}: ${actualPainted}/${colors.length} píxeles pintados exitosamente`);
    }

    return { success: true, painted: totalPainted };
  } catch (error) {
    log('Error en paintPixelBatch:', error);
    return {
      success: false,
      painted: 0,
      error: error.message
    };
  }
}

// Variables para controlar logs de errores repetitivos
let _lastNetworkErrorLog = 0;
let _consecutiveNetworkErrors = 0;
const NETWORK_ERROR_LOG_THROTTLE = 60000; // 1 minuto entre logs de errores de red

// Función de pintado con sistema de reintentos (adaptado del Auto-Farm)
export async function paintPixelBatchWithRetry(batch, onProgress) {
  const maxAttempts = 5; // 5 intentos como en el Farm
  const baseDelay = 3000; // Delay base de 3 segundos
  let token = null;

  // Obtener un token una sola vez antes de los reintentos
  try {
    token = await ensureToken();
  } catch (e) {
    log('⚠️ No se pudo obtener token inicial, se intentará en el primer intento:', e.message);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Si no tenemos token todavía (fallo al inicio) intentar generarlo ahora
      if (!token) {
        token = await ensureToken();
      }

      const result = await paintPixelBatch(batch, token);

      if (result.success) {
        imageState.retryCount = 0; // Reset en éxito
        _consecutiveNetworkErrors = 0; // Reset contador de errores
        return result;
      }

      // Token inválido / expirado -> regenerar inmediatamente y repetir intento sin penalizar backoff completo
      if (result.status === 403) {
        log('🔐 403 recibido: invalidando y regenerando token para reintento inmediato');
        try {
          token = await ensureToken(true); // forzar nuevo token
          // Reintentar el mismo intento (no incrementar backoff extra)
          continue;
        } catch (regenErr) {
          log('❌ Falló regeneración de token tras 403:', regenErr.message);
        }
      }

      imageState.retryCount = attempt;

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Backoff exponencial
        const delaySeconds = Math.round(delay / 1000);

        // Determinar tipo de error para mensaje específico
        let errorMessage;
        const isNetworkError = result.status === 0 || result.status === 'NetworkError';

        if (isNetworkError) {
          _consecutiveNetworkErrors++;
          const now = Date.now();

          // Solo loggear errores de red cada minuto o en el primer error
          if (now - _lastNetworkErrorLog > NETWORK_ERROR_LOG_THROTTLE || _consecutiveNetworkErrors === 1) {
            log(`🌐 Error de red (${_consecutiveNetworkErrors} consecutivos). Reintento ${attempt}/${maxAttempts} en ${delaySeconds}s`);
            _lastNetworkErrorLog = now;
          }

          errorMessage = t('image.networkError');
        } else if (result.status >= 500) {
          errorMessage = t('image.serverError');
          log(`🔧 Error del servidor ${result.status}. Reintento ${attempt}/${maxAttempts} en ${delaySeconds}s`);
        } else if (result.status === 408) {
          errorMessage = t('image.timeoutError');
          log(`⏱️ Timeout. Reintento ${attempt}/${maxAttempts} en ${delaySeconds}s`);
        } else {
          errorMessage = t('image.retryAttempt', {
            attempt,
            maxAttempts,
            delay: delaySeconds
          });
          log(`🔄 Reintento ${attempt}/${maxAttempts} después de ${delaySeconds}s. Error: ${result.error}`);
        }

        if (onProgress) {
          onProgress(imageState.paintedPixels, imageState.totalPixels, errorMessage);
        }

        await sleep(delay);
      }
    } catch (error) {
      imageState.retryCount = attempt;

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        const delaySeconds = Math.round(delay / 1000);

        // Si la excepción pudiera ser por token inválido, intentamos regenerar inmediatamente
        if (/403/.test(error?.message || '')) {
          try {
            log('🔐 Excepción potencial de token, regenerando...');
            token = await ensureToken(true);
            continue; // Reintentar mismo intento
          } catch (regenErr) {
            log('❌ Falló regeneración tras excepción 403:', regenErr.message);
          }
        }

        if (attempt === 1 || attempt % 3 === 0) {
          log(`❌ Excepción en intento ${attempt}:`, error.message);
        }

        const errorMessage = t('image.retryError', {
          attempt,
          maxAttempts,
          delay: delaySeconds
        });

        if (onProgress) {
          onProgress(imageState.paintedPixels, imageState.totalPixels, errorMessage);
        }

        await sleep(delay);
      }
    }
  }

  imageState.retryCount = maxAttempts;
  const failMessage = t('image.retryFailed', { maxAttempts });

  if (onProgress) {
    onProgress(imageState.paintedPixels, imageState.totalPixels, failMessage);
  }

  log(`💥 Falló después de ${maxAttempts} intentos, continuando con siguiente lote`);

  // Retornar un resultado de fallo que permita continuar
  return {
    success: false,
    painted: 0,
    error: `Falló después de ${maxAttempts} intentos`,
    shouldContinue: true // Indica que debe continuar con el siguiente lote
  };
}

export async function paintPixelBatch_ORIGINAL(batch) {
  try {
    if (!batch || batch.length === 0) {
      return { success: false, painted: 0, error: 'Lote vacío' };
    }
    
    // Convertir el lote al formato esperado por la API
    const coords = [];
    const colors = [];
    let tileX = null;
    let tileY = null;
    
    for (const pixel of batch) {
      coords.push(pixel.localX, pixel.localY);
      colors.push(pixel.color.id || pixel.color.value || 1);
      
      // Tomar tileX/tileY del primer píxel (todos deberían tener el mismo tile)
      if (tileX === null) {
        tileX = pixel.tileX;
        tileY = pixel.tileY;
      }
    }
    
    // Obtener token de Turnstile
    const token = await ensureToken();
    
    // Enviar píxeles usando el formato correcto
    const response = await postPixelBatchImage(tileX, tileY, coords, colors, token);
    
    if (response.status === 200) {
      return {
        success: true,
        painted: response.painted,
        response: response.json
      };
    } else {
      return {
        success: false,
        painted: 0,
        error: response.json?.message || `HTTP ${response.status}`,
        status: response.status
      };
    }
  } catch (error) {
    log('Error en paintPixelBatch:', error);
    return {
      success: false,
      painted: 0,
      error: error.message
    };
  }
}

async function waitForCooldown(chargesNeeded, onProgress) {
  const chargeTime = IMAGE_DEFAULTS.CHARGE_REGEN_MS * chargesNeeded;
  const waitTime = chargeTime + 5000; // Tiempo necesario + 5 segundos de seguridad
  
  // Verificar si el bot se ha detenido antes de iniciar el cooldown
  if (imageState.stopFlag) {
    log(`🛑 Bot detenido, cancelando cooldown`);
    return;
  }
  
  log(`Esperando ${Math.round(waitTime/1000)}s para obtener ${chargesNeeded} cargas`);
  
  // Configurar timestamps para manejo de visibilidad
  const startTime = Date.now();
  cooldownStartTime = startTime;
  cooldownDuration = waitTime;
  
  // Actualizar estado de cooldown
  imageState.inCooldown = true;
  imageState.cooldownEndTime = startTime + waitTime;
  imageState.nextBatchCooldown = Math.round(waitTime / 1000);
  
  if (onProgress) {
    const minutes = Math.floor(waitTime / 60000);
    const seconds = Math.floor((waitTime % 60000) / 1000);
    const timeText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    const message = t('image.waitingChargesRegen', {
      current: Math.floor(imageState.currentCharges),
      needed: chargesNeeded,
      time: timeText
    });
    onProgress(imageState.paintedPixels, imageState.totalPixels, message);
  }
  
  // Usar timestamps en lugar de contador simple
  while (true) {
    const now = Date.now();
    const elapsed = now - startTime;
    const remaining = Math.max(0, waitTime - elapsed);
    
    // Verificar stopFlag al inicio de cada iteración
    if (imageState.stopFlag) {
      log(`🛑 Bot detenido durante cooldown con ${Math.ceil(remaining/1000)}s restantes`);
      break;
    }
    
    // Si ya terminó el cooldown, salir
    if (remaining <= 0) {
      break;
    }
    
    const remainingSeconds = Math.ceil(remaining / 1000);
    imageState.nextBatchCooldown = remainingSeconds;
    
    // Actualizar progreso cada 30 segundos, o en los últimos 30 segundos cada 10 segundos
    const shouldUpdateProgress = remainingSeconds % 30 === 0 || 
                                (remainingSeconds <= 30 && remainingSeconds % 10 === 0) ||
                                remainingSeconds <= 5 ||
                                elapsed < 2000; // Primera actualización
    
    if (onProgress && shouldUpdateProgress) {
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      const timeText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      const message = t('image.waitingChargesCountdown', {
        current: Math.floor(imageState.currentCharges),
        needed: chargesNeeded,
        time: timeText
      });
      onProgress(imageState.paintedPixels, imageState.totalPixels, message);
    }
    
    // Esperar 1 segundo o el tiempo restante si es menor
    await sleep(Math.min(1000, remaining));
  }
  
  // Limpiar variables de cooldown
  imageState.inCooldown = false;
  imageState.nextBatchCooldown = 0;
  cooldownStartTime = null;
  cooldownDuration = null;
  wasHiddenDuringCooldown = false;
  
  // Solo simular regeneración de cargas si el bot no se detuvo
  if (!imageState.stopFlag) {
    imageState.currentCharges = Math.min(
      imageState.maxCharges || 9999, // usar maxCharges del estado
      imageState.currentCharges + (waitTime / IMAGE_DEFAULTS.CHARGE_REGEN_MS)
    );
  }
}

function generatePixelQueue(imageData, startPosition, baseTileX, baseTileY) {
  const { x: localStartX, y: localStartY } = startPosition;
  const queue = [];
  
  // Manejar diferentes tipos de imageData
  let pixels;
  
  // Si imageData tiene una propiedad processor (Blue Marble)
  if (imageData && imageData.processor && typeof imageData.processor.generatePixelQueue === 'function') {
    pixels = imageData.processor.generatePixelQueue();
  }
  // Si imageData tiene un método generatePixelQueue (Blue Marble processor)
  else if (imageData && typeof imageData.generatePixelQueue === 'function') {
    pixels = imageData.generatePixelQueue();
  }
  // Si imageData ya tiene pixels como array
  else if (imageData && Array.isArray(imageData.pixels)) {
    pixels = imageData.pixels;
  }
  // Si imageData.pixels es una función (resultado de getImageData())
  else if (imageData && typeof imageData.pixels === 'function') {
    pixels = imageData.pixels();
  }
  // Fallback: intentar acceder directamente a pixels
  else if (imageData && imageData.pixels) {
    pixels = imageData.pixels;
  }
  else {
    log(`❌ Error: No se pueden obtener píxeles de imageData. Tipo: ${typeof imageData}`, imageData);
    return [];
  }

  // Verificar si pixels es un array iterable
  if (!Array.isArray(pixels)) {
    log(`❌ Error: pixels no es un array iterable. Tipo: ${typeof pixels}`, pixels);
    return [];
  }

  for (const pixelData of pixels) {
    if (!pixelData) continue;
    
    // Manejar diferentes formatos de píxel
    // Formato Blue Marble: imageX, imageY, color
    // Formato clásico: x, y, targetColor
    const pixelX = pixelData.imageX !== undefined ? pixelData.imageX : pixelData.x;
    const pixelY = pixelData.imageY !== undefined ? pixelData.imageY : pixelData.y;
    const pixelColor = pixelData.color !== undefined ? pixelData.color : pixelData.targetColor;
    
    if (pixelX === undefined || pixelY === undefined) {
      log(`⚠️ Píxel con coordenadas inválidas:`, pixelData);
      continue;
    }
    
    // global dentro del mosaico base, puede exceder 0..999 y cruzar a otros tiles
    const globalX = localStartX + pixelX;
    const globalY = localStartY + pixelY;
    const tileOffsetX = Math.floor(globalX / 1000);
    const tileOffsetY = Math.floor(globalY / 1000);
    const tx = baseTileX + tileOffsetX;
    const ty = baseTileY + tileOffsetY;
    const localX = ((globalX % 1000) + 1000) % 1000; // asegurar 0..999
    const localY = ((globalY % 1000) + 1000) % 1000;
    
    queue.push({
      imageX: pixelX,
      imageY: pixelY,
      localX,
      localY,
      tileX: tx,
      tileY: ty,
      color: pixelColor,
      originalColor: pixelData.originalColor
    });
  }

  log(`Cola de píxeles generada: ${queue.length} píxeles para pintar`);
  return queue;
}

function calculateEstimatedTime() {
  if (!imageState.remainingPixels || imageState.remainingPixels.length === 0) {
    return 0;
  }
  
  const remainingPixels = imageState.remainingPixels.length;
  const batchSize = imageState.pixelsPerBatch;
  const chargeRegenTime = IMAGE_DEFAULTS.CHARGE_REGEN_MS / 1000; // en segundos
  
  // Calcular número de lotes necesarios
  const batchesNeeded = Math.ceil(remainingPixels / batchSize);
  
  // Tiempo de espera entre lotes (cada píxel necesita 1 carga, cada carga tarda 30s)
  const waitTimeBetweenBatches = batchSize * chargeRegenTime;
  
  // Tiempo total estimado
  const totalWaitTime = (batchesNeeded - 1) * waitTimeBetweenBatches;
  const executionTime = batchesNeeded * 2; // ~2 segundos por lote de ejecución
  
  return Math.ceil(totalWaitTime + executionTime);
}

export { calculateEstimatedTime, startChargeMonitoring, stopChargeMonitoring };

export function stopPainting() {
  imageState.stopFlag = true;
  imageState.running = false;
  stopChargeMonitoring();
  log('🛑 Deteniendo proceso de pintado...');
}

export function pausePainting() {
  imageState.stopFlag = true;
  stopChargeMonitoring();
  log('⏸️ Pausando proceso de pintado...');
}

export function resumePainting() {
  imageState.stopFlag = false;
  imageState.running = true;
  if (imageState.remainingPixels.length > 0) {
    startChargeMonitoring();
  }
  log('▶️ Reanudando proceso de pintado...');
}
