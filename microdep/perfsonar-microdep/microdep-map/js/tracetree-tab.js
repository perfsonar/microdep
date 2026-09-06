/**
 * tracetree-tab.js — ES6 module refactored from perfsonar-tracetree/js/tracetree.js
 *
 * Exports a single function that creates an independent traceroute topology
 * visualisation inside the given container element.  Every piece of state is
 * local to the closure so that multiple instances can coexist on the same page.
 *
 * Removed from original:
 *   - All global variables (tree, positions, slices, mother, ...) — now local.
 *   - URL / onpopstate parameter parsing — params come from function args.
 *   - navigate()          — URL-based date navigation, not needed.
 *   - fetch_and_plot()    — loaded data from a <pre> element (legacy HTML).
 *   - fetch_and_plot_gv() — fetched graphviz text (legacy).
 *   - fetch_and_plot_topo() — fetched pre-built topo JSON (legacy).
 *   - plot_tree()         — parsed graphviz DOT text (legacy).
 *   - plot_trace()        — parsed text table from parent frame (legacy).
 *   - plot_hops() / Highcharts bubble chart — commented out in original.
 *   - get_path()          — extracted path components from URL (legacy).
 *   - update_slice() / update_timeslotOut() — bound to removed slider (#timeslot).
 *   - show_time_slice() / show_time_span() references to removed DOM ids
 *       (timespan, timestart, current_span) — replaced with scoped elements.
 *   - The entire $(document).ready / onpopstate init block.
 *   - Old UI controls (slider, raw_button, summary_button, tracepeers, etc.).
 *   - copy_tree() — empty stub in original.
 */

