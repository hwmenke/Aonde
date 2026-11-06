import test from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../scripts/monitor.js";

for (const scenario of ["failure", "success", "partial"]) {
  test(`monitor CLI sets exit status and prints summary for ${scenario}`, (t) => {
    const previousExitCode = process.exitCode;
    t.after(() => { process.exitCode = previousExitCode; });
    process.exitCode = 0;
    const stdout = [];
    const stderr = [];
    t.mock.method(console, "log", (line) => stdout.push(line));
    t.mock.method(console, "error", (line) => stderr.push(line));

    runCli({
      ok: scenario !== "failure",
      offers: [],
      perRoute: {
        "GRU-LIS": scenario === "failure"
          ? { ok: false, error: "falha simulada" }
          : { ok: true, dealsFound: 0 },
        "GRU-MIA": scenario !== "success"
          ? { ok: false, error: "falha simulada" }
          : { ok: true, dealsFound: 0 },
      },
    });

    assert.equal(process.exitCode, scenario === "failure" ? 1 : 0);
    assert.match(stdout.join("\n"), /Total: 0 oferta\(s\)/);
    assert.match(stdout.join("\n"), scenario === "failure" ? /FALHA GRU-LIS/ : /OK    GRU-LIS/);
    assert.match(stdout.join("\n"), scenario === "success" ? /OK    GRU-MIA/ : /FALHA GRU-MIA/);
    assert.deepEqual(stderr, scenario === "failure"
      ? ["Monitor falhou: nenhuma rota com sucesso."] : []);
  });
}
