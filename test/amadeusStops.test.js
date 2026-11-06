import test from "node:test";
import assert from "node:assert/strict";
import { mapAmadeusOffersToFlights } from "../src/flights/mapAmadeus.js";
import { filtrosDosVoos } from "../src/render/filtrosVoo.js";

function itinerary(stops) {
  return {
    duration: "PT4H",
    segments: stops.map((numberOfStops, index) => ({
      departure: { iataCode: index === 0 ? "GRU" : "BSB", at: "2026-12-01T08:00:00" },
      arrival: { iataCode: index === stops.length - 1 ? "REC" : "BSB", at: "2026-12-01T12:00:00" },
      carrierCode: "AD",
      number: "1234",
      numberOfStops,
    })),
  };
}

for (const { name, stops, label, filter } of [
  { name: "single segment with a technical stop", stops: [1], label: "1 parada", filter: "1" },
  { name: "two segments with one connection", stops: [0, 0], label: "1 parada · BSB", filter: "1" },
  { name: "technical stops on both segments plus a connection", stops: [1, 2], label: "4 paradas · BSB", filter: "2+" },
  { name: "single segment with zero stops", stops: [0], label: "Direto", filter: "0" },
  { name: "missing technical stop count defaults to zero", stops: [undefined], label: "Direto", filter: "0" },
]) {
  test(`maps stops honestly: ${name}`, () => {
    const [flight] = mapAmadeusOffersToFlights({
      data: [{ itineraries: [itinerary(stops), itinerary(stops)], price: { total: "100", currency: "BRL" } }],
    });
    assert.equal(flight.direto, filter === "0");
    assert.equal(flight.paradas, label);
    assert.equal(flight.volta.direto, filter === "0");
    assert.equal(flight.volta.paradas, label.split(" · ")[0]);
    assert.deepEqual(filtrosDosVoos([flight])[0].opcoes.map(({ valor, n }) => ({ valor, n })), [{ valor: filter, n: 1 }]);
    if (stops.length === 1 && filter !== "0") {
      assert.match(flight.numero, /parada técnica/);
      assert.doesNotMatch(flight.numero, /direto|via|REC/);
      assert.doesNotMatch(flight.paradas, /REC/);
    }
  });
}

test("counts outbound and return stops independently", () => {
  const [flight] = mapAmadeusOffersToFlights({
    data: [{ itineraries: [itinerary([0]), itinerary([1])], price: { total: "100" } }],
  });
  assert.equal(flight.direto, true);
  assert.equal(flight.paradas, "Direto");
  assert.equal(flight.volta.direto, false);
  assert.equal(flight.volta.paradas, "1 parada");
});
