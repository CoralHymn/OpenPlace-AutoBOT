import { log } from "./logger.js";
import { createShadowRoot, makeDraggable } from "./ui-utils.js";
import { coordinateCapture } from "./capture.js";
import { initializeTokenInterceptor, getInterceptorStatus } from "./token-interceptor.js";
import { getFingerprint, getPawtectToken } from "./turnstile.js";

// Estado global para evitar múltiples ventanas
let tokenCaptureWindow = null;
let isCapturing = false;

/**
 * Crea y muestra la ventana de captura de tokens
 * @param {Object} options - Opciones de configuración
 * @param {Function} options.onTokenCaptured - Callback cuando se captura un token
 * @param {Function} options.onSkip - Callback cuando se presiona Skip
 * @param {string} options.botName - Nombre del bot que está iniciando
 */
export function showTokenCaptureWindow({ onTokenCaptured, onSkip, botName = 'Bot' }) {
  // Si ya existe una ventana, no crear otra
  if (tokenCaptureWindow) {
    log('⚠️ Ventana de captura de tokens ya existe');
    return;
  }

  log('🎯 Mostrando ventana de captura de tokens para:', botName);

  // Crear la ventana
  const { host, root } = createShadowRoot('wpl-token-capture');
  tokenCaptureWindow = host;

  // Estilos de la ventana
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    
    @keyframes wpa-blink-orange {
      0%, 100% { background: transparent; border-color: #f59e0b; color: #fde68a; }
      50% { background: #f59e0b33; border-color: #f59e0b; color: #fff; }
    }
    
    .panel {
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 700px;
      max-width: 95vw;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 8px;
      color: #e5e7eb;
      font-family: system-ui, 'Segoe UI', Roboto, Helvetica, Arial;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      overflow: hidden;
      animation: slideIn 0.3s ease-out;
      transition: opacity 0.3s ease;
    }
    
    .panel.capturing {
      opacity: 0.7;
      pointer-events: none;
    }
    
    .panel.capturing .body {
      pointer-events: auto;
    }
    
    .panel.token-captured {
      opacity: 1;
      pointer-events: auto;
      transition: opacity 0.5s ease-in-out;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #111827;
      color: #93c5fd;
      padding: 12px 16px;
      font-weight: 600;
      cursor: move;
      user-select: none;
    }
    
    .body {
      padding: 12px 16px;
    }
    
    .title {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #93c5fd;
      text-align: center;
    }
    
    .description {
      font-size: 12px;
      line-height: 1.3;
      margin-bottom: 12px;
      color: #cbd5e1;
      text-align: center;
    }
    
    .status {
      background: #111827;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 12px;
      text-align: center;
    }
    
    .status.waiting {
      color: #fbbf24;
      border: 1px solid #f59e0b;
    }
    
    .status.success {
      color: #34d399;
      border: 1px solid #10b981;
    }
    
    .status.error {
      color: #f87171;
      border: 1px solid #ef4444;
    }
    
    .buttons {
      display: flex;
      gap: 12px;
      margin-top: 12px;
    }
    
    .btn {
      flex: 1;
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 13px;
    }
    
    .btn.primary {
      background: #2563eb;
      color: #fff;
    }
    
    .btn.primary:hover {
      background: #1d4ed8;
    }
    
    .btn.primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .btn.ghost {
      background: transparent;
      border: 1px solid #374151;
      color: #e5e7eb;
    }
    
    .btn.ghost:hover {
      background: #1f2937;
    }
    
    .btn.capture {
      background: transparent;
      border: 2px solid #f59e0b;
      color: #fde68a;
    }
    
    .btn.capture:hover {
      background: #f59e0b33;
    }
    
    .btn.capture.active {
      animation: wpa-blink-orange 1s infinite;
    }
    

  `;
  root.appendChild(style);

  // Crear el contenido de la ventana
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="header">
      <span>🎯 Captura de Token - ${botName}</span>
    </div>
    <div class="body">
      <div class="title">Captura de Sesión Requerida</div>
      <div class="description">
        Para que el bot funcione correctamente, necesitamos capturar los tokens de tu sesión.
        Esto solo se hace una vez por sesión.
      </div>
      

      
      <div class="status waiting" id="capture-status">
        ⏳ Esperando inicio de captura...
      </div>
      
      <div class="buttons">
        <button class="btn capture" id="capture-btn">🎯 Iniciar Captura</button>
        <button class="btn ghost" id="skip-btn">⏭️ Omitir</button>
      </div>
    </div>
  `;
  
  root.appendChild(panel);

  // Hacer la ventana arrastrable
  const header = panel.querySelector('.header');
  makeDraggable(header, host);

  // Referencias a elementos
  const captureBtn = panel.querySelector('#capture-btn');
  const skipBtn = panel.querySelector('#skip-btn');
  const statusEl = panel.querySelector('#capture-status');

  // Estado de captura
  let captureTimeout = null;

  // Función para actualizar el estado
  function updateStatus(message, type = 'waiting') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }

  // Función para cerrar la ventana
  function closeWindow() {
    if (tokenCaptureWindow) {
      tokenCaptureWindow.remove();
      tokenCaptureWindow = null;
      isCapturing = false;
      if (captureTimeout) {
        clearTimeout(captureTimeout);
        captureTimeout = null;
      }
      // Limpiar listener de mensajes
      if (tokenMessageListener) {
        window.removeEventListener('message', tokenMessageListener);
        tokenMessageListener = null;
      }
      // Remover clase de captura
      if (panel) {
        panel.classList.remove('capturing');
      }
      // Deshabilitar captura de coordenadas
      coordinateCapture.disable();
    }
  }

  // Listener para mensajes de tokens interceptados
  let tokenMessageListener = null;
  
  // Función para manejar tokens interceptados
  function handleTokenMessage(event) {
    const data = event?.data;
    
    if (data && data.__wplace === true && data.type === 'token_found' && isCapturing) {
      // Log removed for security - token intercepted
      
      // Verificar que tenemos los tokens necesarios
      const fp = getFingerprint();
      const pawtect = getPawtectToken();
      
      if (fp && pawtect) {
        log('✅ Tokens completos disponibles');
        updateStatus('✅ ¡Tokens capturados exitosamente!', 'success');
        
        // Restaurar opacidad con animación suave
        panel.classList.remove('capturing');
        panel.classList.add('token-captured');
        
        // Deshabilitar captura
        coordinateCapture.disable();
        
        // Esperar un momento antes de cerrar
        setTimeout(() => {
          closeWindow();
          if (onTokenCaptured) {
            onTokenCaptured({
              fingerprint: fp,
              pawtectToken: pawtect,
              coordinates: {
                worldX: data.worldX,
                worldY: data.worldY,
                success: true
              }
            });
          }
        }, 1500);
      }
    }
  }

  // Manejar clic en captura
  captureBtn.addEventListener('click', async () => {
    if (isCapturing) return;
    
    isCapturing = true;
    captureBtn.disabled = true;
    captureBtn.classList.add('active');
    captureBtn.textContent = '🔄 Capturando...';
    
    // Agregar clase para cambiar opacidad
    panel.classList.add('capturing');
    
    updateStatus('🎯 Captura iniciada. Pinta un píxel manualmente...', 'waiting');
    
    // Asegurar que el interceptor esté activo
    const status = getInterceptorStatus();
    if (!status.initialized) {
      initializeTokenInterceptor({ enabled: true });
    }
    
    // Agregar listener para mensajes de tokens
    if (!tokenMessageListener) {
      tokenMessageListener = handleTokenMessage;
      window.addEventListener('message', tokenMessageListener);
      log('🎯 Listener de tokens agregado');
    }
    
    // Activar captura de coordenadas como respaldo
    coordinateCapture.enable((result) => {
      if (result.success && isCapturing) {
        log('✅ Coordenadas capturadas como respaldo:', result);
        // El token debería haber sido interceptado ya, pero verificamos
        const fp = getFingerprint();
        const pawtect = getPawtectToken();
        
        if (fp && pawtect) {
          updateStatus('✅ ¡Token capturado exitosamente!', 'success');
          
          // Restaurar opacidad con animación suave
          panel.classList.remove('capturing');
          panel.classList.add('token-captured');
          
          setTimeout(() => {
            closeWindow();
            if (onTokenCaptured) {
              onTokenCaptured({
                fingerprint: fp,
                pawtectToken: pawtect,
                coordinates: result
              });
            }
          }, 1500);
        }
      }
    });
    
    // Timeout de 30 segundos
    captureTimeout = setTimeout(() => {
      if (isCapturing) {
        coordinateCapture.disable();
        updateStatus('⏰ Tiempo agotado. Intenta de nuevo.', 'error');
        captureBtn.disabled = false;
        captureBtn.classList.remove('active');
        captureBtn.textContent = '🎯 Reintentar';
        isCapturing = false;
        
        // Remover clase de captura
        panel.classList.remove('capturing');
        
        // Remover listener
        if (tokenMessageListener) {
          window.removeEventListener('message', tokenMessageListener);
          tokenMessageListener = null;
        }
      }
    }, 30000);
  });

  // Manejar clic en skip
  skipBtn.addEventListener('click', () => {
    log('⏭️ Usuario omitió la captura de tokens');
    
    // Asegurar que el interceptor esté activo para capturas futuras
    const status = getInterceptorStatus();
    if (!status.initialized) {
      initializeTokenInterceptor({ enabled: true });
      log('🔧 Token interceptor activado para capturas futuras');
    }
    
    closeWindow();
    if (onSkip) {
      onSkip();
    }
  });

  // Verificar si ya tenemos tokens
  const existingFp = getFingerprint();
  const existingPawtect = getPawtectToken();
  
  if (existingFp && existingPawtect) {
    updateStatus('✅ Tokens ya disponibles en la sesión', 'success');
    captureBtn.textContent = '✅ Continuar';
    captureBtn.addEventListener('click', () => {
      closeWindow();
      if (onTokenCaptured) {
        onTokenCaptured({
          fingerprint: existingFp,
          pawtectToken: existingPawtect,
          coordinates: null
        });
      }
    }, { once: true });
  }
}

/**
 * Cierra la ventana de captura de tokens si está abierta
 */
export function closeTokenCaptureWindow() {
  if (tokenCaptureWindow) {
    tokenCaptureWindow.remove();
    tokenCaptureWindow = null;
    isCapturing = false;
  }
}

/**
 * Verifica si la ventana de captura está abierta
 */
export function isTokenCaptureWindowOpen() {
  return tokenCaptureWindow !== null;
}

/**
 * Función principal para mostrar la ventana antes de iniciar un bot
 * @param {string} botName - Nombre del bot
 * @returns {Promise} - Resuelve cuando se captura el token o se omite
 */
export function requireTokenCapture(botName) {
  return new Promise((resolve) => {
    // Si ya tenemos tokens, resolver inmediatamente
    const existingFp = getFingerprint();
    const existingPawtect = getPawtectToken();
    
    if (existingFp && existingPawtect) {
      log('✅ Tokens ya disponibles, omitiendo ventana de captura');
      // Asegurar que el interceptor esté activo
      const status = getInterceptorStatus();
      if (!status.initialized) {
        initializeTokenInterceptor({ enabled: true });
      }
      resolve({ 
        captured: true, 
        fingerprint: existingFp, 
        pawtectToken: existingPawtect 
      });
      return;
    }

    // Mostrar ventana de captura
    showTokenCaptureWindow({
      botName,
      onTokenCaptured: (data) => {
        resolve({ captured: true, ...data });
      },
      onSkip: () => {
        resolve({ captured: false, skipped: true });
      }
    });
  });
}