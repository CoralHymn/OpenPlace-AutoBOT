import { log } from "./logger.js";
import { requireTokenCapture } from "./token-capture-window.js";
import { getFingerprint, getPawtectToken } from "./turnstile.js";
import { initializeTokenInterceptor, getInterceptorStatus } from "./token-interceptor.js";

/**
 * Función principal para preparar tokens antes de iniciar un bot
 * Muestra la ventana de captura si es necesario
 * @param {string} botName - Nombre del bot que se está iniciando
 * @returns {Promise<Object>} - Resultado de la captura
 */
export async function prepareTokensForBot(botName = "Bot") {
  log(`🚀 [${botName}] Preparando tokens antes de iniciar`);
  
  try {
    // Asegurar que el interceptor esté inicializado
    const status = getInterceptorStatus();
    if (!status.initialized) {
      initializeTokenInterceptor({ enabled: true });
      log('🔧 Token interceptor inicializado');
    }
    
    // Usar la nueva ventana de captura
    const result = await requireTokenCapture(botName);
    
    if (result.captured) {
      log(`✅ [${botName}] Tokens preparados exitosamente`);
      return {
        success: true,
        fingerprint: result.fingerprint,
        pawtectToken: result.pawtectToken,
        coordinates: result.coordinates
      };
    } else if (result.skipped) {
      log(`⏭️ [${botName}] Usuario omitió la captura, interceptor activo para capturas futuras`);
      return {
        success: true,
        skipped: true,
        interceptorActive: true
      };
    }
    
    return { success: false };
  } catch (error) {
    log(`❌ [${botName}] Error preparando tokens:`, error);
    return { success: false, error };
  }
}

/**
 * Función de compatibilidad - reemplaza warmUpForTokens
 * @deprecated Usar prepareTokensForBot en su lugar
 */
export async function warmUpForTokens(context = "bot") {
  log(`⚠️ warmUpForTokens está deprecado, usar prepareTokensForBot`);
  const result = await prepareTokensForBot(context);
  return result.success;
}

/**
 * Función de compatibilidad - verifica si ya tenemos fingerprint
 * @deprecated El nuevo sistema maneja esto automáticamente
 */
export async function ensureFingerprintReady(context = "bot", options = {}) {
  log(`⚠️ ensureFingerprintReady está deprecado, usar prepareTokensForBot`);
  
  // Fast-path si ya existe
  const fp = getFingerprint();
  if (fp) {
    log(`🆔 [fp:${context}] Ya disponible`);
    return true;
  }
  
  // Usar el nuevo sistema
  const result = await prepareTokensForBot(context);
  return result.success && result.fingerprint;
}

/**
 * Verifica si tenemos tokens disponibles sin mostrar UI
 * @returns {Object} - Estado de los tokens
 */
export function checkTokensAvailable() {
  const fingerprint = getFingerprint();
  const pawtectToken = getPawtectToken();
  const interceptorStatus = getInterceptorStatus();
  
  return {
    hasFingerprint: !!fingerprint,
    hasPawtectToken: !!pawtectToken,
    interceptorReady: interceptorStatus.initialized && interceptorStatus.enabled,
    allReady: !!fingerprint && !!pawtectToken
  };
}
