// Loads the vendored kernel under Node (tests only).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import initOC from "../vendor/replicad_single.js";
import * as R from "../vendor/replicad.js";
export async function loadKernel() {
  const oc = await initOC({ wasmBinary: readFileSync(fileURLToPath(new URL("../vendor/replicad_single.wasm", import.meta.url))) });
  R.setOC(oc);
  return R;
}