export function tracetree_tab(div_id, from, to, time_start, time_end, options = {}) {

    // ── Local aliases for the scoped container id ──────────────────────
    const id = div_id;

    // ── All mutable state local to this instance ──────────────────────
    let tree = null;            // vis.Network instance
    let positions = [];         // last known node positions
    let timeline = null;        // vis.Timeline instance
    let topology = null;        // { nodes: DataSet, edges: DataSet }

    let mother = { range: 86400 };
    let current_slice = mother;
    let in_slice = mother;
    let slices = [];
    slices.push(mother);

    let update_time = 0;
    const update_interval = 3000;
    let last_rangechange;
    let last_select;

    let last_tr = null;
    let last_tr_bgc;
    let copy_no = 0;

    const msts = 1;
    const slice_default = 10;
    const slide_max = 100;
    const max_parallel = 5;

    let destination = '';

    // ── Params from function arguments (replaces urlParams) ───────────
    const params = {
        from:       from,
        to:         to,
        mahost:     options.mahost  || '',
        verify_SSL: options.verify_SSL,
        api:        options.api     || '',
        'ip-version': options.ip_version,     // unset = all versions (issue #127)
        start:      time_start,
        end:        time_end
    };


    // ====================================================================
    //  Paths view - the same traces laid out by hop (issue #148 follow-up)
    // ====================================================================
    //
    // The force-directed topology places nodes wherever the physics settles, so
    // position carries no meaning and two reloads never agree. A traceroute has
    // an order built in - hop 1, hop 2, ... - and this view uses it: one lane
    // per hop, nodes side by side within the lane, ribbons between lanes whose
    // width is the number of traces that took that link. The dominant route is
    // the thickest band; the alternatives peel off and rejoin around it. Ribbon
    // colour is how much minimum RTT the hop adds, in the three bands hop
    // lengths naturally fall into (access / core / long haul).
    //
    // Two things keep it readable on a long path:
    //
    //  - Orientation. Top-down is the default: it reads like the traceroute
    //    listing itself, and every host name gets a lane of its own to sit in,
    //    written out in full. Left-to-right shows the whole path in one glance
    //    but has to place names in alternating rows above and below the
    //    diagram, tied to their node by a leader line.
    //
    //  - Compaction. A run of hops with no branching at all - one node in, one
    //    node out - carries no shape, only length. Such stretches fold into one
    //    segment ("hops 7-17, 11 hops, +19 ms") that opens on click, so a
    //    23-hop path draws as the handful of lanes where routes actually differ.

    let paths_dirty = true;
    const paths_state = { topN: 6, sel: null, vertical: true, compact: true, expanded: {} };
    const P_SRC_ID = '0|source';
    const P_MONO_PX = 6.5;                       // width of one character of the label font

    function paths_short(host) {
        if (/^\d+\*$/.test(host) || /^[\d.]+$/.test(host) || /:/.test(host)) return host;
        return host.split('.')[0];
    }

    // tr_data -> { nodes, links, routes, band, traces, maxttl }
    function build_paths_model(tr_data) {
        const nodes = {}, links = {}, order_n = [], order_l = [];
        const add_node = function (ttl, host) {
            const id = ttl + '|' + host;
            if (!nodes[id]) {
                nodes[id] = { id: id, ttl: ttl, host: host, short: ttl === 0 ? 'source' : paths_short(host), n: 0, rtts: [], star: /\*$/.test(host) };
                order_n.push(id);
            }
            return nodes[id];
        };
        const src = add_node(0, 'source');
        const routes = {};
        let maxttl = 0;
        for (const tr of tr_data) {
            src.n++;
            let prev = src, prev_rtt = 0;
            const key = [];
            for (const hop of tr.val) {
                const host = hop.hostname || hop.ip || (hop.ttl + '*');
                const node = add_node(hop.ttl, host);
                node.n++;
                if (typeof hop.rtt === 'number' && isFinite(hop.rtt)) node.rtts.push(hop.rtt);
                const lid = prev.id + '->' + node.id;
                if (!links[lid]) { links[lid] = { id: lid, from: prev.id, to: node.id, n: 0, deltas: [] }; order_l.push(lid); }
                links[lid].n++;
                if (typeof hop.rtt === 'number' && isFinite(hop.rtt)) {
                    links[lid].deltas.push(Math.max(0, hop.rtt - prev_rtt));
                    prev_rtt = hop.rtt;
                }
                key.push(host);
                if (hop.ttl > maxttl) maxttl = hop.ttl;
                prev = node;
            }
            const k = key.join(' ');
            if (!routes[k]) routes[k] = { hosts: key, n: 0, prof: {} };
            routes[k].n++;
            for (const hop of tr.val) {
                if (typeof hop.rtt === 'number' && isFinite(hop.rtt)) (routes[k].prof[hop.ttl] = routes[k].prof[hop.ttl] || []).push(hop.rtt);
            }
        }
        const median = function (a) { const b = a.slice().sort(function (x, y) { return x - y; }); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
        const out_nodes = order_n.map(function (id) {
            const n = nodes[id];
            return { id: n.id, ttl: n.ttl, host: n.host, short: n.short, n: n.n, star: n.star,
                     rmin: n.rtts.length ? Math.min.apply(null, n.rtts) : null, rmed: n.rtts.length ? median(n.rtts) : null };
        });
        const out_links = order_l.map(function (id) { const l = links[id]; return { id: l.id, from: l.from, to: l.to, n: l.n, dmin: l.deltas.length ? Math.min.apply(null, l.deltas) : null }; });
        const out_routes = Object.keys(routes).map(function (k) {
            const r = routes[k]; const prof = [0];
            for (let i = 1; i <= r.hosts.length; i++) prof.push(r.prof[i] ? median(r.prof[i]) : null);
            return { hosts: r.hosts, n: r.n, prof: prof };
        }).sort(function (a, b) { return b.n - a.n; });
        const band = [[0, 0]];
        for (let i = 1; i <= maxttl; i++) {
            let lo = Infinity, hi = -Infinity;
            for (const tr of tr_data) { const h = tr.val[i - 1]; if (h && typeof h.rtt === 'number' && isFinite(h.rtt)) { if (h.rtt < lo) lo = h.rtt; if (h.rtt > hi) hi = h.rtt; } }
            band.push(isFinite(lo) ? [lo, hi] : null);
        }
        const dom = out_routes[0];
        out_routes.forEach(function (r, i) {
            r.idx = i;
            r.links = {}; r.nodes = {}; r.nodes[P_SRC_ID] = true;
            let prev = P_SRC_ID;
            r.hosts.forEach(function (h, j) { const id = (j + 1) + '|' + h; r.links[prev + '->' + id] = true; r.nodes[id] = true; prev = id; });
            r.diverge = null;
            if (dom) { const m = Math.max(r.hosts.length, dom.hosts.length); for (let q = 0; q < m; q++) { if (r.hosts[q] !== dom.hosts[q]) { r.diverge = q + 1; break; } } }
        });
        return { nodes: out_nodes, links: out_links, routes: out_routes, band: band, traces: tr_data.length, maxttl: maxttl };
    }

    // Fold runs of hops that carry no branching into single segments. Returns a
    // view model with lanes (one per surviving hop or segment), nodes and links
    // re-pointed accordingly, and maps from the original ids.
    function compact_paths_model(M) {
        const cols = M.maxttl + 1;
        const byTtl = []; for (let c = 0; c < cols; c++) byTtl.push([]);
        M.nodes.forEach(function (n) { byTtl[n.ttl].push(n); });
        const outN = {}, inN = {};
        M.links.forEach(function (l) { outN[l.from] = (outN[l.from] || 0) + 1; inN[l.to] = (inN[l.to] || 0) + 1; });
        const straight = function (c) {
            if (c <= 0 || c >= cols - 1 || byTtl[c].length !== 1) return false;
            const n = byTtl[c][0];
            return (inN[n.id] || 0) === 1 && (outN[n.id] || 0) === 1 && !n.star;
        };
        // An opened segment stays open as a whole: once its first hop is laid
        // out on its own, the rest must not fold back into a fresh segment.
        const is_open = function (c, e) {
            return Object.keys(paths_state.expanded).some(function (k) {
                const m = /^S\|(\d+)-(\d+)$/.exec(k);
                return m && Number(m[1]) <= e && Number(m[2]) >= c;
            });
        };
        const lanes = [];
        let c = 0;
        while (c < cols) {
            if (paths_state.compact && straight(c)) {
                let e = c;
                while (e + 1 < cols && straight(e + 1)) e++;
                const key = 'S|' + c + '-' + e;
                if (e > c && !is_open(c, e)) { lanes.push({ key: key, from: c, to: e, collapsed: true }); c = e + 1; continue; }
                for (let t = c; t <= e; t++) lanes.push({ key: 'H|' + t, from: t, to: t, collapsed: false });
                c = e + 1; continue;
            }
            lanes.push({ key: 'H|' + c, from: c, to: c, collapsed: false });
            c++;
        }
        const laneOfTtl = {};
        lanes.forEach(function (ln, g) { ln.g = g; for (let t = ln.from; t <= ln.to; t++) laneOfTtl[t] = ln; });

        const idmap = {}, vnodes = [], vnodeById = {};
        lanes.forEach(function (ln) {
            if (!ln.collapsed) {
                byTtl[ln.from].forEach(function (n) {
                    const v = Object.assign({}, n, { g: ln.g, collapsed: false });
                    idmap[n.id] = v.id; vnodes.push(v); vnodeById[v.id] = v;
                });
            } else {
                const first = byTtl[ln.from][0], last = byTtl[ln.to][0];
                let added = 0, known = true;
                M.links.forEach(function (l) {
                    const a = M.nodes.find(function (n) { return n.id === l.from; });
                    if (a && a.ttl >= ln.from && a.ttl < ln.to) { if (l.dmin === null) known = false; else added += l.dmin; }
                });
                const span = ln.to - ln.from + 1;
                const v = { id: ln.key, g: ln.g, ttl: ln.from, host: 'hops ' + ln.from + '–' + ln.to, short: span + ' hops',
                            n: first.n, star: false, rmin: last.rmin, rmed: last.rmed, collapsed: true, span: span, added: known ? added : null,
                            first_host: first.host, last_host: last.host, key: ln.key };
                for (let t = ln.from; t <= ln.to; t++) byTtl[t].forEach(function (n) { idmap[n.id] = v.id; });
                vnodes.push(v); vnodeById[v.id] = v;
            }
        });
        const vlinks = [], vlinkById = {}, linkmap = {};
        M.links.forEach(function (l) {
            const f = idmap[l.from], t = idmap[l.to];
            if (!f || !t || f === t) return;                      // internal to a segment
            const id = f + '->' + t;
            if (!vlinkById[id]) { vlinkById[id] = { id: id, from: f, to: t, n: 0, dmin: null }; vlinks.push(vlinkById[id]); }
            vlinkById[id].n += l.n;
            if (l.dmin !== null) vlinkById[id].dmin = vlinkById[id].dmin === null ? l.dmin : Math.min(vlinkById[id].dmin, l.dmin);
            linkmap[l.id] = id;
        });
        M.routes.forEach(function (r) {
            r.vnodes = {}; r.vlinks = {};
            Object.keys(r.nodes).forEach(function (id) { if (idmap[id]) r.vnodes[idmap[id]] = true; });
            Object.keys(r.links).forEach(function (id) { if (linkmap[id]) r.vlinks[linkmap[id]] = true; });
        });
        return { lanes: lanes, nodes: vnodes, links: vlinks, byId: vnodeById, laneOfTtl: laneOfTtl };
    }

    const paths_bin = function (d) { return d === null || d === undefined ? 'na' : d < 1 ? 'lo' : d < 10 ? 'mid' : 'hi'; };
    const paths_fmt = function (v) { return v === null || v === undefined ? '–' : v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2); };
    const paths_esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    const P_SEP = ' › ', P_DOT = ' · ', P_ARROW = ' → ', P_DASH = ' – ';

    function paths_tip_show(e, html) {
        const t = el('paths-tip'); if (!t) return;
        t.innerHTML = html; t.style.display = 'block';
        const pane = el('paths');
        const box = pane.getBoundingClientRect();
        let x = e.clientX - box.left + pane.scrollLeft + 14, y = e.clientY - box.top + pane.scrollTop + 14;
        if (e.clientX + 14 + t.offsetWidth > box.right - 8) x = Math.max(8, x - t.offsetWidth - 28);
        t.style.left = x + 'px'; t.style.top = y + 'px';
    }
    function paths_tip_hide() { const t = el('paths-tip'); if (t) t.style.display = 'none'; }

    function lane_label(ln) {
        if (ln.from === 0) return 'src';
        return ln.collapsed ? (ln.from + '–' + ln.to) : String(ln.from);
    }

    function render_paths() {
        const pane = el('paths');
        if (!pane || !in_slice || !in_slice.tr_data) return;
        const M = build_paths_model(in_slice.tr_data);
        const svg = el('paths-svg'), prof = el('paths-prof');
        let cbf = false; try { cbf = localStorage.getItem('microdep-cbf') === '1'; } catch (_) { /* private mode */ }
        pane.classList.toggle('is-cbf', cbf);
        pane.classList.toggle('is-vertical', !!paths_state.vertical);

        if (!M.routes.length) {
            svg.innerHTML = ''; prof.innerHTML = '';
            el('paths-table').querySelector('tbody').innerHTML = '';
            el('paths-note').textContent = 'No traceroutes in this period.';
            paths_dirty = false;
            return;
        }

        const V = compact_paths_model(M);
        const lanes = V.lanes, G = lanes.length, byId = V.byId;
        const byLane = []; for (let g = 0; g < G; g++) byLane.push([]);
        V.nodes.forEach(function (n) { byLane[n.g].push(n); });
        const outL = {}, inL = {};
        V.links.forEach(function (l) { (outL[l.from] = outL[l.from] || []).push(l); (inL[l.to] = inL[l.to] || []).push(l); });
        const vertical = !!paths_state.vertical;

        // ---- order nodes within lanes (barycenter, three sweeps) ----
        byLane.forEach(function (arr) { arr.sort(function (a, b) { return b.n - a.n; }); arr.forEach(function (n, i) { n.order = i; }); });
        const sweep = function (forward) {
            for (let k = 1; k < G; k++) {
                const g = forward ? k : G - 1 - k;
                byLane[g].forEach(function (n) {
                    const ls = forward ? (inL[n.id] || []) : (outL[n.id] || []);
                    let sum = 0, w = 0;
                    ls.forEach(function (l) { const o = byId[forward ? l.from : l.to]; sum += o.order * l.n; w += l.n; });
                    n.bary = w ? sum / w : n.order;
                });
                byLane[g].sort(function (a, b) { return (a.bary - b.bary) || (b.n - a.n); });
                byLane[g].forEach(function (n, i) { n.order = i; });
            }
        };
        sweep(true); sweep(false); sweep(true);

        // ---- labels ----
        const node_label = function (n) {
            if (n.ttl === 0 && !n.collapsed) return 'source';
            if (n.collapsed) return n.span + ' hops' + (n.added !== null ? ' · +' + paths_fmt(n.added) + ' ms' : '');
            return vertical ? n.host : (n.short.length > 22 ? n.short.slice(0, 21) + '…' : n.short);
        };
        V.nodes.forEach(function (n) { n.label = node_label(n); n.labelW = n.label.length * P_MONO_PX; });

        // ---- geometry in flow coordinates: "along" the path, "across" it ----
        const nodeT = 10;                                 // node thickness along the flow
        const maxBand = 30, gapBase = 10;
        const scroller = el('paths-scroll1');
        const availAcrossTotal = Math.max(400, scroller.clientWidth - 24);
        let scale = maxBand / M.traces;                   // a band, never a slab
        // Ribbon widths are proportional to the trace count, but never below a
        // visible line: a branch carrying one trace in a hundred would otherwise
        // be a hairline that vanishes where it leaves the main band. A node's
        // band is then whatever its ribbons need on either side.
        const minW = 3;
        V.links.forEach(function (l) { l.w = Math.max(minW, l.n * scale); });
        V.nodes.forEach(function (n) {
            const sum = function (ls) { return (ls || []).reduce(function (t, l) { return t + l.w; }, 0); };
            n.b = Math.max(4, n.n * scale, sum(outL[n.id]), sum(inL[n.id]));   // band width across the flow
        });

        // Alternating label rows are only needed left-to-right; top-down puts the
        // name beside the node, so the lane just has to be wide enough for it.
        const LH = 13;
        let topArea = 0, botArea = 0;
        if (!vertical) {
            let maxTop = 0, maxBot = 0;
            byLane.forEach(function (arr, g) {
                if (arr.length === 1) { arr[0].row = (g % 2 === 0) ? 'top' : 'bot'; arr[0].slot = 0; }
                else { const half = Math.ceil(arr.length / 2); arr.forEach(function (n, i) { if (i < half) { n.row = 'top'; n.slot = half - 1 - i; } else { n.row = 'bot'; n.slot = i - half; } }); }
                let t = 0, b = 0; arr.forEach(function (n) { if (n.row === 'top') t++; else b++; });
                maxTop = Math.max(maxTop, t); maxBot = Math.max(maxBot, b);
            });
            topArea = 26 + LH * maxTop; botArea = 22 + LH * maxBot;
        }

        // lane pitch along the flow, and the extent across it
        let pitch, acrossExtent, padAlong0 = vertical ? 22 : topArea, padAlong1 = vertical ? 22 : botArea;
        const padAcross0 = vertical ? 44 : 40, padAcross1 = vertical ? 24 : 40;
        if (vertical) {
            pitch = 44;
            // widest lane decides the drawing width: bands + gaps + the names beside them
            let widest = 0;
            byLane.forEach(function (arr) { let w = 0; arr.forEach(function (n, i) { w += n.b + 8 + n.labelW + (i < arr.length - 1 ? 26 : 0); }); widest = Math.max(widest, w); });
            acrossExtent = Math.max(availAcrossTotal - padAcross0 - padAcross1, widest);
        } else {
            let tallest = 0;
            byLane.forEach(function (arr) { tallest = Math.max(tallest, arr.reduce(function (t, n) { return t + n.b; }, 0) + gapBase * (arr.length - 1)); });
            acrossExtent = Math.max(150, Math.round(tallest * 2.2 + 40));
            pitch = Math.max(96, Math.floor((availAcrossTotal - padAcross0 - padAcross1) / Math.max(1, G - 1)));
        }
        const alongLen = padAlong0 + pitch * (G - 1) + nodeT + padAlong1;
        const acrossLen = padAcross0 + acrossExtent + padAcross1;

        // place nodes: along = lane, across = stacked within the lane, centred
        byLane.forEach(function (arr, g) {
            const along = padAlong0 + g * pitch;
            let total = 0;
            arr.forEach(function (n, i) { total += n.b + (vertical ? (8 + n.labelW) : 0) + (i < arr.length - 1 ? (vertical ? 26 : gapBase) : 0); });
            let a = padAcross0 + (vertical ? Math.max(0, (acrossExtent - total) / 2) : (acrossExtent - total) / 2);
            arr.forEach(function (n) { n.along = along; n.a0 = a; n.a1 = a + n.b; a += n.b + (vertical ? (8 + n.labelW + 26) : gapBase); });
        });
        // link slots along each node's band, centred when the ribbons on one
        // side need less than the band (the minimum width can make the two
        // sides differ by a few pixels)
        V.nodes.forEach(function (n) {
            const outs = (outL[n.id] || []).slice().sort(function (a, b) { return byId[a.to].a0 - byId[b.to].a0; });
            let off = (n.b - outs.reduce(function (t, l) { return t + l.w; }, 0)) / 2;
            outs.forEach(function (l) { l.s0 = n.a0 + off; l.s1 = l.s0 + l.w; off += l.w; });
            const ins = (inL[n.id] || []).slice().sort(function (a, b) { return byId[a.from].a0 - byId[b.from].a0; });
            off = (n.b - ins.reduce(function (t, l) { return t + l.w; }, 0)) / 2;
            ins.forEach(function (l) { l.t0 = n.a0 + off; l.t1 = l.t0 + l.w; off += l.w; });
        });

        // flow -> screen
        const X = function (along, across) { return vertical ? across : along; };
        const Y = function (along, across) { return vertical ? along : across; };
        const W = vertical ? acrossLen : alongLen, H = vertical ? alongLen : acrossLen;

        // ---- draw ----
        const dstIds = {};
        M.routes.forEach(function (r) { if (r.hosts.length && r.hosts[r.hosts.length - 1] === to) { const id = r.hosts.length + '|' + to; if (byId[id]) dstIds[id] = true; } });
        let out = '';
        lanes.forEach(function (ln, g) {
            const along = padAlong0 + g * pitch + nodeT / 2;
            if (vertical) {
                out += '<line class="tp-grid" x1="' + padAcross0 + '" x2="' + (acrossLen - padAcross1) + '" y1="' + along + '" y2="' + along + '"></line>';
                out += '<text class="tp-tick" x="' + (padAcross0 - 8) + '" y="' + (along + 3.5) + '" text-anchor="end">' + lane_label(ln) + '</text>';
            } else {
                out += '<line class="tp-grid" x1="' + along + '" x2="' + along + '" y1="' + (topArea - 4) + '" y2="' + (H - botArea + 4) + '"></line>';
                out += '<text class="tp-tick" x="' + along + '" y="' + (topArea - 12) + '" text-anchor="middle">' + lane_label(ln) + '</text>';
            }
        });
        V.links.forEach(function (l) {
            const a = byId[l.from], b = byId[l.to];
            const al0 = a.along + nodeT, al1 = b.along, alm = (al0 + al1) / 2;
            let d;
            if (vertical) {
                d = 'M' + l.s0 + ',' + al0 + ' C' + l.s0 + ',' + alm + ' ' + l.t0 + ',' + alm + ' ' + l.t0 + ',' + al1 +
                    ' L' + l.t1 + ',' + al1 + ' C' + l.t1 + ',' + alm + ' ' + l.s1 + ',' + alm + ' ' + l.s1 + ',' + al0 + ' Z';
            } else {
                d = 'M' + al0 + ',' + l.s0 + ' C' + alm + ',' + l.s0 + ' ' + alm + ',' + l.t0 + ' ' + al1 + ',' + l.t0 +
                    ' L' + al1 + ',' + l.t1 + ' C' + alm + ',' + l.t1 + ' ' + alm + ',' + l.s1 + ' ' + al0 + ',' + l.s1 + ' Z';
            }
            out += '<path class="tp-ribbon ' + paths_bin(l.dmin) + (l.w <= minW ? ' thin' : '') + '" data-key="' + paths_esc(l.id) + '" d="' + d + '"></path>';
        });
        V.nodes.forEach(function (n) {
            const cls = ['tp-node', (n.ttl === 0 && !n.collapsed) ? 'src' : '', dstIds[n.id] ? 'dst' : '', n.star ? 'star' : '', n.collapsed ? 'seg' : ''].filter(Boolean).join(' ');
            const rx = X(n.along, n.a0), ry = Y(n.along, n.a0);
            const rw = vertical ? n.b : nodeT, rh = vertical ? nodeT : n.b;
            let lbl = '', leader = '';
            if (vertical) {
                lbl = '<text class="tp-lbl" x="' + (n.a1 + 8) + '" y="' + (n.along + nodeT / 2 + 3.5) + '">' + paths_esc(n.label) + '</text>';
            } else {
                const cx = n.along + nodeT / 2;
                let ly;
                if (n.row === 'top') { ly = topArea - 10 - n.slot * LH; leader = '<line class="tp-leader" x1="' + cx + '" x2="' + cx + '" y1="' + (ly + 3) + '" y2="' + n.a0 + '"></line>'; }
                else { ly = H - botArea + 16 + n.slot * LH; leader = '<line class="tp-leader" x1="' + cx + '" x2="' + cx + '" y1="' + n.a1 + '" y2="' + (ly - 9) + '"></line>'; }
                lbl = '<text class="tp-lbl" x="' + cx + '" y="' + ly + '" text-anchor="middle">' + paths_esc(n.label) + '</text>';
            }
            out += '<g class="' + cls + '" data-id="' + paths_esc(n.id) + '">' + leader +
                   '<rect x="' + rx + '" y="' + ry + '" width="' + rw + '" height="' + rh + '" rx="2"></rect>' + lbl + '</g>';
        });
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
        svg.innerHTML = out;

        const linkById = {}; V.links.forEach(function (l) { linkById[l.id] = l; });
        const host_of = function (n) { return (n.ttl === 0 && !n.collapsed) ? from : (n.collapsed ? n.first_host + P_ARROW + n.last_host : n.host); };
        svg.querySelectorAll('.tp-ribbon').forEach(function (pth) {
            const l = linkById[pth.dataset.key];
            pth.addEventListener('mousemove', function (e) {
                paths_tip_show(e, '<div class="mono">' + paths_esc(host_of(byId[l.from])) + '<span class="k">' + P_ARROW + '</span>' + paths_esc(host_of(byId[l.to])) + '</div>' +
                    '<div><span class="k">traces</span> <span class="mono">' + l.n + '</span><span class="k">' + P_DOT + 'hop adds</span> <span class="mono">' + (l.dmin === null ? 'no reply' : '+' + paths_fmt(l.dmin) + ' ms') + '</span></div>');
            });
            pth.addEventListener('mouseleave', paths_tip_hide);
        });
        svg.querySelectorAll('.tp-node').forEach(function (g) {
            const n = byId[g.dataset.id];
            g.addEventListener('mousemove', function (e) {
                if (n.collapsed) {
                    paths_tip_show(e, '<div class="mono">' + paths_esc(n.first_host) + '<span class="k">' + P_ARROW + '…' + P_ARROW + '</span>' + paths_esc(n.last_host) + '</div>' +
                        '<div><span class="k">hops</span> <span class="mono">' + n.ttl + '–' + (n.ttl + n.span - 1) + '</span><span class="k">' + P_DOT + 'no branching' + P_DOT + 'adds</span> <span class="mono">' + (n.added === null ? '?' : '+' + paths_fmt(n.added) + ' ms') + '</span></div>' +
                        '<div class="k">click to open</div>');
                } else {
                    paths_tip_show(e, '<div class="mono">' + paths_esc(n.ttl === 0 ? from : n.host) + '</div>' +
                        '<div><span class="k">hop</span> <span class="mono">' + (n.ttl === 0 ? 'source' : n.ttl) + '</span><span class="k">' + P_DOT + 'seen in</span> <span class="mono">' + n.n + '</span> <span class="k">of ' + M.traces + '</span></div>' +
                        (n.rmin !== null ? '<div><span class="k">min RTT</span> <span class="mono">' + paths_fmt(n.rmin) + ' ms</span><span class="k">' + P_DOT + 'median</span> <span class="mono">' + paths_fmt(n.rmed) + ' ms</span></div>' : ''));
                }
            });
            g.addEventListener('mouseleave', paths_tip_hide);
            if (n.collapsed) g.addEventListener('click', function () { paths_state.expanded[n.key] = true; paths_tip_hide(); render_paths(); });
        });

        // ---- latency profile on the same lanes ----
        const allVals = [];
        M.band.forEach(function (b) { if (b) { allVals.push(b[0], b[1]); } });
        M.routes.forEach(function (r) { r.prof.forEach(function (v) { if (v !== null) allVals.push(v); }); });
        const yMin = 0.05, yMax = Math.max(1, Math.max.apply(null, allVals)) * 1.25;
        const lanePos = function (g) { return padAlong0 + g * pitch + nodeT / 2; };
        const ttlLane = function (ttl) { const ln = V.laneOfTtl[ttl]; return ln ? ln.g : null; };
        // per lane, the hop whose values it shows: the exit hop of a segment
        const laneTtl = lanes.map(function (ln) { return ln.to; });
        const shown = paths_state.topN ? M.routes.slice(0, paths_state.topN) : M.routes;
        const dom = M.routes[0];
        let po = '';
        if (vertical) {
            const PW = 300, pL = 46, pR = 16;
            const vx = function (v) { const vv = Math.max(yMin, v); return pL + (PW - pL - pR) * ((Math.log10(vv) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))); };
            [0.1, 1, 10, 100, 1000].forEach(function (t) {
                if (t > yMax) return;
                po += '<line class="tp-grid" x1="' + vx(t) + '" x2="' + vx(t) + '" y1="' + (padAlong0 - 4) + '" y2="' + (alongLen - padAlong1 + 4) + '"></line>' +
                      '<text class="tp-ylab" x="' + vx(t) + '" y="' + (padAlong0 - 10) + '" text-anchor="middle">' + t + ' ms</text>';
            });
            lanes.forEach(function (ln, g) { po += '<line class="tp-grid" x1="' + pL + '" x2="' + (PW - pR) + '" y1="' + lanePos(g) + '" y2="' + lanePos(g) + '"></line><text class="tp-tick" x="' + (pL - 8) + '" y="' + (lanePos(g) + 3.5) + '" text-anchor="end">' + lane_label(ln) + '</text>'; });
            let hiPath = '', loPts = [];
            lanes.forEach(function (ln, g) { const b = M.band[laneTtl[g]]; if (!b) return; hiPath += (hiPath ? 'L' : 'M') + vx(b[1]) + ',' + lanePos(g) + ' '; loPts.push(vx(b[0]) + ',' + lanePos(g)); });
            if (hiPath) po += '<path class="tp-band" d="' + hiPath + ' L' + loPts.reverse().join(' L') + ' Z"></path>';
            const lineOf = function (r) { let d = ''; lanes.forEach(function (ln, g) { const v = r.prof[laneTtl[g]]; if (v === null || v === undefined) return; d += (d ? 'L' : 'M') + vx(g === 0 ? yMin : v) + ',' + lanePos(g) + ' '; }); return d; };
            shown.slice().reverse().forEach(function (r) { if (r.idx === 0) return; po += '<path class="tp-line' + (paths_state.sel === r.idx ? ' sel' : '') + '" d="' + lineOf(r) + '"></path>'; });
            po += '<path class="tp-line dom" d="' + lineOf(dom) + '"></path>';
            lanes.forEach(function (ln, g) { if (g === 0) return; const v = dom.prof[laneTtl[g]]; if (v === null || v === undefined) return; po += '<circle class="tp-pt" cx="' + vx(v) + '" cy="' + lanePos(g) + '" r="3.5"></circle>'; });
            if (paths_state.sel !== null && paths_state.sel !== 0) lanes.forEach(function (ln, g) { if (g === 0) return; const v = M.routes[paths_state.sel].prof[laneTtl[g]]; if (v === null || v === undefined) return; po += '<circle class="tp-pt sel" cx="' + vx(v) + '" cy="' + lanePos(g) + '" r="3.5"></circle>'; });
            po += '<line class="tp-xh" x1="' + pL + '" x2="' + (PW - pR) + '" y1="0" y2="0"></line>';
            prof.setAttribute('viewBox', '0 0 ' + PW + ' ' + alongLen); prof.setAttribute('width', PW); prof.setAttribute('height', alongLen);
        } else {
            const PH = 230, pT = 14, pB = 26, pL = padAcross0;
            const vy = function (v) { const vv = Math.max(yMin, v); return pT + (PH - pT - pB) * (1 - (Math.log10(vv) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))); };
            [0.1, 1, 10, 100, 1000].forEach(function (t) {
                if (t > yMax) return;
                po += '<line class="tp-grid" x1="' + pL + '" x2="' + (W - padAcross1 + 20) + '" y1="' + vy(t) + '" y2="' + vy(t) + '"></line>' +
                      '<text class="tp-ylab" x="' + (pL - 6) + '" y="' + (vy(t) + 3.5) + '" text-anchor="end">' + t + ' ms</text>';
            });
            po += '<line class="tp-axis" x1="' + pL + '" x2="' + (W - padAcross1 + 20) + '" y1="' + (PH - pB) + '" y2="' + (PH - pB) + '"></line>';
            lanes.forEach(function (ln, g) { po += '<text class="tp-tick" x="' + lanePos(g) + '" y="' + (PH - pB + 15) + '" text-anchor="middle">' + lane_label(ln) + '</text>'; });
            let top = '', bot = [];
            lanes.forEach(function (ln, g) { const b = M.band[laneTtl[g]]; if (!b) return; top += (top ? 'L' : 'M') + lanePos(g) + ',' + vy(b[1]) + ' '; bot.push(lanePos(g) + ',' + vy(b[0])); });
            if (top) po += '<path class="tp-band" d="' + top + ' L' + bot.reverse().join(' L') + ' Z"></path>';
            const lineOf = function (r) { let d = ''; lanes.forEach(function (ln, g) { const v = r.prof[laneTtl[g]]; if (v === null || v === undefined) return; d += (d ? 'L' : 'M') + lanePos(g) + ',' + vy(g === 0 ? yMin : v) + ' '; }); return d; };
            shown.slice().reverse().forEach(function (r) { if (r.idx === 0) return; po += '<path class="tp-line' + (paths_state.sel === r.idx ? ' sel' : '') + '" d="' + lineOf(r) + '"></path>'; });
            po += '<path class="tp-line dom" d="' + lineOf(dom) + '"></path>';
            lanes.forEach(function (ln, g) { if (g === 0) return; const v = dom.prof[laneTtl[g]]; if (v === null || v === undefined) return; po += '<circle class="tp-pt" cx="' + lanePos(g) + '" cy="' + vy(v) + '" r="3.5"></circle>'; });
            if (paths_state.sel !== null && paths_state.sel !== 0) lanes.forEach(function (ln, g) { if (g === 0) return; const v = M.routes[paths_state.sel].prof[laneTtl[g]]; if (v === null || v === undefined) return; po += '<circle class="tp-pt sel" cx="' + lanePos(g) + '" cy="' + vy(v) + '" r="3.5"></circle>'; });
            po += '<line class="tp-xh" x1="0" x2="0" y1="' + pT + '" y2="' + (PH - pB) + '"></line>';
            prof.setAttribute('viewBox', '0 0 ' + W + ' ' + PH); prof.setAttribute('width', W); prof.setAttribute('height', PH);
        }
        prof.innerHTML = po;
        prof.onmousemove = function (e) {
            const pt = prof.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
            const q = pt.matrixTransform(prof.getScreenCTM().inverse());
            const pos = vertical ? q.y : q.x;
            const g = Math.max(0, Math.min(G - 1, Math.round((pos - padAlong0 - nodeT / 2) / pitch)));
            const xh = prof.querySelector('.tp-xh'); xh.style.display = 'block';
            if (vertical) { xh.setAttribute('y1', lanePos(g)); xh.setAttribute('y2', lanePos(g)); } else { xh.setAttribute('x1', lanePos(g)); xh.setAttribute('x2', lanePos(g)); }
            const r = paths_state.sel !== null ? M.routes[paths_state.sel] : dom; const t = laneTtl[g]; const b = M.band[t];
            paths_tip_show(e, '<div><span class="k">hop</span> <span class="mono">' + (t === 0 ? 'source' : t) + '</span><span class="k">' + P_DOT + '</span><span class="mono">' + paths_esc(t === 0 ? from : (r.hosts[t - 1] || '–')) + '</span></div>' +
                '<div><span class="k">' + (paths_state.sel !== null && paths_state.sel !== 0 ? 'selected route' : 'dominant route') + ' median</span> <span class="mono">' + paths_fmt(t === 0 ? 0 : r.prof[t]) + ' ms</span></div>' +
                (b ? '<div><span class="k">all traces</span> <span class="mono">' + paths_fmt(b[0]) + P_DASH + paths_fmt(b[1]) + ' ms</span></div>' : ''));
        };
        prof.onmouseleave = function () { const xh = prof.querySelector('.tp-xh'); if (xh) xh.style.display = 'none'; paths_tip_hide(); };

        // ---- routes table ----
        const tb = el('paths-table').querySelector('tbody');
        el('paths-note').textContent = paths_state.topN
            ? 'showing ' + shown.length + ' of ' + M.routes.length + P_DOT + 'the dominant route carries ' + dom.n + ' of ' + M.traces + ' traces'
            : 'all ' + M.routes.length + ' routes';
        tb.innerHTML = shown.map(function (r) {
            const share = r.n / M.traces * 100;
            const route = r.hosts.map(function (h, i) {
                const sh = paths_short(h);
                return (r.diverge !== null && i + 1 >= r.diverge && h !== dom.hosts[i]) ? '<b>' + paths_esc(sh) + '</b>' : paths_esc(sh);
            }).join(P_SEP);
            return '<tr class="tp-rt' + (paths_state.sel === r.idx ? ' sel' : '') + '" data-r="' + r.idx + '"><td class="num">' + (r.idx + 1) + '</td>' +
                '<td><span class="tp-share" style="width:' + Math.max(4, share * 2.2) + 'px"></span>' + share.toFixed(0) + '%</td>' +
                '<td class="num">' + r.n + '</td><td class="num">' + r.hosts.length + '</td>' +
                '<td>' + (r.idx === 0 ? '<span class="tp-muted">dominant route</span>' : (r.diverge ? 'hop ' + r.diverge : '–')) + '</td>' +
                '<td class="num">' + paths_fmt(r.prof[r.prof.length - 1]) + ' ms</td>' +
                '<td class="route" title="' + paths_esc(r.hosts.join(P_SEP)) + '">' + route + '</td></tr>';
        }).join('');
        tb.querySelectorAll('tr.tp-rt').forEach(function (tr) {
            tr.addEventListener('click', function () { const i = Number(tr.dataset.r); paths_state.sel = (paths_state.sel === i) ? null : i; render_paths(); });
        });

        // ---- focus ----
        svg.classList.toggle('has-focus', paths_state.sel !== null);
        if (paths_state.sel !== null) {
            const r = M.routes[paths_state.sel];
            svg.querySelectorAll('.tp-ribbon').forEach(function (pth) { pth.classList.toggle('on', !!r.vlinks[pth.dataset.key]); });
            svg.querySelectorAll('.tp-node').forEach(function (g) { g.classList.toggle('on', !!r.vnodes[g.dataset.id]); });
        }
        paths_dirty = false;
        void ttlLane;
    }

    function paths_tab_active() {
        const p = el('paths');
        return !!(p && p.getAttribute('aria-hidden') !== 'true' && p.offsetParent !== null);
    }

    function bind_paths_controls() {
        const press = function (on, off) { on.setAttribute('aria-pressed', 'true'); off.setAttribute('aria-pressed', 'false'); };
        const topBtn = el('paths-top'), allBtn = el('paths-all');
        if (topBtn && allBtn) {
            topBtn.addEventListener('click', function () { paths_state.topN = 6; press(topBtn, allBtn); render_paths(); });
            allBtn.addEventListener('click', function () { paths_state.topN = 0; press(allBtn, topBtn); render_paths(); });
        }
        const vBtn = el('paths-vert'), hBtn = el('paths-horiz');
        if (vBtn && hBtn) {
            vBtn.addEventListener('click', function () { paths_state.vertical = true; press(vBtn, hBtn); render_paths(); });
            hBtn.addEventListener('click', function () { paths_state.vertical = false; press(hBtn, vBtn); render_paths(); });
        }
        const cBtn = el('paths-compact'), eBtn = el('paths-every');
        if (cBtn && eBtn) {
            cBtn.addEventListener('click', function () { paths_state.compact = true; paths_state.expanded = {}; press(cBtn, eBtn); render_paths(); });
            eBtn.addEventListener('click', function () { paths_state.compact = false; press(eBtn, cBtn); render_paths(); });
        }
        const s1 = el('paths-scroll1'), s2 = el('paths-scroll2');
        if (s1 && s2) {
            let lock = false;
            [[s1, s2], [s2, s1]].forEach(function (pair) {
                pair[0].addEventListener('scroll', function () { if (lock) return; lock = true; pair[1].scrollLeft = pair[0].scrollLeft; lock = false; });
            });
        }
        let rt = null;
        window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (paths_tab_active()) render_paths(); }, 150); });
    }

    // ── Node shading: how often a node was seen ───────────────────────
    // Deliberately neutral. Colour now carries meaning on the LINKS (minimum
    // RTT, traffic-light), so the nodes must not compete for it - they encode
    // observation frequency, which has no good/bad direction (issue #148).
    const node_colors = [
        "#eceff3",
        "#d6dbe2",
        "#b9c1cc",
        "#98a3b2",
        "#778396",
        "#5a6a80"
    ];

    // ── Link colouring: minimum RTT, traffic-light ────────────────────
    // Same palettes the map uses, so the two views read alike, and the same
    // colour-blind-safe switch drives both.
    const link_colors     = ["#80e982", "#80a982", "#e2e404", "#e2a404", "#d98182", "#a98182"];
    const link_colors_cbf = ["#92B5FF", "#648FFF", "#FFD480", "#FFB000", "#FF7AB6", "#DC267F"];
    const link_color_unknown = "#7e8794";

    function link_palette() {
        let cbf = false;
        try { cbf = localStorage.getItem('microdep-cbf') === '1'; } catch (_) { /* private mode */ }
        return cbf ? link_colors_cbf : link_colors;
    }

    // Marker colours for the two ends of the path.
    function end_colors() {
        let cbf = false;
        try { cbf = localStorage.getItem('microdep-cbf') === '1'; } catch (_) {}
        return cbf
            ? { source: '#648FFF', destination: '#FFB000', error: '#DC267F' }
            : { source: '#20C020', destination: '#e2a404', error: '#d02020' };
    }

    // ====================================================================
    //  Stats class  (statistical accumulator)
    // ====================================================================

    function Stats() {
        this.values = [];
        this.sum = 0;
        this.n = 0;
        this.sumsq = 0;
        this.add = function (value) {
            this.values.push(value);
            this.sum += value;
            this.sumsq += value * value;
            this.n++;
        };
        this.avg = function () {
            return this.n > 0 ? this.sum / this.n : 0;
        };
        this.median = function () {
            if (this.values.length === 0) return 0;
            let sorted = this.values.slice().sort((a, b) => a - b);
            let mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0
                ? sorted[mid]
                : (sorted[mid - 1] + sorted[mid]) / 2;
        };
        this.sdv = function () {
            if (this.n > 1) {
                return Math.sqrt(Math.abs(
                    this.sumsq / this.n - Math.pow(this.sum / this.n, 2)));
            }
            return 0;
        };
        this.min = function () {
            return Math.min.apply(Math, this.values);
        };
        this.max = function () {
            return Math.max.apply(Math, this.values);
        };
    }

    // ====================================================================
    //  Utility helpers
    // ====================================================================

    function pad(num, size) {
        let s = num + "";
        while (s.length < size) s = "0" + s;
        return s;
    }

    function trf(label, val) {
        return '<tr><th>' + label + '<td>' + val;
    }

    function txtf(label, val, decimals) {
        while (label.length < 10) { label += ' '; }
        let valtxt;
        if (typeof val === 'number')
            valtxt = val.toFixed(decimals);
        else
            valtxt = val;
        return label + "\t" + valtxt + "\n";
    }

    function find_node(nodes, adr) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === adr) return i;
        }
        return null;
    }

    function find_pos(stats, adr) {
        for (let i = 0; i < stats.length; i++) {
            if (stats[i].id === adr)
                return { lat: stats[i].latitude, lon: stats[i].longitude };
        }
        return null;
    }

    function prefiks(adr) {
        let dot3 = adr.lastIndexOf(".");
        return adr.substr(0, dot3);
    }

    function readable_range(secs) {
        if (secs < 60)          return secs.toFixed(0) + 's';
        if (secs < 3600)        return (secs / 60).toFixed(2) + 'm';
        if (secs < 86400)       return (secs / 3600).toFixed(2) + 'h';
        if (secs < 86400 * 7)   return (secs / 86400).toFixed(1) + 'd';
        return (secs / 86400 / 7).toFixed(1) + 'w';
    }

    // ── Scoped DOM helper ─────────────────────────────────────────────
    function el(suffix) {
        return document.getElementById(id + '-' + suffix);
    }

    // --- Cooperative chunking + progress readout -----------------------
    // Parsing and laying out a large trace set (>5k traceroutes) keeps the
    // main thread busy for minutes, so the page stops repainting and looks
    // frozen. The heavy loops below process CHUNK items, then yield to the
    // browser and report how far along they are (issue #130).
    const CHUNK = 250;
    function _yield() {
        return new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    function show_awaiting(on) {
        const a = el('awaiting');
        if (a) a.style.display = on ? 'flex' : 'none';
    }
    function set_progress(pct, label) {
        const p = el('progress');
        if (p) p.textContent = (label || '') + (pct === null || pct === undefined ? '' : ' ' + pct + '%');
        const fill = el('progressfill');
        if (fill) {
            // No percentage yet (or done): show an empty bar rather than a stale one.
            fill.style.width = (pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, pct))) + '%';
        }
    }

    // ====================================================================
    //  Colour limits / legend
    // ====================================================================


    // Colour each link by how much minimum RTT it adds - the difference between
    // the minimum RTT seen at its two ends. That is the part of the path length
    // this hop is responsible for, which is what makes a traffic-light reading
    // meaningful: green for a short hop, red for a long one.
    //
    // The scale is logarithmic on purpose. Hop lengths are roughly tri-modal -
    // sub-millisecond inside an access network, ~10 ms across a core, >100 ms on
    // a long-haul leg - so linear steps would put almost every hop in the first
    // bucket.

    // The sender and the destination are the two nodes a reader looks for first,
    // so give them a colour of their own rather than leaving them in the shading
    // that everything else uses (issue #148). A node that ended a trace short of
    // the destination keeps its error marking.
    function mark_path_ends(tree) {
        if (!tree || !tree.nodes) return;
        const ends = end_colors();
        let dest = null;

        // The destination is whatever the view was opened for; fall back to the
        // furthest hop when the name does not appear among the nodes.
        for (const n of tree.nodes) {
            if (n.id === to || n.label === to) { dest = n; break; }
        }
        if (!dest) {
            for (const n of tree.nodes) {
                if (n.id === 'start') continue;
                if (!dest || (n.hop || 0) > (dest.hop || 0)) dest = n;
            }
        }

        for (const n of tree.nodes) {
            if (n.id === 'start') {
                n.color = Object.assign({}, n.color, { background: ends.source, border: ends.source });
            } else if (dest && n.id === dest.id) {
                n.color = Object.assign({}, n.color, { background: ends.destination, border: ends.destination });
            } else if (n.color && n.color.border === 'AA1111') {
                n.color = Object.assign({}, n.color, { border: ends.error });
            }
        }
    }

    function taint_edges_by_rtt(tree) {
        const palette = link_palette();
        if (!tree || !tree.edges || !tree.stats) return null;

        const min_rtt = { start: 0 };          // the sender is the zero point
        for (const st of tree.stats) {
            if (st && typeof st.min === 'number' && isFinite(st.min)) min_rtt[st.address] = st.min;
        }

        const deltas = [];
        for (const e of tree.edges) {
            const a = min_rtt[e.from], b = min_rtt[e.to];
            e.rtt_delta = (typeof a === 'number' && typeof b === 'number' && isFinite(a) && isFinite(b))
                ? Math.max(0, b - a)
                : null;
            if (e.rtt_delta !== null) deltas.push(e.rtt_delta);
        }
        if (deltas.length === 0) return null;

        // Log steps between a sub-millisecond floor and the longest hop seen.
        const floor = 0.05;
        const top = Math.max.apply(null, deltas);
        const limits = [0];
        if (top > floor) {
            for (let i = 1; i < palette.length; i++) {
                limits.push(floor * Math.pow(top / floor, (i - 1) / (palette.length - 2)));
            }
        } else {
            for (let i = 1; i < palette.length; i++) limits.push(floor * i);
        }

        for (const e of tree.edges) {
            let col = link_color_unknown;
            if (e.rtt_delta !== null) {
                for (let i = limits.length - 1; i >= 0; i--) {
                    if (e.rtt_delta >= limits[i]) { col = palette[i]; break; }
                }
            }
            // inherit:false is required - vis otherwise paints edges in the
            // colour of the node they leave, ignoring what we set here.
            e.color = { color: col, highlight: col, hover: col, inherit: false };
        }
        return { palette: palette, limits: limits };
    }

    function create_limits(nodes, colors) {
        let stats = new Stats();
        for (let node of nodes) {
            if (node.n !== undefined)
                stats.add(node.n);
        }
        let step = stats.max() / colors.length;
        let limits = [];
        let limit = 0;
        for (let i in colors) {
            limits.push(limit);
            limit += step;
        }
        return limits;
    }

    function taint_nodes(nodes, colors, limits) {
        for (let nix in nodes) {
            if (nodes[nix].n !== undefined) {
                for (let lim = limits.length - 1; lim >= 0; lim--) {
                    if (nodes[nix].n >= limits[lim]) {
                        if (!nodes[nix].color) nodes[nix].color = {};
                        nodes[nix].color.background = colors[lim];
                        break;
                    }
                }
            }
        }
    }

    // The floating copy of the scale lives inside the graph container so that it
    // is also there in fullscreen (the sidebar is outside the fullscreened
    // element). vis.Network empties that container when it (re)initialises, and
    // the legend is built BEFORE the graph is drawn, so this has to be callable
    // again afterwards rather than done once.
    let _scale_markup = '';

    function attach_float_legend() {
        if (!_scale_markup) return;
        const gc = el('treetainer');
        if (!gc) return;
        let floating = el('legend-float');
        if (!floating) {
            floating = document.createElement('div');
            floating.id = id + '-legend-float';
            floating.className = 'tracetree-scale-float';
        }
        if (floating.parentElement !== gc) gc.appendChild(floating);
        floating.innerHTML = _scale_markup;
    }

    function create_legend(elem_suffix, colors, limits, caption) {
        // A colour scale, not a stack of coloured cells: the old rendering looked
        // like another row of buttons under the real ones. Gradient bar on the
        // left, tick values alongside, lowest at the bottom.
        const stops = colors.slice().reverse().join(', ');
        // One format for the whole scale: toPrecision(3) gave "0.00, 24.2, 121",
        // i.e. a different number of decimals per tick. Pick the decimals once,
        // from the largest value, and use them for every tick.
        const top = Math.max.apply(null, limits.map(Number).filter(function (v) { return isFinite(v); }));
        const dec = top >= 100 ? 0 : (top >= 10 ? 1 : 2);
        let ticks = '';
        for (let i = colors.length - 1; i >= 0; i--) {
            ticks += '<span>' + Number(limits[i]).toFixed(dec) + '</span>';
        }
        // Values first, then the bar: the numbers read down the left edge and are
        // right-aligned against it, so the digits line up with their colours.
        const markup =
            '<div class="tracetree-scale" title="Node colour scale - round-trip time (ms)">' +
              '<div class="tracetree-scale-caption">' + (caption || 'RTT ms') + '</div>' +
              '<div class="tracetree-scale-body">' +
                '<div class="tracetree-scale-ticks">' + ticks + '</div>' +
                '<div class="tracetree-scale-bar" style="background:linear-gradient(to bottom, ' + stops + ')"></div>' +
              '</div>' +
            '</div>';
        const target = el(elem_suffix);
        if (target) target.innerHTML = markup;
        // The same scale, floating over the graph - that copy is the one seen in
        // fullscreen and in the maximized view, where the sidebar is gone.
        _scale_markup = markup;
        attach_float_legend();
    }

    // ====================================================================
    //  Slice management
    // ====================================================================

    function tr_slice(start, range) {
        let extract = [];
        let startms = start;
        let endms = startms + range;

        for (let slice of slices) {
            if (slice.tr_data && slice.start <= start
                && (slice.start + slice.range) >= endms) {
                for (let tr of slice.tr_data) {
                    if (tr.ts >= startms && (tr.ts <= endms || extract.length <= 0)) {
                        extract.push(tr);
                    }
                }
                return extract;
            }
        }
        return [];
    }

    function tr_slice_make(slice, slice_no, level) {
        let upslice = level === 'out';
        let sub_slice = level === 'in';
        let ca_start = slice.start;
        let new_range = slice.range;

        if (sub_slice) {
            new_range = compute_slice_size(slice.range);
            ca_start = slice.start + slice_no * new_range;
        } else if (upslice) {
            new_range = compute_mother_size(slice.range);
        } else if (level === 'same') {
            ca_start = slice.start + (slice_no - slice.slice_no) * new_range;
        }

        let now = new Date().getTime() / 1000;
        if ((ca_start + new_range) > now)
            ca_start = now - new_range;
        let start = Math.floor(ca_start / new_range) * new_range;

        let n_slice = { start: start, range: new_range, end: start + new_range, slice_no: 0 };

        if (sub_slice) {
            n_slice.mother = slice;
        } else if (upslice) {
            slice.mother = n_slice;
        } else {
            n_slice.mother = slice.mother;
        }

        n_slice.slice_count = compute_slice_count(n_slice.range);
        if (n_slice.mother === undefined) {
            current_slice = n_slice;
        }

        let extract = tr_slice(start, new_range);
        if (extract.length > 0) {
            n_slice.tr_data = extract;
            n_slice.slice_no = slice_no;
            tr_slice_show(n_slice);
        } else {
            fetch_and_plot_json(n_slice, params.mahost);
        }
        in_slice = n_slice;
        slices.push(n_slice);
    }

    async function tr_slice_show(slice) {
        if (slice.tr_data) {
            if (!slice.tree) {
                show_awaiting(true);
                slice.tree = await traceroute_sum(slice.tr_data);
            }
            set_progress(90, 'Drawing');
            await _yield();

            let limits = create_limits(slice.tree.nodes, node_colors);
            taint_nodes(slice.tree.nodes, node_colors, limits);
            mark_path_ends(slice.tree);

            // The scale beside the graph describes the LINK colours now: node
            // shading only says how often a node was seen, which needs no key.
            const link_scale = taint_edges_by_rtt(slice.tree);
            if (link_scale) {
                create_legend('legend', link_scale.palette, link_scale.limits, 'min RTT ms');
            } else {
                create_legend('legend', node_colors, limits, 'traces');
            }

            plot_tree_json(slice.tree, id + '-treetainer', false);
            paths_dirty = true;
            if (paths_tab_active()) render_paths();
            report_stats(slice.tree);
            report_trace('diff', slice.tr_data);
            plot_stats_hops(slice.tree);
            in_slice = slice;
            show_time_info(slice);
            update_time = new Date().getTime();

            if (slice.range > 1)
                update_timeline_window(slice);
            set_progress(null, '');
            show_awaiting(false);
        } else {
            show_popup("Empty slice for slice " + slice.slice_no + ' starting ' + slice.start);
        }
    }

    function zoom_to_slice(slice, level) {
        if (slice) {
            in_slice = slice;
            current_slice = slice;
            tr_slice_show(slice);
            show_time_info(slice);
        } else {
            tr_slice_make(current_slice, 0, level);
        }
    }

    function go_to_slice(slice, level, delta) {
        if (slice) {
            let mom = slice;
            if (slice.mother !== undefined) {
                mom = slice.mother;
            }
            let sno = 0;
            if ('slice_no' in slice)
                sno = slice.slice_no + delta;
            tr_slice_make(slice, sno, level);
        }
    }

    function compute_slice_size(range) {
        for (let s of [10, 60, 600, 3600, 3600 * 24, 3600 * 24 * 7]) {
            let sc = range / s;
            if (sc > 3 && sc < 25)
                return s;
        }
        return Math.floor(range / 10);
    }

    function compute_slice_count(range) {
        let slice_count = 10;
        if ((range / 86400).toFixed(1) == 1)
            slice_count = 24;
        else if ((range / 3600).toFixed(1) == 1)
            slice_count = 6;
        else if ((range / 60).toFixed(1) == 1)
            slice_count = 6;
        return slice_count;
    }

    function compute_mother_size(sub_range) {
        let range = 10 * sub_range;
        if (Math.floor(sub_range / 86400) === 1)
            range = 7 * sub_range;
        else if (Math.floor(sub_range / 3600) === 1)
            range = 24 * sub_range;
        else if (Math.floor(sub_range / 60) === 1)
            range = 60 * sub_range;
        return range;
    }

    // ====================================================================
    //  Traceroute summarisation
    // ====================================================================

    async function traceroute_sum(tr_data) {
        // The hop-zero node stands for the traceroute sender, so label it with
        // that host (the one named in the viewer's title) instead of a generic
        // "Start" (issue #136). The id stays 'start' - it keys the edges.
        const start_label = params.from || from || 'Start';
        let nodes = [{ label: start_label, id: 'start', hop: 0, color: { background: '#20C020' } }];
        let node_ix = [];
        let edges = [];
        let stats = [];
        let stats_ix = [];
        let routers = [];
        let prouters = [];
        let loss = [];
        routers['start'] = 1;
        let start, range;

        let _seen = 0;
        for (let tr of tr_data) {
            if ((++_seen % CHUNK) === 0) {
                set_progress(40 + Math.round(50 * _seen / tr_data.length), 'Building topology');
                await _yield();
            }
            // Every trace begins at the sender, so hop one of EVERY trace has to
            // link back to the start node. Without this reset `routers` still
            // holds the previous trace's last hop, and the start node ends up
            // connected to the first trace's first hop only (issue #136).
            routers = [];
            routers['start'] = 1;

            let last_node = 0, all_hops = [];
            if (!start) start = tr.ts;
            range = tr.ts - start;

            for (let hop of tr.val) {
                hop.color = { background: "#4292c6" };
                all_hops.push(hop);
                if (hop.ip) {
                    last_node = all_hops.length - 1;
                }
            }
            let real_hops = all_hops.slice(0, last_node + 1);
            if (real_hops.length > 0 && real_hops[last_node].id !== destination) {
                real_hops[last_node].color.border = 'AA1111';
            }

            for (let hop of real_hops) {
                let pttl = 0;
                let hop_id = hop.ttl + '*';
                if (hop.ip) {
                    hop_id = hop.ip;
                }
                let label = hop_id;
                if (hop.hostname) {
                    label = hop.hostname;
                }

                if (hop.ttl !== pttl) {
                    prouters = routers;
                    routers = [];
                }
                tr_edges(prouters, hop_id, edges);

                if (!routers[hop_id]) { routers[hop_id] = 0; }
                routers[hop_id]++;

                if (!(hop_id in node_ix)) {
                    nodes.push({
                        "label": label,
                        "id": hop_id,
                        "n": 0,
                        "hop": hop.ttl
                    });
                    node_ix[hop_id] = nodes.length - 1;
                }
                nodes[node_ix[hop_id]].n++;
                // Original had a bug referencing undefined `node` — use hop instead
                if ('color' in hop) {
                    nodes[node_ix[hop_id]].color = hop.color;
                }
                if (hop.ip) {
                    update_stats(hop_id, hop, tr.ts, stats, stats_ix);
                } else {
                    loss[hop.ttl] = ++loss[hop.ttl] || 1;
                }
                pttl = hop.ttl;
            }
            prouters = [];
            routers = [];
        }

        let edgelist = [];
        Object.keys(edges).forEach(function (key) {
            edgelist.push(edges[key]);
        });
        for (let stat of stats) {
            stat.avg = stat.rtt.avg();
            stat.min = stat.rtt.min();
            stat.max = stat.rtt.max();
            stat.sdv = stat.rtt.sdv();
        }

        return { "nodes": nodes, "edges": edgelist, "stats": stats, "start": start, "range": range, "loss": loss };
    }

    function tr_edges(prouters, to, edges) {
        for (let from in prouters) {
            let edge = from + "-" + to;
            if (!(edge in edges)) {
                edges[edge] = {
                    "id": edge,
                    "from": from,
                    "to": to,
                    "value": 0,
                    "color": "#000000"
                };
            }
            edges[edge].value++;
        }
    }

    function update_stats(hopid, hop, ts, stats, stats_ix) {
        let ix;
        if (hopid in stats_ix) {
            ix = stats_ix[hopid];
        } else {
            ix = stats.length;
            stats_ix[hopid] = ix;
        }

        if (!(ix in stats)) {
            stats[ix] = {
                address: hop.ip,
                router: hop.ip,
                return_report: "",
                seen: 0,
                loss: 0,
                hop: hop.ttl,
                rtt: new Stats()
            };
        }
        stats[ix].seen++;
        stats[ix].rtt.add(hop.rtt);
        if (hop.hostname) {
            stats[ix].router = hop.hostname;
        }

        let d = new Date(ts * 1000);
        let t = pad(d.getDate(), 2) + ' ' + pad(d.getHours(), 2) + ':'
            + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2);
        if (typeof stats[ix].first_seen === "undefined") {
            stats[ix].first_seen = t;
        }
        stats[ix].last_seen = t;
    }

    // ====================================================================
    //  OpenSearch to esmond conversion
    // ====================================================================

    async function os2esmond_traceroute(os_json) {
        let esmond_json = [];
        const total = os_json.hits.hits.length;

        for (let tr = 0; tr < total; tr++) {
            if (tr && (tr % CHUNK) === 0) {
                set_progress(Math.round(40 * tr / total), 'Parsing traceroutes');
                await _yield();
            }
            // Only filter when the network actually pins a version (empty means
            // "all versions"; Number('') is 0, which dropped every trace).
            if (params['ip-version'] &&
                Number(params['ip-version']) !== Number(os_json.hits.hits[tr]._source.test.spec['ip-version']))
                continue;

            let esmond_tr = {};
            // Date.parse returns milliseconds; divide to keep ts in seconds
            // so the rest of the code (which uses `ts * 1000` for `new Date`)
            // works for both Esmond and OpenSearch sources.
            esmond_tr.ts = Math.floor(Date.parse(os_json.hits.hits[tr]._source['@timestamp']) / 1000);
            esmond_tr.val = [];
            for (let tr_query = 0; tr_query < os_json.hits.hits[tr]._source.result.json.length; tr_query++) {
                for (let hn = 0; hn < os_json.hits.hits[tr]._source.result.json[tr_query].length; hn++) {
                    let hop = {};
                    hop.ttl = hn + 1;
                    hop.query = 1;
                    hop.success = 1;
                    if (typeof os_json.hits.hits[tr]._source.result.json[tr_query][hn].ip !== 'undefined')
                        hop.ip = os_json.hits.hits[tr]._source.result.json[tr_query][hn].ip;
                    if (typeof os_json.hits.hits[tr]._source.result.json[tr_query][hn].hostname !== 'undefined')
                        hop.hostname = os_json.hits.hits[tr]._source.result.json[tr_query][hn].hostname;
                    if (typeof os_json.hits.hits[tr]._source.result.json[tr_query][hn].rtt !== 'undefined') {
                        hop.rtt = Number(os_json.hits.hits[tr]._source.result.json[tr_query][hn].rtt.slice(2, -1)) * 1000;
                    }
                    esmond_tr.val.push(hop);
                }
                esmond_json.push(esmond_tr);
            }
        }
        return esmond_json;
    }

    // ====================================================================
    //  Data fetching
    // ====================================================================

    function fetch_and_plot_json(slice, base) {
        show_awaiting(true);
        show_time_info(slice);
        in_slice = slice;

        let url;

//        url = '/pstracetree/get-tracetests.pl?mahost=' + encodeURIComponent(base)
        url = 'get-tracetests.pl?mahost=' + encodeURIComponent(base)
            + '&from=' + encodeURIComponent(params.from)
            + '&to=' + encodeURIComponent(params.to)
            + '&start=' + encodeURIComponent(params.start)
            + '&end=' + encodeURIComponent(params.end);
	
        if (params.verify_SSL !== undefined) {
            url += '&verify_SSL=' + params.verify_SSL;
        }
        if (params['ip-version']) {
            url += '&ip_version=' + encodeURIComponent(params['ip-version']);
        }

        console.log('Fetching traceroutes via: ' + url);

        $.getJSON(url, async function (tr_json) {
            slice.tr_data = tr_json;
            if (params.api === 'opensearch') {
                set_progress(0, 'Parsing traceroutes');
                slice.tr_data = await os2esmond_traceroute(tr_json);
            }
            await tr_slice_show(slice);
            update_timeline_items(slice);
        })
        .fail(function (jqxhr, textStatus, error) {
            let msg = "Failed to get traceroute data: " + textStatus + ", " + error;
            console.log(msg);
            show_popup(msg);
            show_awaiting(false);
        });
    }

    // ====================================================================
    //  vis.Network — topology graph
    // ====================================================================

    function plot_tree_json(data, divid, copy) {
        let opts = {
            physics: {
                solver: 'barnesHut',
                // 10 iterations was far too few - the graph was drawn before it
                // had settled, so it came out tangled and bunched up. Give it
                // room to spread: stronger repulsion, longer springs, and enough
                // iterations to actually converge.
                barnesHut: {
                    gravitationalConstant: -12000,
                    centralGravity: 0.15,
                    springLength: 170,
                    springConstant: 0.03,
                    damping: 0.35,
                    avoidOverlap: 0.6
                },
                stabilization: { enabled: true, iterations: 300, updateInterval: 25 },
                minVelocity: 0.75,
                timestep: 0.35
            },
            layout: { improvedLayout: true },
            nodes: {
                // Bigger boxes and type: at the zoom the whole topology fits
                // into, the labels were the first thing to become unreadable.
                font: { size: 15 },
                margin: 8,
                borderWidth: 1.5
            },
            edges: {
                // Edges used to scale up to 8px, so a handful of them crossing
                // the same area turned into a solid smear. Thin lines keep the
                // structure readable where they overlap; the width still varies
                // with the number of traces, just over a narrower range.
                width: 0.5,
                scaling: { min: 0.5, max: 3 },
                selectionWidth: 2,
                arrows: { middle: { enabled: true, scaleFactor: 0.8, type: 'arrow' } }
            },
            interaction: {
                hover: true,
                hoverConnectedEdges: true,
                multiselect: false,
                navigationButtons: true
            }
        };

        let container = document.getElementById(divid);

        if (data.nodes.length < 1) {
            container.innerHTML = '<h2>Empty data set - missing data?</h2>';
            return -1;
        }

        fix_positions(data.nodes, data.stats, container);
        setTimeout(attach_float_legend, 0);   // after vis has taken the container
        let nodes_ds = new vis.DataSet(data.nodes);
        let edges_ds = new vis.DataSet(data.edges);
        topology = { nodes: nodes_ds, edges: edges_ds };

        if (copy) {
            new vis.Network(container, topology, opts);
        } else if (tree) {
            update_tree_json(tree, topology);
            setTimeout(function () { settle_layout(tree); }, 1500);
        } else {
            tree = new vis.Network(container, topology, opts);

            // Anchor the sender once the layout settles; the timeout is a
            // fallback for when the stabilisation event does not fire.
            tree.once('stabilizationIterationsDone', function () { settle_layout(tree); });
            setTimeout(function () { settle_layout(tree); }, 2500);

            // A graph laid out while its tab was hidden has no usable size, so
            // it shows up zoomed in and the user has to press "fit content".
            // Re-measure and fit whenever this tab becomes visible instead.
            $('main#tabs').on('tabsactivate', function () {
                const c = el('treetainer');
                if (!c || c.offsetParent === null) return;   // still hidden
                setTimeout(function () {
                    try { tree.redraw(); settle_layout(tree); } catch (_) {}
                }, 60);
            });

            tree.on("hoverNode", function (ev) {
                if (last_tr !== null)
                    last_tr.style.backgroundColor = last_tr_bgc;
                last_tr = document.getElementById(ev.node);
                if (last_tr !== null) {
                    last_tr_bgc = last_tr.style.backgroundColor;
                    last_tr.style.backgroundColor = "#e000a0";
                }
            });

            tree.on("selectNode", function (ev) {
                format_popup(ev.nodes[0], ev.pointer);
            });

            tree.on("oncontext", function (ev) {
                let adr = ev.nodes[0];
                let tr_el = document.getElementById(adr);
                if (tr_el !== null) tr_el.scrollIntoView(true);
            });

            tree.on("dragStart", function (ev) {
                let nodel = tree.getSelectedNodes();
                if (nodel.length > 0)
                    nodes_ds.update([{ id: nodel[0], fixed: false }]);
            });

            tree.on("dragEnd", function (ev) {
                let nodel = tree.getSelectedNodes();
                if (nodel.length > 0)
                    nodes_ds.update([{ id: nodel[0], fixed: true }]);
            });
        }
    }

    function update_positions(network) {
        let pos = network.getPositions();
        for (let p of pos) {
            positions[p.id] = p;
        }
    }

    function update_tree_json(network, data) {
        let g_nodes = network.body.data.nodes._data,
            g_edges = network.body.data.edges._data,
            g_ids = Object.keys(g_nodes),
            n_ids = Object.keys(data.nodes._data);

        for (let n_id of n_ids) {
            if (!g_ids.includes(n_id)) {
                try { network.body.data.nodes.update(data.nodes._data[n_id]); }
                catch (err) { console.error('Error adding node in update_tree: ' + err); }
            }
        }
        for (let g_id of g_ids) {
            if (!n_ids.includes(g_id)) {
                try { network.body.data.nodes.remove(g_nodes[g_id]); }
                catch (err) { console.error('Error removing node in update_tree: ' + err); }
            }
        }

        let eg_ids = Object.keys(g_edges),
            en_ids = Object.keys(data.edges._data);

        for (let en_id of en_ids) {
            if (!eg_ids.includes(en_id)) {
                try { network.body.data.edges.update(data.edges._data[en_id]); }
                catch (err) { console.error('Error adding edge in update_tree: ' + err); }
            }
        }
        for (let eg_id of eg_ids) {
            if (!en_ids.includes(eg_id)) {
                try { network.body.data.edges.remove(g_edges[eg_id]); }
                catch (err) { console.error('Error removing edge in update_tree: ' + err); }
            }
        }
    }

    // ====================================================================
    //  Graph reduction / collapsing
    // ====================================================================

    // "Simple view": the same topology with the noise taken out (issue #148).
    //
    //   - hops that never answered ("<ttl>*") are dropped - they carry no
    //     address, so they say nothing beyond "something was here";
    //   - nodes that report the same host name are merged into one, since
    //     several addresses of one router should read as one router;
    //   - local loops (an edge that starts and ends at the same node, which
    //     merging can also create) are removed;
    //   - the sender is always kept. It used to disappear here, because the
    //     old filter only admitted nodes that had a statistics record and the
    //     hop-zero node has none;
    //   - what is left is still capped per hop, now keeping the nodes most
    //     traces actually went through rather than whichever came first.
    function reduce_graph(data) {
        const START = 'start';
        const is_unanswered = function (id) { return /\*$/.test(String(id)); };

        // Which node does each id end up as? Same label - same node.
        const by_label = {}, remap = {};
        for (const node of data.nodes) {
            if (node.id === START || is_unanswered(node.id)) continue;
            const label = node.label || node.id;
            if (by_label[label] === undefined) by_label[label] = node.id;
            remap[node.id] = by_label[label];
        }

        // Build the surviving nodes, folding the merged ones together.
        const kept = {};
        for (const node of data.nodes) {
            if (is_unanswered(node.id)) continue;
            if (node.id === START) { kept[START] = Object.assign({}, node); continue; }
            const id = remap[node.id];
            if (!kept[id]) {
                kept[id] = Object.assign({}, node, { id: id });
            } else if (typeof node.n === 'number') {
                kept[id].n = (kept[id].n || 0) + node.n;
            }
        }

        // Cap the width of each hop, busiest first, sender exempt.
        const per_hop = {};
        for (const id in kept) {
            if (id === START) continue;
            const hop = kept[id].hop;
            (per_hop[hop] = per_hop[hop] || []).push(kept[id]);
        }
        const admitted = {};
        if (kept[START]) admitted[START] = kept[START];
        for (const hop in per_hop) {
            per_hop[hop]
                .sort(function (a, b) { return (b.n || 0) - (a.n || 0); })
                .slice(0, max_parallel)
                .forEach(function (n) { admitted[n.id] = n; });
        }

        // Re-point the edges at the surviving nodes, dropping local loops and
        // folding duplicates that the merge collapsed onto each other.
        const edge_by_key = {};
        for (const edge of data.edges) {
            const from = edge.from === START ? START : remap[edge.from];
            const to   = edge.to   === START ? START : remap[edge.to];
            if (!from || !to || from === to) continue;
            if (!(from in admitted) || !(to in admitted)) continue;
            const key = from + '\u0000' + to;
            if (!edge_by_key[key]) {
                edge_by_key[key] = Object.assign({}, edge, { id: key, from: from, to: to });
            } else if (typeof edge.value === 'number') {
                edge_by_key[key].value = (edge_by_key[key].value || 0) + edge.value;
            }
        }

        return {
            nodes: Object.keys(admitted).map(function (k) { return admitted[k]; }),
            edges: Object.keys(edge_by_key).map(function (k) { return edge_by_key[k]; }),
            stats: data.stats
        };
    }

    function collapse_nodes(data) {
        let min_collapse = 3;
        let c_factor = 2;
        let nodes = [];
        let kanter = [];
        let hop = [];
        let collapse = [];
        let collapsed = [];

        for (let s1 of data.stats) {
            hop[s1.address] = s1.hop;
            for (let s2 of data.stats) {
                let a1 = s1.address;
                let a2 = s2.address;
                if (a1 !== a2 && s1.hop === s2.hop
                    && prefiks(s1.address) === prefiks(s2.address)
                    && (Math.abs(s1.seen - s2.seen) * c_factor < (s1.seen + s2.seen) / 2)) {

                    if (!(collapse[a2] || collapse[a1])) {
                        let collto = a1;
                        while (typeof collapse[collto] !== 'undefined') {
                            if (collapse[collto] === collto) {
                                delete collapse[collto];
                            } else {
                                collto = collapse[collto];
                            }
                        }
                        collapse[a2] = collto;
                        if (typeof collapsed[a1] === 'undefined') {
                            collapsed[a1] = 0;
                        }
                        collapsed[a1]++;
                    }
                }
            }
        }

        for (let node of data.nodes) {
            if (collapse[node.id]) {
                if (collapsed[collapse[node.id]] > min_collapse) {
                    continue;
                } else {
                    delete collapse[node.id];
                }
            }
            if (collapsed[node.id] > min_collapse) {
                node.label = prefiks('C:' + node.id);
            }
            nodes.push(node);
        }

        for (let edge of data.edges) {
            let from_e = edge.from, to_e = edge.to;
            let myedge = Object.assign({}, edge);
            let colla = false;
            if (typeof collapse[to_e] !== 'undefined') {
                myedge.to = collapse[to_e];
                colla = true;
            }
            if (typeof collapse[from_e] !== 'undefined') {
                myedge.from = collapse[from_e];
                colla = true;
            }
            if (!colla) {
                kanter.push(myedge);
            }
        }

        // document collapses for popup
        for (let stat of data.stats) {
            stat.collapses = '';
            if (collapsed[stat.address] > 0) {
                for (let s2 of data.stats) {
                    if (collapse[s2.address] === stat.address) {
                        stat.collapses += s2.address + "\n";
                    }
                }
            }
        }

        return { nodes: nodes, edges: kanter, stats: data.stats };
    }

    // ====================================================================
    //  Node positioning
    // ====================================================================

    // Park the sender (hop zero) above and left of everything else, so every
    // topology reads the same way. It has to run after the layout has settled:
    // vis works in its own coordinate space, not container pixels, so a position
    // picked up front (e.g. 15,15) just lands in the middle of the graph.
    // The force layout settles into whatever shape it likes - typically about as
    // tall as it is wide - while the pane it lives in is wide and short. Fitting
    // that into the pane is then limited by height, and everything ends up drawn
    // small (measured: a 2823x2362 layout in a 1066x448 pane fits at 0.17, i.e.
    // ~10px nodes). Stretching the settled positions towards the pane's own
    // proportions costs nothing structurally - no edge crosses that did not
    // cross before - and buys ~40% more zoom, so nodes and labels get bigger.
    function spread_to_pane(network) {
        let cw, ch;
        try {
            cw = network.canvas.frame.canvas.clientWidth;
            ch = network.canvas.frame.canvas.clientHeight;
        } catch (_) { return; }
        if (!cw || !ch) return;

        let pos;
        try { pos = network.getPositions(); } catch (_) { return; }
        const ids = Object.keys(pos);
        if (ids.length < 3) return;

        const xs = ids.map(function (i) { return pos[i].x; });
        const ys = ids.map(function (i) { return pos[i].y; });
        const minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs);
        const miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
        const bw = maxx - minx, bh = maxy - miny;
        if (bw < 1 || bh < 1) return;

        let k = Math.sqrt((cw / ch) / (bw / bh));
        if (!isFinite(k) || k <= 0) return;
        if (Math.abs(k - 1) < 0.05) return;          // already close enough
        k = Math.max(0.6, Math.min(1.8, k));          // never distort wildly

        const cx = (maxx + minx) / 2, cy = (maxy + miny) / 2;
        ids.forEach(function (id) {
            network.moveNode(id, cx + (pos[id].x - cx) * k, cy + (pos[id].y - cy) / k);
        });
    }

    // Reshape first, then pin the sender relative to the final positions.
    //
    // Both steps need a laid-out canvas: while the tab is still hidden (a reload
    // restores it in the background) the canvas has no width, the proportions
    // cannot be computed and fit() lands on a meaningless scale that nothing
    // corrects afterwards. So wait for a real canvas rather than acting on a
    // zero-sized one. Repeat calls are harmless - once the layout matches the
    // pane, the reshape is a no-op.
    function settle_layout(network, retries) {
        if (retries === undefined) retries = 8;
        let cw = 0;
        try { cw = network.canvas.frame.canvas.clientWidth; } catch (_) { /* not ready */ }
        if (cw < 50) {
            if (retries > 0) setTimeout(function () { settle_layout(network, retries - 1); }, 400);
            return;
        }
        spread_to_pane(network);
        anchor_start_node(network);
    }

    function anchor_start_node(network) {
        if (!network) return;
        let pos;
        try { pos = network.getPositions(); } catch (_) { return; }
        if (!pos || !pos['start']) return;
        let minx = null, miny = null;
        for (const id in pos) {
            if (id === 'start') continue;
            minx = (minx === null) ? pos[id].x : Math.min(minx, pos[id].x);
            miny = (miny === null) ? pos[id].y : Math.min(miny, pos[id].y);
        }
        if (minx === null) return;
        try {
            network.body.data.nodes.update({
                id: 'start',
                x: Math.round(minx - 160),
                y: Math.round(miny - 160),
                fixed: true,
                physics: false
            });
            network.fit();
        } catch (err) { console.log('anchor_start_node: ' + err); }
    }

    function fix_positions(nodes, stats, container) {
        let minx = 15, maxx = container.clientWidth - 30;
        let miny = 15, maxy = container.clientHeight - 30;

        let last = stats.length - 1;
        if (last >= 0) {
            let starti = find_node(nodes, stats[0].address);
            let endi = find_node(nodes, stats[last].address);

            if (starti !== null && endi !== null) {

                if (stats[0].latitude <= stats[last].latitude) {
                    nodes[starti].y = maxy;
                    nodes[endi].y = miny;
                } else {
                    nodes[starti].y = miny;
                    nodes[endi].y = maxy;
                }
                if (stats[0].longitude <= stats[last].longitude) {
                    nodes[starti].x = maxx;
                    nodes[endi].x = minx;
                } else {
                    nodes[starti].x = minx;
                    nodes[endi].x = maxx;
                }
                // Only a positional hint now - the sender above is the anchor, and
                // a second fixed node would fight it.
            }
        }
    }

    // ====================================================================
    //  Reporting — stats table
    // ====================================================================

    function report_stats(data) {
        let html = '';
        if (data.start) {
            let d = new Date(data.start * 1000);
            html += '<h3>From ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
            if (data.range) {
                html += ' for ' + readable_range(data.range);
            }
            html += '</h3>';
        }

        let table_id = id + '-stats-table';
        html += '<table id="' + table_id + '" class="sortable">'
            + '<thead><th>Hop<th>Router<th>Avg ms<th>Min<th>Max<th>Sdv<th>Loss%<th>Seen<th>Address<th>Start<th>End<th>Error</thead><tbody>';

        let phop;
        let sorted = data.stats.slice();
        sorted.sort(function (a, b) {
            if (a.hop === b.hop)
                return b.seen - a.seen;
            else
                return a.hop - b.hop;
        });

        $.each(sorted, function (index, point) {
            let hops = point.hop;
            if (phop == point.hop) {
                hops = '';
            }
            phop = point.hop;
            html += '<tr id="' + point.address + '"><td>' + hops + '</td>'
                + '<td>' + point.router + '</td>'
                + '<td class="num">' + point.avg.toFixed(1) + '</td>'
                + '<td class="num">' + point.min.toFixed(1) + '</td>'
                + '<td class="num">' + point.max.toFixed(1) + '</td>'
                + '<td class="num">' + point.sdv.toFixed(1) + '</td>';
            html += '<td class="num">';
            if (point.hop !== phop) {
                if (data.loss[point.hop])
                    html += data.loss[point.hop];
                else
                    html += '0';
            }
            html += '<td class="num">' + point.seen + '</td>'
                + '<td>' + point.address + '</td>'
                + '<td>' + point.first_seen + '</td>'
                + '<td>' + point.last_seen + '</td>'
                + '<td>' + point.return_report + '</td>'
                + '</tr>';
        });
        html += '</tbody></table>';

        el('stats').innerHTML = html;
        let tbl = document.getElementById(table_id);
        if (tbl && typeof sorttable !== 'undefined') {
            sorttable.makeSortable(tbl);
        }
    }

    // ====================================================================
    //  Reporting — traceroute variants
    // ====================================================================

    // Group traceroute samples by route fingerprint, then render each unique
    // variant as a hop table (first occurrence) followed by a collapsible
    // summary of how many later samples took the same route.
    function report_trace(report_type, tr_data) {
        const trace_el = el('trace');
        if (!tr_data || !tr_data.length) {
            trace_el.innerHTML = '<h2>Traceroute variants</h2>' +
                '<p class="trace-empty">No traceroute samples in this period.</p>';
            return;
        }

        // Pass 1 — group shots by fingerprint
        const variants = [];                  // [{ hash, last_ttl, samples: [shot,...] }]
        const variant_index_by_hash = {};
        for (const shot of tr_data) {
            let hash = '';
            let last_ttl = 0;
            for (const hop of shot.val) {
                if (hop.ip) {
                    last_ttl = hop.ttl;
                    hash += hop.ttl + hop.ip;
                }
            }
            let idx = variant_index_by_hash[hash];
            if (idx === undefined) {
                idx = variants.length;
                variant_index_by_hash[hash] = idx;
                variants.push({ hash: hash, last_ttl: last_ttl, samples: [] });
            }
            variants[idx].samples.push(shot);
        }

        // Pass 2 — render. Variants are placed in a responsive grid so the
        // compact tables flow side-by-side (multiple per row) instead of
        // stacking, matching the original web UI.
        let html = '<h2>Traceroute variants</h2>';
        html += '<div class="trace-variants-grid">';
        variants.forEach(function (v, i) {
            html += '<div class="trace-variant-block" data-variant="' + i + '">';
            html += '<label class="trace-variant-select" title="Select for comparison">' +
                      '<input type="checkbox" class="trace-variant-checkbox" data-variant="' + i + '"> ' +
                      '<span>compare</span>' +
                    '</label>';
            html += render_variant_table(v.samples[0], v.last_ttl, i, v.samples.length);

            const repeats = v.samples.slice(1);
            if (repeats.length > 0) {
                const list_id = id + '-repeats-' + i;
                html += '<div class="trace-repeats">';
                html += '<button type="button" class="trace-repeats-toggle" data-target="' + list_id + '" aria-expanded="false">';
                html +=   '<span class="trace-repeats-chevron">▸</span>';
                html +=   '<span class="trace-repeats-label">' +
                            repeats.length + ' more sample' + (repeats.length === 1 ? '' : 's') +
                          '</span>';
                html += '</button>';
                html += '<ul class="trace-repeats-list" id="' + list_id + '" hidden>';
                for (const r of repeats) {
                    const d = new Date(r.ts * 1000);
                    html += '<li>' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString() + '</li>';
                }
                html += '</ul>';
                html += '</div>';
            }
            html += '</div>';
        });
        html += '</div>';

        // Floating "compare bar" — appears once any variant is checked.
        html += '<div class="trace-compare-bar" id="' + id + '-compare-bar" hidden>';
        html += '<span class="trace-compare-count">0 selected</span>';
        html += '<button type="button" class="knapp trace-compare-btn" id="' + id + '-compare-btn" disabled>Compare</button>';
        html += '<button type="button" class="knapp trace-clear-btn" id="' + id + '-clear-btn">Clear</button>';
        html += '</div>';

        // Comparison modal (hidden by default).
        html += '<div class="trace-modal-overlay" id="' + id + '-modal" hidden>';
        html += '<div class="trace-modal" role="dialog" aria-modal="true">';
        html += '<div class="trace-modal-header">';
        html += '<span class="trace-modal-title">Compare variants</span>';
        html += '<button type="button" class="trace-modal-close" id="' + id + '-modal-close" aria-label="Close">&times;</button>';
        html += '</div>';
        html += '<div class="trace-modal-body" id="' + id + '-modal-body"></div>';
        html += '</div>';
        html += '</div>';

        trace_el.innerHTML = html;
        wire_repeats_toggle(trace_el);
        wire_compare(trace_el, variants);
    }

    // Wire expand/collapse for "N more samples" badges
    function wire_repeats_toggle(trace_el) {
        trace_el.querySelectorAll('.trace-repeats-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const list = document.getElementById(btn.dataset.target);
                const chev = btn.querySelector('.trace-repeats-chevron');
                if (!list) return;
                if (list.hidden) {
                    list.hidden = false;
                    btn.setAttribute('aria-expanded', 'true');
                    btn.classList.add('expanded');
                    if (chev) chev.textContent = '▾';
                } else {
                    list.hidden = true;
                    btn.setAttribute('aria-expanded', 'false');
                    btn.classList.remove('expanded');
                    if (chev) chev.textContent = '▸';
                }
            });
        });
    }

    // Wire the compare-bar interaction and modal rendering
    let _compareChart = null;
    function _render_compare_chart(canvas, variants, selected) {
        if (!canvas || typeof Chart === 'undefined') return;
        if (_compareChart) { try { _compareChart.destroy(); } catch (_) {} _compareChart = null; }

        const PALETTE = ['#2f81f7', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899'];
        const cs = getComputedStyle(document.documentElement);
        function tk(name, fb) { const v = cs.getPropertyValue(name).trim(); return v || fb; }
        const text2  = tk('--c-text-2',  '#b1b8c2');
        const text3  = tk('--c-text-3',  '#7e8794');
        const border = tk('--c-border',  '#2a313a');
        const elev   = tk('--c-elevated','#1c2229');

        const cols = selected.map(i => ({ idx: i, v: variants[i] }));
        cols.forEach(c => {
            c.by_ttl = {};
            for (const hop of c.v.samples[0].val) {
                if (hop.ttl > c.v.last_ttl) break;
                if (c.by_ttl[hop.ttl]) continue;
                c.by_ttl[hop.ttl] = hop;
            }
        });
        const max_ttl = cols.reduce((m, c) => Math.max(m, c.v.last_ttl), 0);

        // Datasets: one line per variant. spanGaps lets us connect across
        // unresponsive hops (null RTT) instead of stopping at the first
        // gap, which makes the overall shape easier to read for sparse
        // traces.
        const labels = [];
        for (let t = 1; t <= max_ttl; t++) labels.push(t);
        const datasets = cols.map((c, i) => {
            const colour = PALETTE[i % PALETTE.length];
            return {
                label: 'V' + c.idx,
                data: labels.map(ttl => {
                    const h = c.by_ttl[ttl];
                    return (h && typeof h.rtt === 'number') ? h.rtt : null;
                }),
                borderColor: colour,
                backgroundColor: colour + '22',
                pointBackgroundColor: colour,
                pointBorderColor: '#fff',
                pointRadius: 3.5,
                pointHoverRadius: 6,
                borderWidth: 2,
                tension: 0.2,
                spanGaps: true
            };
        });

        _compareChart = new Chart(canvas, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                scales: {
                    x: {
                        title: { display: true, text: 'Hop (TTL)', color: text3, font: { size: 11, weight: '600' } },
                        grid:  { color: border, drawBorder: false },
                        ticks: { color: text3, font: { size: 11 } }
                    },
                    y: {
                        title: { display: true, text: 'RTT (ms)', color: text3, font: { size: 11, weight: '600' } },
                        grid:  { color: border, drawBorder: false },
                        ticks: { color: text3, font: { size: 11 } },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: text2, font: { size: 12 }, boxWidth: 14, boxHeight: 14, usePointStyle: true, pointStyle: 'circle', padding: 12 }
                    },
                    tooltip: {
                        backgroundColor: elev,
                        // Explicit titleColor / bodyColor — without them
                        // Chart.js defaults to white, which is invisible
                        // on the light-mode tooltip background.
                        titleColor: tk('--c-text', '#e6e9ee'),
                        bodyColor:  text2,
                        borderColor: border,
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        usePointStyle: true,
                        callbacks: {
                            title: items => 'Hop ' + items[0].label,
                            label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y == null ? '—' : ctx.parsed.y.toFixed(2) + ' ms')
                        }
                    }
                }
            }
        });
    }

    function wire_compare(trace_el, variants) {
        const compare_bar  = document.getElementById(id + '-compare-bar');
        const compare_btn  = document.getElementById(id + '-compare-btn');
        const clear_btn    = document.getElementById(id + '-clear-btn');
        const modal        = document.getElementById(id + '-modal');
        const modal_close  = document.getElementById(id + '-modal-close');
        const modal_body   = document.getElementById(id + '-modal-body');
        const count_el     = compare_bar.querySelector('.trace-compare-count');

        function get_selected() {
            return Array.from(trace_el.querySelectorAll('.trace-variant-checkbox:checked'))
                .map(cb => parseInt(cb.dataset.variant, 10));
        }
        function update_bar() {
            const sel = get_selected();
            count_el.textContent = sel.length + ' selected';
            compare_bar.hidden = sel.length < 1;
            compare_btn.disabled = sel.length < 2;
        }

        trace_el.querySelectorAll('.trace-variant-checkbox').forEach(cb => {
            cb.addEventListener('change', function () {
                cb.closest('.trace-variant-block').classList.toggle('selected', cb.checked);
                update_bar();
            });
        });

        compare_btn.addEventListener('click', function () {
            const sel = get_selected();
            if (sel.length < 2) return;
            modal_body.innerHTML = render_comparison(variants, sel);
            // RTT-per-hop chart above the comparison table — one line per
            // selected variant. variants already carry samples[0].val[{ttl,
            // rtt}] + last_ttl, exactly what _render_compare_chart reads.
            var chartWrap = document.createElement('div');
            chartWrap.className = 'trace-compare-chart-wrap';
            var chartCanvas = document.createElement('canvas');
            chartCanvas.className = 'trace-compare-chart';
            chartWrap.appendChild(chartCanvas);
            modal_body.insertBefore(chartWrap, modal_body.firstChild);
            modal.hidden = false;
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(function () { _render_compare_chart(chartCanvas, variants, sel); });
            } else {
                _render_compare_chart(chartCanvas, variants, sel);
            }
        });
        clear_btn.addEventListener('click', function () {
            trace_el.querySelectorAll('.trace-variant-checkbox:checked').forEach(cb => {
                cb.checked = false;
                cb.closest('.trace-variant-block').classList.remove('selected');
            });
            update_bar();
        });
        modal_close.addEventListener('click', function () { modal.hidden = true; });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.hidden = true;     // click outside closes
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
        });
    }

    // Build the side-by-side comparison table for the selected variants.
    function render_comparison(variants, selected) {
        const cols = selected.map(i => ({ idx: i, v: variants[i] }));

        // Build a per-variant TTL→hop lookup
        cols.forEach(c => {
            c.by_ttl = {};
            for (const hop of c.v.samples[0].val) {
                if (hop.ttl > c.v.last_ttl) break;
                if (c.by_ttl[hop.ttl]) continue;   // first hop per TTL wins
                c.by_ttl[hop.ttl] = hop;
            }
        });

        const max_ttl = cols.reduce((m, c) => Math.max(m, c.v.last_ttl), 0);

        let html = '<table class="trace-compare-table">';
        html += '<thead><tr><th rowspan="2">Hop</th>';
        cols.forEach(c => {
            html += '<th colspan="2" class="trace-compare-vno">' +
                      '<span class="variant-no">' + c.idx + '</span>' +
                    '</th>';
        });
        html += '</tr><tr>';
        cols.forEach(() => { html += '<th>Address</th><th>RTT&nbsp;ms</th>'; });
        html += '</tr></thead><tbody>';

        for (let ttl = 1; ttl <= max_ttl; ttl++) {
            const ips = cols.map(c => (c.by_ttl[ttl] && c.by_ttl[ttl].ip) || '');
            const non_empty = ips.filter(ip => ip);
            // Treat "all empty" as same (no responses on any variant) and
            // "all set + identical" as same; only mark as diff when at least
            // one variant has an IP and others either differ or are missing.
            let row_cls = 'same';
            if (non_empty.length > 0) {
                const all_match_first = non_empty.every(ip => ip === non_empty[0]);
                const all_present = ips.every(ip => ip !== '');
                if (!all_match_first || !all_present) row_cls = 'diff';
            }

            html += '<tr class="' + row_cls + '"><td class="hop">' + ttl + '</td>';
            cols.forEach(c => {
                const hop = c.by_ttl[ttl];
                const ip = (hop && hop.ip) ? hop.ip : '—';
                const rtt = (hop && hop.rtt !== undefined) ? hop.rtt.toFixed(1) : '—';
                html += '<td class="addr">' + ip + '</td>';
                html += '<td class="num">' + rtt + '</td>';
            });
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    }

    function render_variant_table(shot, last_ttl, variant_no, sample_count) {
        const start_d = new Date(shot.ts * 1000);
        const date_str = start_d.toLocaleDateString() + ' ' + start_d.toLocaleTimeString();
        let html = '<table class="trace-variant">';
        html += '<caption><span class="variant-no">' + variant_no + '</span>' +
                ' first seen ' + date_str +
                ' <span class="variant-count" title="Total samples taking this route">(' + sample_count + 'x)</span>' +
                '</caption>';
        html += '<thead><tr><th>Hop</th><th class="ipadr">Address</th><th>Roundtrip&nbsp;ms</th></tr></thead>';
        html += '<tbody>';
        for (const hop of shot.val) {
            if (hop.ttl > last_ttl) break;
            html += '<tr>' +
                      '<td>' + hop.ttl + '</td>' +
                      '<td>' + (hop.ip !== undefined ? hop.ip : '') + '</td>' +
                      '<td class="num">' + (hop.rtt !== undefined ? hop.rtt.toFixed(1) : '') + '</td>' +
                    '</tr>';
        }
        html += '</tbody></table>';
        return html;
    }

    // ====================================================================
    //  Stats chart data (plot_stats_hops)
    // ====================================================================

    function plot_stats_hops(data) {
        // Prepares chart data structure; Highcharts plotting was removed from original.
        let chartdata = [];
        let phop;
        $.each(data.stats, function (index, s) {
            chartdata.push({
                x: parseInt(s.hop ? s.hop : phop),
                y: s.seen,
                z: s.avg,
                host: s.router,
                avg: s.avg,
                min: s.min,
                max: s.max,
                sdv: s.sdv,
                loss: s.loss
            });
            phop = s.hop;
        });
    }

    // ====================================================================
    //  Popup (replaces alert() from original)
    // ====================================================================

    function format_popup(adr, pointer) {
        if (!in_slice || !in_slice.tree) return;
        $.each(in_slice.tree.stats, function () {
            if (this.address === adr) {
                let html = '<table class="tracetree-popup-table">'
                    + trf('router', this.router)
                    + trf('address', this.address)
                    + trf('hop', this.hop)
                    + trf('avg', typeof this.avg === 'number' ? this.avg.toFixed(1) : this.avg)
                    + trf('min', typeof this.min === 'number' ? this.min.toFixed(1) : this.min)
                    + trf('max', typeof this.max === 'number' ? this.max.toFixed(1) : this.max)
                    + trf('sdv', typeof this.sdv === 'number' ? this.sdv.toFixed(1) : this.sdv)
                    + trf('loss', this.loss)
                    + trf('seen', this.seen)
                    + trf('collapses', this.collapses || '')
                    + '</table>';
                show_popup(html, true, pointer);
                return false; // break
            }
        });
    }

    function show_popup(content, isHtml /*, pointer (unused, panel is fixed) */) {
        let popup = el('popup');
        // The popup is anchored to the top-right of the graph area, mirroring
        // the "Link Details" panel on the main microdep map.
        const treetainer = el('treetainer');
        if (!popup) {
            let div = document.createElement('div');
            div.id = id + '-popup';
            div.className = 'tracetree-popup';
            div.innerHTML =
                '<div class="tracetree-popup-header">' +
                  '<span class="tracetree-popup-title">Router Details</span>' +
                  '<button class="tracetree-popup-close" type="button" aria-label="Close">&times;</button>' +
                '</div>' +
                '<div class="tracetree-popup-body"></div>';
            (treetainer || document.getElementById(id + '-inner')).appendChild(div);
            popup = div;
            popup.querySelector('.tracetree-popup-close').addEventListener('click', function () {
                popup.style.display = 'none';
            });
        }
        let body = popup.querySelector('.tracetree-popup-body');
        if (isHtml) body.innerHTML = content;
        else        body.textContent = content;
        popup.style.display = 'flex';
    }

    // ====================================================================
    //  Time display (replaces show_time_slice / show_time_span)
    // ====================================================================

    function show_time_info(slice) {
        if (!slice.start || !slice.end) return;
        let start_d = new Date(slice.start * 1000);
        let end_d = new Date(slice.end * 1000);
        let t_range = readable_range(slice.range);
        let text = start_d.toLocaleDateString() + ' ' + start_d.toLocaleTimeString()
            + ' + ' + t_range;

        // Update the timeline container title area if it exists
        let nav = el('timeline-container');
        if (nav) {
            let info = nav.querySelector('.tracetree-timeinfo');
            if (!info) {
                info = document.createElement('div');
                info.className = 'tracetree-timeinfo';
                nav.insertBefore(info, nav.firstChild);
            }
            info.textContent = text;
        }
    }

    // ====================================================================
    //  Timeline functions
    // ====================================================================

    function init_timeline() {
        let options = {
            configure: false,
            maxHeight: 200,
            multiselect: true,
            stack: false
        };
        let container = el('timeline');
        if (!container) return;
        timeline = new vis.Timeline(container, {}, options);

        timeline.on('doubleClick', function (parms) {
            if (last_select) {
                clearInterval(last_select);
            }
            zoom_by_factor(parms, 2);
        });

        timeline.on('select', function (parms) {
            if (parms.items.length > 1) {
                let start = parms.items[0];
                let range = parms.items[parms.items.length - 1] - start;
                zoom_by_timeline_slice(start, range);
            } else if (parms.items.length === 1) {
                if (last_select) {
                    clearInterval(last_select);
                }
                last_select = setTimeout(function () {
                    zoom_by_timeline_slice(parms.items[0], 1);
                }, update_interval);
            }
        });

        timeline.on('timechanged', function (parms) {
            if (parms.id === 'end') {
                let start = timeline.getCustomTime('start') / 1000;
                let end = parms.time / 1000;
                let range = end - start;
                zoom_by_timeline_slice(start, range);
            }
        });

        timeline.on('rangechanged', function (parms) {
            if (parms.byUser) {
                let right = new Date().getTime();
                let rangems = (parms.end - parms.start) / 3;
                if (parms.end < right) right = parms.end;

                let range = rangems / 1000;
                let start = (right - rangems) / 1000;

                if (parms.event.type === 'panend') {
                    zoom_by_timeline_slice(start, range);
                } else if (parms.event.type === 'wheel') {
                    if (last_rangechange) {
                        clearInterval(last_rangechange);
                    }
                    last_rangechange = setTimeout(function () {
                        zoom_by_timeline_slice(start, range);
                    }, update_interval);
                }
                try { timeline.removeCustomTime('newstart'); } catch (e) { /* ignore */ }
                try { timeline.removeCustomTime('newend'); } catch (e) { /* ignore */ }
                timeline.redraw();
            }
            timeline.redraw();
        });

        timeline.on('rangechange', function (parms) {
            if (parms.byUser) {
                let win = timeline.getWindow();
                let left = win.start.getTime();
                let range = (win.end.getTime() - left) / 3;
                let start = left + range;
                let end = start + range;

                try {
                    timeline.getCustomTime('newstart');
                } catch (err) {
                    timeline.addCustomTime(undefined, 'newstart');
                    timeline.addCustomTime(undefined, 'newend');
                    timeline.setCustomTimeTitle('New start', 'newstart');
                    timeline.setCustomTimeTitle('New end', 'newend');
                }
                timeline.setCustomTime(start, 'newstart');
                timeline.setCustomTime(end, 'newend');
            }
        });

        timeline.addCustomTime(undefined, 'start');
        timeline.addCustomTime(undefined, 'end');
        timeline.setCustomTimeTitle('Start', 'start');
        timeline.setCustomTimeTitle('End', 'end');
    }

    function show_timeline(tr_data) {
        let items = [];
        $.each(tr_data, function (ix, shot) {
            let t = new Date(shot.ts * 1000);
            items.push({ 'id': shot.ts, 'type': 'point', 'start': t });
        });
        let vis_items = new vis.DataSet(items);
        timeline.setItems(vis_items);
    }

    function update_timeline_items(n_slice) {
        let ids = [], items = [];
        for (let slice of slices) {
            if (slice.tr_data) {
                for (let tr of slice.tr_data) {
                    if (!ids[tr.ts]) {
                        let t = new Date(tr.ts * 1000);
                        items.push({ id: tr.ts, 'type': 'point', 'start': t });
                        ids[tr.ts] = true;
                    }
                }
            }
        }
        items.sort(function (a, b) { return a.id - b.id; });
        let vis_items = new vis.DataSet(items);
        timeline.setItems(vis_items);
    }

    function update_timeline_window(slice) {
        let start = slice.start * 1000;
        let end = slice.end * 1000;
        let range = slice.range * 1000;
        timeline.setCustomTime(start, 'start');
        timeline.setCustomTime(end, 'end');
        timeline.setWindow(start - range, end + range);
        show_awaiting(false);
    }

    function zoom_by_factor(parms, factor) {
        let win = timeline.getWindow();
        let start = win.start.getTime() / 1000;
        let wrange = (win.end.getTime() / 1000 - start);
        let center = parms.time / 1000;
        let range = wrange / 3 / factor;
        start = center - range / 2;
        zoom_by_timeline_slice(start, range);
    }

    function zoom_by_timeline_slice(start, range) {
        show_awaiting(true);

        let n_slice = { start: start, range: range, end: start + range };

        let extract = tr_slice(start, range);
        if (extract.length > 0) {
            n_slice.tr_data = extract;
            n_slice.slice_no = compute_slice_count(range);
            tr_slice_show(n_slice);
        } else {
            fetch_and_plot_json(n_slice, params.mahost);
        }
        slices.push(n_slice);
    }

    function scroll_by_step(step) {
        let p_start = timeline.getCustomTime('start') / 1000;
        let p_end = timeline.getCustomTime('end') / 1000;
        let range = p_end - p_start;
        zoom_by_timeline_slice(p_start + range * step, range);
    }

    // ====================================================================
    //  Copy tab
    // ====================================================================

    function copy_div(div_suffix) {
        let from_el = el(div_suffix);
        let timetext = 'copy' + (copy_no++);
        let tab_container = el('tabs');

        let li = '<li><a href="#' + id + '-' + timetext + '">' + timetext + '</a></li>';
        $(li).appendTo('#' + id + '-tabs .ui-tabs-nav');
        $('<div id="' + id + '-' + timetext + '"></div>').appendTo('#' + id + '-tabs');
        $('#' + id + '-tabs').tabs("refresh");

        let copy = document.getElementById(id + '-' + timetext);
        copy.style.width = from_el.style.width;
        copy.style.height = from_el.style.height;
        copy.innerHTML = from_el.innerHTML;

        plot_tree_json(current_slice.tree, id + '-' + timetext, true);
    }

    // ====================================================================
    //  Build inner HTML and initialise
    // ====================================================================

    function build_html() {
        let container = document.getElementById(id);
        if (!container) {
            console.error('tracetree_tab: container #' + id + ' not found');
            return false;
        }

        const peers_label =
            (from ? ' from <strong>' + from + '</strong>' : '') +
            (to   ? ' to <strong>'   + to   + '</strong>' : '');

        container.innerHTML = `
<div id="${id}-inner" class="tracetree-inner">
  <div class="tracetree-header">
    <span class="tracetree-title">Traceroute</span>
    <span class="tracetree-peers">${peers_label}</span>
    <button class="knapp tracetree-exit-max" id="${id}-unmaximize"
            title="Leave the maximized view (Esc)">&#x2715; Exit</button>
  </div>
  <div id="${id}-tabs" class="tracetree-tabs-wrap">
    <ul>
      <li><a href="#${id}-topo">Topology</a></li>
      <li><a href="#${id}-paths">Paths</a></li>
      <li><a href="#${id}-stats">Hop stats</a></li>
      <li><a href="#${id}-trace">Traceroute</a></li>
      <li><a href="#${id}-docs">Docs</a></li>
    </ul>
    <div id="${id}-topo" class="tracetree-topo">
      <div class="tracetree-graph" id="${id}-treetainer">
        <div class="tracetree-busy" id="${id}-awaiting">
          <div class="spinner spinner-lg"></div>
          <div class="tracetree-progress" id="${id}-progress">Processing topology…</div>
          <div class="tracetree-progressbar"><span id="${id}-progressfill"></span></div>
        </div>
      </div>
      <div class="tracetree-sidebar">
        <div class="topo-controls">
          <button class="knapp topo-btn" id="${id}-fullscreen">Full screen</button>
          <button class="knapp topo-btn" id="${id}-maximize">Maximize</button>
          <button class="knapp topo-btn" id="${id}-simple">Simple</button>
          <button class="knapp topo-btn" id="${id}-full">Full</button>
          <button class="knapp topo-btn" id="${id}-stop">Stop layout</button>
          <button class="knapp topo-btn" id="${id}-start">Start layout</button>
        </div>
        <div id="${id}-legend"></div>
      </div>
    </div>
    <div id="${id}-paths" class="tracetree-paths">
      <div class="tracetree-paths-bar">
        <div class="tracetree-paths-legend">
          <span class="tp-lg"><i class="tp-sw tp-lo"></i>hop adds &lt; 1 ms</span>
          <span class="tp-lg"><i class="tp-sw tp-mid"></i>1 &ndash; 10 ms</span>
          <span class="tp-lg"><i class="tp-sw tp-hi"></i>&gt; 10 ms</span>
          <span class="tp-lg"><i class="tp-sw tp-na"></i>no reply</span>
          <span class="tp-lg"><i class="tp-dot tp-src"></i>source</span>
          <span class="tp-lg"><i class="tp-dot tp-dst"></i>destination</span>
        </div>
        <div class="tracetree-paths-ctls">
          <div class="tracetree-paths-ctl">
            <span class="tp-ctl-label">Flow</span>
            <div class="tp-seg" role="group" aria-label="Orientation">
              <button type="button" class="knapp" id="${id}-paths-vert" aria-pressed="true" title="Top-down: one lane per hop, names beside the nodes">&darr; Down</button>
              <button type="button" class="knapp" id="${id}-paths-horiz" aria-pressed="false" title="Left-to-right: the whole path in one glance">&rarr; Across</button>
            </div>
          </div>
          <div class="tracetree-paths-ctl">
            <span class="tp-ctl-label">Hops</span>
            <div class="tp-seg" role="group" aria-label="Hop detail">
              <button type="button" class="knapp" id="${id}-paths-compact" aria-pressed="true" title="Fold runs of hops with no branching into one segment; click a segment to open it">Compact</button>
              <button type="button" class="knapp" id="${id}-paths-every" aria-pressed="false" title="Show every hop">Every hop</button>
            </div>
          </div>
          <div class="tracetree-paths-ctl">
            <span class="tp-ctl-label">Routes</span>
            <div class="tp-seg" role="group" aria-label="Routes shown">
              <button type="button" class="knapp" id="${id}-paths-top" aria-pressed="true">Top 6</button>
              <button type="button" class="knapp" id="${id}-paths-all" aria-pressed="false">All</button>
            </div>
          </div>
        </div>
      </div>
      <div class="tracetree-paths-charts">
        <div class="tracetree-paths-main">
          <div class="tracetree-paths-sub"><h3>Paths by hop</h3><span>ribbon width = traces through that link &middot; colour = minimum RTT the hop adds &middot; click a segment to open it, a route below to isolate it</span></div>
          <div class="tracetree-paths-scroll" id="${id}-paths-scroll1"><svg id="${id}-paths-svg" role="img" aria-label="Traceroute paths by hop"></svg></div>
        </div>
        <div class="tracetree-paths-side">
          <div class="tracetree-paths-sub"><h3>Latency profile</h3><span>median RTT per hop, log scale &middot; accent = dominant route &middot; grey = other routes &middot; shaded = min&ndash;max of all traces</span></div>
          <div class="tracetree-paths-scroll" id="${id}-paths-scroll2"><svg id="${id}-paths-prof" role="img" aria-label="Round-trip time by hop"></svg></div>
        </div>
      </div>
      <div class="tracetree-paths-sub"><h3>Distinct routes</h3><span id="${id}-paths-note"></span></div>
      <div class="tracetree-paths-routes"><table id="${id}-paths-table"><thead><tr><th class="num">#</th><th>Share</th><th class="num">Traces</th><th class="num">Hops</th><th>Leaves dominant route at</th><th class="num">Median RTT at end</th><th>Route</th></tr></thead><tbody></tbody></table></div>
      <div class="tracetree-paths-tip" id="${id}-paths-tip"></div>
    </div>
    <div id="${id}-stats"></div>
    <div id="${id}-trace"></div>
    <div id="${id}-docs" class="tracetree-docs">
      <h2>Traceroute reports</h2>
      <p>The traceroutes are collected using normal traceroute that probes hops in sequence and
      varies port numbers and by hit different flows each time and causes the various load sharing paths in the network to be seen.
      That means it does not report a particular route, just samples of nodes available on the various paths to the destination.</p>

      <h3>Topology</h3>
      <p>To construct a likely network topology we have connected nodes that appear in adjacent rows in a particular traceroute report, and then aggregating all single reports to an overall multipath-graph. One series of traceroutes is more likely to represent the state of the routing table at the time of execution, but routing can change any time so a true picture of the topology can not be constructed, and edges in the graph might not represent an actual network connection.</p>
      <p>Dashed lines means there are non-responding routers between nodes. Color scale is log(e) responses. Hover nodes to see links and corresponding table entry. Select node to scroll to table entry. Drag nodes to fix. <span style="color: var(--c-err)">Red</span> nodes marks it as the end of traceroute - i.e. no further route.</p>

      <h3>Navigation</h3>
      <p>The navigation is for finding the time window to make traceroute reports for.
      To the left you see the time for the currently shown time slice.
      With the right part you can use a slider to choose a sub-interval and buttons to zoom in and out
      of the enclosing interval.</p>
      <dl>
        <dt>Previous</dt><dd>moves the time window one step back in time</dd>
        <dt>Next</dt><dd>moves the time window one step forward in time</dd>
      </dl>
    </div>
  </div>
  <div id="${id}-timeline-container" class="tracetree-timeline-wrap">
    <div id="${id}-timeline"></div>
    <div class="tracetree-nav">
      <button class="knapp" id="${id}-prev">&#x25C2; Previous</button>
      <button class="knapp" id="${id}-next">Next &#x25B8;</button>
    </div>
  </div>
</div>`;
        return true;
    }

    function bind_buttons() {
        // Fullscreen toggle
        let fs_btn = el('fullscreen');
        if (fs_btn) {
            fs_btn.addEventListener('click', function () {
                let treeC = el('treetainer');
                if (!document.fullscreenElement) {
                    treeC.requestFullscreen().catch(function (err) {
                        console.log('Fullscreen request failed: ' + err.message);
                    });
                } else {
                    document.exitFullscreen();
                }
            });
        }

        // Maximize: give the topology the whole content area without going
        // fullscreen - drop the tab strips, the control column and the timeline,
        // keep the "from ... to ..." header and an exit button. The left nav is
        // folded away too (and put back on exit, unless it was already folded).
        let restore_sidebar = false;
        function set_maximized(on) {
            document.body.classList.toggle('tracetree-maximized', on);
            const sidebar = document.getElementById('sidebar');
            if (on) {
                if (sidebar && !sidebar.classList.contains('collapsed')) {
                    const t = document.getElementById('sidebarToggle');
                    if (t) { t.click(); restore_sidebar = true; }
                }
            } else if (restore_sidebar) {
                const o = document.getElementById('openSidebarBtn');
                if (o) o.click();
                restore_sidebar = false;
            }
            // The graph just changed size in a way no layout event covers.
            setTimeout(function () {
                try { if (tree) { tree.redraw(); tree.fit(); } } catch (_) {}
            }, 350);
        }

        const max_btn = el('maximize');
        if (max_btn) max_btn.addEventListener('click', function () { set_maximized(true); });

        const unmax_btn = el('unmaximize');
        if (unmax_btn) unmax_btn.addEventListener('click', function () { set_maximized(false); });

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && document.body.classList.contains('tracetree-maximized')) {
                set_maximized(false);
            }
        });

        // Simple view — reduce graph
        let simple_btn = el('simple');
        if (simple_btn) {
            simple_btn.addEventListener('click', function () {
                if (in_slice && in_slice.tree) {
                    let reduced = reduce_graph(in_slice.tree);
                    plot_tree_json(reduced, id + '-treetainer', false);
                }
            });
        }

        // Full view — re-show current slice
        let full_btn = el('full');
        if (full_btn) {
            full_btn.addEventListener('click', function () {
                if (in_slice) {
                    tr_slice_show(in_slice);
                }
            });
        }

        // Stop layout physics
        let stop_btn = el('stop');
        if (stop_btn) {
            stop_btn.addEventListener('click', function () {
                if (tree) {
                    tree.setOptions({ physics: { enabled: false } });
                }
            });
        }

        // Start layout physics
        let start_btn = el('start');
        if (start_btn) {
            start_btn.addEventListener('click', function () {
                if (tree) {
                    tree.setOptions({ physics: { enabled: true } });
                }
            });
        }

        // Previous / Next navigation
        let prev_btn = el('prev');
        if (prev_btn) {
            prev_btn.addEventListener('click', function () {
                scroll_by_step(-1);
            });
        }

        let next_btn = el('next');
        if (next_btn) {
            next_btn.addEventListener('click', function () {
                scroll_by_step(1);
            });
        }
    }

    // ── Main initialisation ───────────────────────────────────────────

    if (!build_html()) return;

    // Init jQuery UI tabs
    $('#' + id + '-tabs').tabs();

    // The timeline is irrelevant on the Docs sub-tab — hide it there and
    // restore it when the user switches back to a data-driven sub-tab.
    $('#' + id + '-tabs').on('tabsactivate', function (event, ui) {
        const tl = el('timeline-container');
        if (tl) {
            const is_docs = ui.newPanel && ui.newPanel.attr('id') === id + '-docs';
            tl.style.display = is_docs ? 'none' : '';
        }
        // The Paths view is drawn when it is opened: it needs the pane's real
        // width, and it would be wasted work to redraw it on every slice change
        // while it is hidden.
        if (ui.newPanel && ui.newPanel.attr('id') === id + '-paths') render_paths();
    });
    bind_paths_controls();

    // The tree container is sized by CSS now: its grid row fills the tab, so the
    // graph follows the window instead of being pinned to 55% of the viewport
    // height by an inline style (which won regardless of the available space and
    // left the lower part of the tab empty).

    bind_buttons();

    // Build mother slice from arguments
    if (time_start) {
        mother.start = time_start * msts;
    }
    if (time_end) {
        mother.end = time_end * msts;
    }

    if (!mother.start) {
        if (!mother.end)
            mother.end = Date.now() / 1000 * msts;
        mother.start = mother.end - mother.range;
    }
    mother.start = Math.floor(mother.start / mother.range) * mother.range;
    if (!mother.end)
        mother.end = mother.start + mother.range;
    mother.slice_count = Math.floor(mother.range / compute_slice_size(mother.range));
    mother.slice_no = 0;
    current_slice = mother;

    // Init timeline
    init_timeline();

    // Start loading data
    if (params.mahost) {
        fetch_and_plot_json(mother, params.mahost);
    }
}
