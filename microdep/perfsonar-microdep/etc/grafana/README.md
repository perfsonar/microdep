# Native Grafana panels for Microdep (starter)

A proof-of-concept showing the **hybrid** Grafana integration: tabular /
statistical / time-series views rendered **natively** in Grafana (querying the
same OpenSearch archive directly), while the geographic topology map stays the
custom app at `/microdep/` (linked from a panel).

This complements the existing `etc/grafana_dashboard_patch` (a "Microdep map"
button injected into the perfSONAR main dashboard) — it does not replace it.

## Files

| File | Purpose | Provision to |
|------|---------|--------------|
| `microdep-datasource.yaml`        | OpenSearch datasource for the `dragonlab` index (gap) | `…/grafana/provisioning/datasources/` |
| `microdep-jitter-datasource.yaml` | OpenSearch datasource for the `dragonlab_jitter` index (Queues/jitter) | `…/grafana/provisioning/datasources/` |
| `microdep-dashboards.yaml`        | Dashboard provider (loads the `dashboards/` dir into a "Microdep" folder) | `…/grafana/provisioning/dashboards/` |
| `dashboards/microdep-gaps.json`   | Native dashboard: total gaps (stat), gaps over time, top-10 source hosts, map button | `…/grafana/dashboards/microdep/` |
| `dashboards/microdep-map.json`    | The geographic map embedded full-size as an `<iframe>` to `/microdep/` | `…/grafana/dashboards/microdep/` |
| `dashboards/microdep-details.json`| Native dashboard: jitter percentiles over time, top link pairs by time-lost, source×target gap matrix (`esnet-matrix-panel`), gap/jitter data-freshness stats | `…/grafana/dashboards/microdep/` |

On a perfSONAR host the provisioning root is `/usr/lib/perfsonar/grafana/provisioning`
(`grafana.ini` → `[paths] provisioning`).

## Provision (manual, for testing)

```sh
install -m640 microdep-datasource.yaml         /usr/lib/perfsonar/grafana/provisioning/datasources/
install -m640 microdep-jitter-datasource.yaml  /usr/lib/perfsonar/grafana/provisioning/datasources/
install -m640 microdep-dashboards.yaml         /usr/lib/perfsonar/grafana/provisioning/dashboards/
install -d                                     /usr/lib/perfsonar/grafana/dashboards/microdep
install -m644 dashboards/microdep-gaps.json    /usr/lib/perfsonar/grafana/dashboards/microdep/
install -m644 dashboards/microdep-map.json     /usr/lib/perfsonar/grafana/dashboards/microdep/
install -m644 dashboards/microdep-details.json /usr/lib/perfsonar/grafana/dashboards/microdep/
systemctl restart grafana-server
```

Then open Grafana → Dashboards → **Microdep / Microdep — Gaps overview**.

## Notes / gotchas

- **Time field is `@timestamp`** (type `date`). The `timestamp` field is an
  epoch `float` and `datetime` is `text` — neither works as a Grafana time
  field or in `date_histogram`.
- **Term aggregations need `.keyword`** (e.g. `from.keyword`).
- **The embedded map** (`microdep-map.json`) relies on `[panels]
  disable_sanitize_html = true` in `grafana.ini` (so the Text panel keeps the
  `<iframe>`) and on `/microdep/` not sending a blocking `X-Frame-Options` /
  CSP `frame-ancestors` (it is same-origin with Grafana, so it frames fine).
- The datasource mirrors perfSONAR's own `perfsonar-local.yaml` (proxy access,
  `tlsSkipVerify`, flavor `opensearch`) but targets the `dragonlab` index with a
  distinct uid `microdep-dragonlab`, so it sits alongside the pscheduler one.

## Possible extensions

- **Per-link** table (from→to) via nested terms / multi-terms aggregation.
- **Severity** columns (avg/max `down_ppm`, time lost) once field names are
  confirmed against the gap mapping.
- **Other event types**: jitter ("Queues", index `dragonlab_jitter`,
  percentile metrics), route changes (`dragonlab_routemon`) — likely a second
  datasource per index, or an index-pattern datasource.
- **Multi-network**: Net-4 (`dragonlab`) vs Net-6 (`dragonlab_6`) as a
  datasource template variable (`${ds}`), the pattern perfSONAR dashboards use.
- **Heatmap** report natively via the installed `esnet-matrix-panel`.
- **Packaging**: wire these into the deb/rpm post-install the way
  `grafana_dashboard_patch` is, once the approach is agreed.
