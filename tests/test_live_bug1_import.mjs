import * as XLSX from "xlsx";
import assert from "node:assert/strict";
import https from "node:https";
import { parseExcel } from "../lib/import/parseExcel.ts";
import { DEFAULT_CONFIG } from "../lib/config.ts";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF || "jgjeaaozvjasgiizjdkd";

function runSql(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        port: 443,
        path: "/v1/projects/" + projectRef + "/database/query",
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log("==================================================");
  console.log("TESTING LIVE BUG 1: EXCEL -> PARSER -> MAPPING -> PERSISTENCIA");
  console.log("==================================================");

  // 1. Build an in-memory workbook with ONLY 'Nombre' and 'Celular' (no idSocio!)
  const testPhone = "2235998877";
  const testName = "Prueba BugUno";
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nombre Completo", "Celular"],
    [testName, testPhone],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  // 2. Parse Excel
  const parseResult = parseExcel(buffer, DEFAULT_CONFIG);
  console.log("Parse Result errors count:", parseResult.errores.length);
  console.log("Parsed students count:", parseResult.parsedStudents.length);
  assert.equal(parseResult.errores.length, 0, "No errors should occur when idSocio is absent");
  assert.equal(parseResult.parsedStudents.length, 1);
  const parsed = parseResult.parsedStudents[0];
  console.log("Parsed student:", parsed);
  assert.ok(parsed.idSocio, "Synthesized idSocio must exist");
  assert.equal(parsed.telefono, "5492235998877");
  assert.equal(parsed.nombreCompleto, "Prueba Buguno");

  // 3. Test persistence directly into Supabase (simulate import record + student update/insert)
  const orgRes = await runSql("SELECT id FROM organizations LIMIT 1;");
  const orgId = orgRes[0].id;

  // Create an import record
  const impRes = await runSql(`
    INSERT INTO import_records (organization_id, archivo, nuevos, actualizados, total, fecha)
    VALUES ('${orgId}', 'test_bug1.xlsx', 1, 0, 1, NOW())
    RETURNING id;
  `);
  const importId = impRes[0].id;
  console.log("Created test import_records id:", importId);

  // Insert student with synthesized id_socio and last_import_id
  const synthSocio = parsed.idSocio;
  const insertRes = await runSql(`
    INSERT INTO students (organization_id, id_socio, nombre, apellido, nombre_completo, telefono, telefono_raw, last_import_id)
    VALUES ('${orgId}', '${synthSocio}', '${parsed.nombre}', '${parsed.apellido}', '${parsed.nombreCompleto}', '${parsed.telefono}', '${parsed.telefonoRaw}', '${importId}')
    RETURNING id, id_socio, nombre_completo, telefono, last_import_id;
  `);
  console.log("Inserted student into Supabase:", insertRes[0]);
  const studentId = insertRes[0].id;
  assert.equal(insertRes[0].last_import_id, importId);
  assert.equal(insertRes[0].telefono, "5492235998877");

  // Verify querying by last_import_id
  const queryRes = await runSql(`
    SELECT id, nombre_completo, last_import_id 
    FROM students 
    WHERE last_import_id = '${importId}';
  `);
  console.log("Found students with last_import_id:", queryRes);
  assert.equal(queryRes.length, 1);
  assert.equal(queryRes[0].id, studentId);

  // Clean up test records
  await runSql(`DELETE FROM students WHERE id = '${studentId}';`);
  await runSql(`DELETE FROM import_records WHERE id = '${importId}';`);
  console.log("Cleaned up test student and import record.");

  console.log("==================================================");
  console.log("✓ LIVE BUG 1 FUNCTIONAL TEST PASSED FULLY!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
