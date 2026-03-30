# Phase 6 Summary: CLI & Export

**Status: ✓ COMPLETADO**

## Entregado
- CLI headless `mcp-bench`:
  - `mcp-bench run --url --feature [--mcp] [--tokenCap]`
  - `mcp-bench debug [--runId] [--mcp]`
- Salida JSON estructurada en `run` y código de salida CI:
  - `0` si no hay fallos/hallucination
  - `1` si hay fallo/hallucination o uso inválido.
- `debug` imprime trazas legibles por paso desde runs persistidos.
- Export histórico ya integrado vía API JSON/CSV por run y lote.
- Integración de binario local:
  - `bin/mcp-bench.js`
  - `package.json` con `bin` y script `cli`.

## Archivos clave
- `src/cli/mcp-bench.ts`
- `bin/mcp-bench.js`
- `package.json`
- `src/server/api/history.ts`

## Verificación
- `node ./bin/mcp-bench.js --help` ✓
- `node ./bin/mcp-bench.js run --url ... --feature ...` ✓
- `npm test` ✓
