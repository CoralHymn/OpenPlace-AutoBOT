import { build } from "esbuild";
import { copyFileSync } from "fs";

// Función para mostrar ayuda
function showHelp() {
  console.log(`
🤖 WPlace AutoBOT Build Tool

Uso: node build.mjs [opciones]

Opciones:
  --dev          Compilación en modo desarrollo (con sourcemaps)
  --watch        Modo watch para recompilación automática
  --farm         Compilar solo Auto-Farm.js
  --image        Compilar solo Auto-Image.js  
  --launcher     Compilar solo Auto-Launcher.js
  --guard        Compilar solo Auto-Guard.js
  --slave        Compilar solo Auto-Slave.js
  --extension    Compilar para extension (output en extension/bots/)
  --help         Mostrar esta ayuda

Ejemplos:
  node build.mjs                    # Compilar todos los bots
  node build.mjs --dev              # Compilar todos en modo desarrollo
  node build.mjs --farm --dev       # Compilar solo farm en modo desarrollo
  node build.mjs --image --guard    # Compilar solo image y guard
  node build.mjs --slave            # Compilar solo slave
  node build.mjs --watch            # Modo watch para todos los bots
`);
}

const args = new Set(process.argv.slice(2));

// Mostrar ayuda si se solicita
if (args.has("--help") || args.has("-h")) {
  showHelp();
  process.exit(0);
}

const dev = args.has("--dev");
const watch = args.has("--watch");

// Opciones para compilar bots específicos
const buildFarm = args.has("--farm");
const buildImage = args.has("--image");
const buildLauncher = args.has("--launcher");
const buildGuard = args.has("--guard");
const buildSlave = args.has("--slave");
const buildExtension = args.has("--extension");

// Si no se especifica ningún bot, compilar todos
const buildAll = !buildFarm && !buildImage && !buildLauncher && !buildGuard && !buildSlave;

// Por ahora, usar archivos originales hasta completar la migración
const useOriginals = false; // ✅ Migración del farm completada

if (useOriginals) {
  console.log("🔄 Usando archivos originales temporalmente...");
  
  try {
    copyFileSync("Auto-Farm.original.js", "Auto-Farm.js");
    copyFileSync("Auto-Image.original.js", "Auto-Image.js");
    copyFileSync("Auto-Launcher.original.js", "Auto-Launcher.js");
    
    console.log("✅ Archivos originales copiados exitosamente");
    console.log("📋 Para completar la migración modular, edita build.mjs y cambia useOriginals = false");
  } catch (error) {
    console.error("❌ Error copiando archivos originales:", error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

// Código de build modular (para cuando la migración esté completa)
const common = {
  bundle: true,
  format: "iife",             // ideal para bookmarklet
  target: ["es2019"],
  legalComments: "none",
  banner: {
    js:
      "/* WPlace AutoBOT — uso bajo tu responsabilidad. " +
      "Compilado " + new Date().toISOString() + " */" +
      "\n/* eslint-env browser */" + // Define entorno navegador para ESLint (WebSocket, Blob, URL, etc.)
      "\n/* eslint-disable no-empty */" // Bloques vacíos pueden generarse tras minificación
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production")
  }
};

(async () => {
  // Definir todos los bots disponibles
  const allBots = [
    { in: "src/entries/farm.js",     out: "Auto-Farm.js",     extOut: "farm.js",     flag: buildFarm },
    { in: "src/entries/image.js",    out: "Auto-Image.js",    extOut: "image.js",    flag: buildImage },
    { in: "src/entries/launcher.js", out: "Auto-Launcher.js", extOut: "launcher.js", flag: buildLauncher },
    { in: "src/entries/guard.js",    out: "Auto-Guard.js",    extOut: "guard.js",    flag: buildGuard },
    { in: "src/entries/slave.js",    out: "Auto-Slave.js",    extOut: "slave.js",    flag: buildSlave }
  ];

  // Filtrar qué bots compilar
  // Determine output directory (extension or root)
  const outDir = buildExtension ? "extension/bots/" : "";

  // Map bots with output paths (use extension names if building for extension)
  const botsWithPaths = allBots.map(bot => ({
    ...bot,
    out: outDir + (buildExtension ? bot.extOut : bot.out)
  }));

  const botsToCompile = buildAll ? botsWithPaths : botsWithPaths.filter(bot => bot.flag);
  
  if (botsToCompile.length === 0) {
    console.log("❌ No se especificó ningún bot válido para compilar.");
    console.log("💡 Usa: --farm, --image, --launcher, --guard, --slave o ninguna opción para compilar todos");
    process.exit(1);
  }

  console.log(`🚀 Compilando: ${botsToCompile.map(bot => bot.out).join(', ')}${buildExtension ? ' → extension/bots/' : ''}`);

  const jobs = botsToCompile.map(({ in: entry, out: outfile }) => {
    const buildOptions = {
      entryPoints: [entry],
      outfile,
      ...common,
      minify: !dev,
      sourcemap: dev ? "inline" : false
    };
    
    if (watch) {
      buildOptions.watch = {
        onRebuild(error) {
          if (error) console.error(`⛔ Rebuild failed for ${outfile}`, error);
          else console.log(`✅ Rebuilt ${outfile}`);
        }
      };
    }
    
    return build(buildOptions);
  });

  await Promise.all(jobs);
  
  const compiledFiles = botsToCompile.map(bot => bot.out).join(', ');
  console.log(`✨ Build ${dev ? "DEV" : "PROD"} listo.${buildExtension ? ' Extension en extension/bots/' : ''} Archivos compilados: ${compiledFiles}`);
})();
