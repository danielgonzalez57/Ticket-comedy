// Actualiza los comediantes de los shows del seed (sin tocar órdenes).
// Uso: node scripts/update-comedians.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const LINEUPS = {
  "Noche de Risa": ["Led Varela", "Nanutria", "Jelambie", "Jean"],
  "Open Mic Valencia": [
    "María Laura Pinto",
    "Ernesto Pinto",
    "Calvo Roots",
    "Carluis Medina",
  ],
  "Especial de Fin de Año": [
    "Led Varela",
    "Nanutria",
    "Jelambie",
    "María Laura Pinto",
    "Ernesto Pinto",
    "Jean",
    "Calvo Roots",
    "Carluis Medina",
  ],
};

for (const [name, comedians] of Object.entries(LINEUPS)) {
  const { error, count } = await supabase
    .from("shows")
    .update({ comedians }, { count: "exact" })
    .eq("name", name);
  if (error) {
    console.error(`✗ ${name}:`, error.message);
  } else {
    console.log(`✓ ${name} → ${comedians.join(", ")} (${count ?? 0} fila)`);
  }
}

console.log("\n✅ Comediantes actualizados.");
