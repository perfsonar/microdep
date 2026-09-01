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

    // ── Colour ramp for node heatmap ──────────────────────────────────
    const node_colors = [
        "#f7fbff",
        "#deebf7",
        "#c6dbef",
        "#9ecae1",
        "#6baed6",
        "#4292c6"
    ];

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

    function create_legend(elem_suffix, colors, limits) {
        let table = '<table class="tracetree-legend">\n';
        for (let i in colors) {
            let lim = limits[i].toPrecision(3);
            table += '<tr><td style="background-color:' + colors[i] + '" title=' + lim + '>' + lim + '</td>\n';
        }
        el(elem_suffix).innerHTML = table + '</table>';
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
            create_legend('legend', node_colors, limits);

            plot_tree_json(slice.tree, id + '-treetainer', false);
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
                stabilization: { enabled: true, iterations: 10 },
                timestep: 0.3
            },
            layout: { improvedLayout: true },
            nodes: {},
            edges: {
                scaling: { max: 8 },
                arrows: { middle: { enabled: true, scaleFactor: 1, type: 'arrow' } }
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
        let nodes_ds = new vis.DataSet(data.nodes);
        let edges_ds = new vis.DataSet(data.edges);
        topology = { nodes: nodes_ds, edges: edges_ds };

        if (copy) {
            new vis.Network(container, topology, opts);
        } else if (tree) {
            update_tree_json(tree, topology);
        } else {
            tree = new vis.Network(container, topology, opts);

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

    function reduce_graph(data) {
        let ok_nodes = {};
        let nodes = [];
        let edges = [];
        let hops = [];

        for (let stats of data.stats) {
            if (!hops[stats.hop]) hops[stats.hop] = 0;
            if (hops[stats.hop]++ <= max_parallel) {
                ok_nodes[stats.address] = true;
            }
        }
        for (let node of data.nodes) {
            if (node.id in ok_nodes) {
                nodes.push(node);
            }
        }
        for (let edge of data.edges) {
            if (edge.to in ok_nodes && edge.from in ok_nodes) {
                edges.push(edge);
            }
        }
        return { nodes: nodes, edges: edges, stats: data.stats };
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

    function fix_positions(nodes, stats, container) {
        let last = stats.length - 1;
        if (last >= 0) {
            let starti = find_node(nodes, stats[0].address);
            let endi = find_node(nodes, stats[last].address);

            if (starti !== null && endi !== null) {
                let minx = 15, maxx = container.clientWidth - 30;
                let miny = 15, maxy = container.clientHeight - 30;

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
                nodes[starti].fixed = true;
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
  </div>
  <div id="${id}-tabs" class="tracetree-tabs-wrap">
    <ul>
      <li><a href="#${id}-topo">Topology</a></li>
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
          <button class="knapp topo-btn" id="${id}-simple">Simple</button>
          <button class="knapp topo-btn" id="${id}-full">Full</button>
          <button class="knapp topo-btn" id="${id}-stop">Stop layout</button>
          <button class="knapp topo-btn" id="${id}-start">Start layout</button>
        </div>
        <div id="${id}-legend"></div>
      </div>
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
        if (!tl) return;
        const is_docs = ui.newPanel && ui.newPanel.attr('id') === id + '-docs';
        tl.style.display = is_docs ? 'none' : '';
    });

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
