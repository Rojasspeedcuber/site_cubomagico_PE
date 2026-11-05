import test from "node:test";
import assert from "node:assert/strict";
import * as frontend from "../components/frontend-utils";
import {
  parseTime,
  formatTime,
  safeUrl,
  contactHref,
  filterAlgorithms,
} from "../components/frontend-utils";

test("retorno da conta rejeita controles decodificados e destinos externos", () => {
  assert.equal(typeof frontend.safeReturnTo, "function", "safeReturnTo must validate the resolved redirect URL");
  const origin = "https://cubo.example";
  for (const value of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/admin\u0000", "/admin\u007f"]) {
    assert.equal(frontend.safeReturnTo(value, origin), undefined, JSON.stringify(value));
  }
  for (const encoded of ["/%09/evil.example", "/%0a/evil.example", "/%0d/evil.example"]) {
    const decoded = new URL(`${origin}/conta?next=${encoded}`).searchParams.get("next");
    assert.equal(frontend.safeReturnTo(decoded, origin), undefined, encoded);
  }
  assert.equal(frontend.safeReturnTo("/admin?tab=review#envios", origin), "/admin?tab=review#envios");
  assert.equal(frontend.safeReturnTo("/campeonatos/../admin?q=a%20b#ok", origin), "/admin?q=a%20b#ok");
  assert.equal(frontend.safeReturnTo("/", origin), "/");
});

test("tempos são convertidos em centésimos sem ponto flutuante", () => {
  assert.equal(parseTime("12,34"), 1234);
  assert.equal(parseTime("1:02.03"), 6203);
  assert.equal(parseTime("0.01"), 1);
  for (const value of ["-1", "1.234", "1:99.00", "", "NaN"])
    assert.equal(parseTime(value), null);
});
test("formata centésimos e DNF", () => {
  assert.equal(formatTime(1234), "12,34");
  assert.equal(formatTime(6203), "1:02,03");
  assert.equal(formatTime(null), "DNF");
});
test("links permitem apenas endereços HTTP(S)", () => {
  assert.equal(safeUrl("javascript:alert(1)"), undefined);
  assert.equal(safeUrl("https://user:secret@example.org"), undefined);
  assert.equal(safeUrl("https://example.org"), "https://example.org/");
  assert.equal(safeUrl(""), undefined);
});
test("contato aceita e-mail confirmado ou URL segura, sem cabeçalhos injetados", () => {
  assert.equal(
    contactHref("henrique@example.org"),
    "mailto:henrique@example.org",
  );
  assert.equal(
    contactHref("mailto:henrique@example.org"),
    "mailto:henrique@example.org",
  );
  assert.equal(
    contactHref("https://example.org/contato"),
    "https://example.org/contato",
  );
  assert.equal(contactHref("javascript:alert(1)"), undefined);
  assert.equal(contactHref("a@example.org?bcc=other@example.org"), undefined);
});
test("acervo busca sem acentos e filtra categoria", () => {
  const items = [
    {
      id: "a",
      name: "Permutação T",
      category: "PLL",
      algorithm: "R U",
      notes: "",
    },
    { id: "b", name: "Par", category: "F2L", algorithm: "U R", notes: "" },
  ];
  assert.deepEqual(
    filterAlgorithms(items, "permutacao", "PLL").map((x) => x.id),
    ["a"],
  );
  assert.equal(filterAlgorithms(items, "", "OLL").length, 0);
});
