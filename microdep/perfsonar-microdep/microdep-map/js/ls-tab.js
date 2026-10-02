/**
 * ls-tab.js — ES6 module refactored from perfsonar-tracetree/js/ls.js
 *
 * Renders the traceroute browser (Peers, Traceroute)
 * inside a single container element so it can be embedded as one of the
 * microdep-map tabs.
 *
 * Exports `ls_tab(div_id, from, to, time_start, time_end, options)`.
 * All state is local to the closure so multiple instances may coexist.
 *
 * Top-level sub-tabs created:
 *   1. Peers                 — peer pairs found in the active MA.
 *   2. Traceroute            — hosts the topology / hop stats / traceroute /
 *                              docs UI by delegating to `tracetree_tab()`.
 *
 * If `from`/`to` are supplied, the Traceroute tab auto-loads and is the first
 * one shown to the user.
 *
 * Removed compared to original ls.js:
 *   - Global `urlParams`, `measurements`, `tr_events`, `ma_list`.
 *   - Hard-coded element IDs (`#ma`, `#peers`, `#trace`, `#tabs`).
 *   - Inline onclick="..." / onkeyup="..." handlers — replaced with
 *     event delegation using data-* attributes.
 *   - Outer document.ready bootstrapper (now an explicit init at end).
 *   - iframe-based loading of tracetree.html — replaced by `tracetree_tab()`.
 *
 *
 * Changelog:
 * 2026-06-17 otto.wittner@sikt.no - The Measurement archive tab has been removed, but there are still obsolete code all over the place.
 * 2026-10-02 - That obsolete code has been removed: the lookup service, the list of measurement archives and the esmond API.
 */

import { tracetree_tab } from "./tracetree-tab.js";
import { escapeHtml } from "./map-lib.js";

export function ls_tab(div_id, from, to, time_start, time_end, options = {}) {

    const id = div_id;

    // Params bag (was global urlParams in ls.js)
    const params = {
        from:        from,
        to:          to,
        net:         options.net        || '',
        mahost:      options.mahost     || '',
        // Empty/absent means "all versions" (the config allows that) - only
        // filter when the network actually pins one (issue #127).
        ip_version:  options.ip_version,
        // Addresses of the two ends (when the map knows them): the archive
        // records one end by IP and the other by name, so a pair is matched by
        // either form - see find_matching_pair().
        from_adr:    options.from_adr   || '',
        to_adr:      options.to_adr     || '',
        // Map-supplied leaf status for the tree view (a function, so it is
        // never persisted and always reflects the map's current property).
        leaf_status: typeof options.leaf_status === 'function' ? options.leaf_status : null
    };

    // Compute time range (epoch seconds)
    let start_time, end_time;
    if (time_start) {
        start_time = time_start;
    } else {
        const now = Date.now() / 1000;
        const day = 24 * 3600;
        start_time = Math.floor(now / day) * day;
    }
    if (time_end) {
        end_time = time_end;
    } else {
        end_time = start_time + 24 * 3600;
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    function el(suffix) {
        return document.getElementById(id + '-' + suffix);
    }

    // Forgiving matcher for the search box. Each whitespace-separated term
    // matches if it's either (a) a substring of the target, or (b) an
    // anagram-style multiset match (all its characters are available in the
    // target) — so minor transpositions / partial typing still hit. All
    // terms must match (AND), which lets the user combine tokens that span
    // columns (e.g. peer name + a bit of the timestamp).
    function fuzzy_match(query, target) {
        if (!query) return true;
        target = target.toUpperCase();
        const terms = query.toUpperCase().split(/\s+/).filter(Boolean);
        outer: for (const term of terms) {
            if (target.indexOf(term) !== -1) continue;          // (a) substring
            const counts = {};                                   // (b) multiset
            for (const ch of target) counts[ch] = (counts[ch] || 0) + 1;
            for (const ch of term) {
                if (!counts[ch] || counts[ch] <= 0) return false;
                counts[ch]--;
            }
            continue outer;
        }
        return true;
    }

    // ── Search / filter (ports of search_table_ma / search_table_peer) ──
    function search_table(input_id, table_id) {
        const input = document.getElementById(input_id);
        const table = document.getElementById(table_id);
        if (!input || !table) return;
        const filter = input.value;
        const rows = table.getElementsByTagName('tr');
        for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagName('td');
            // Always show header rows (they have <th>, no <td>)
            if (cells.length === 0) { rows[i].style.display = ''; continue; }
            // Concatenate the row's text once, then fuzzy-match the whole
            // row rather than each cell individually so tokens can span
            // columns.
            let rowText = '';
            for (let j = 0; j < cells.length; j++) rowText += ' ' + cells[j].textContent;
            rows[i].style.display = fuzzy_match(filter, rowText) ? '' : 'none';
        }
    }

    // Find the archive's pair entry for the requested `want_from`/`want_to`.
    // Three things make this fuzzy: the map may pass a hostname in a slightly
    // different form than the archive records (CNAME vs canonical FQDN), the
    // archive records one end by IP and the other by name (the map hands us the
    // addresses too, when it knows them), and traceroutes usually exist in one
    // direction only - the local host traces towards its peers - while the map
    // link may point the other way. So every level of strictness is tried in
    // both directions before loosening further; a reverse hit is returned with
    // `reversed: true` so the caller can say so.
    //
    // Returns a `{from, to}` entry from `list` (plus `reversed`) or null.
    function find_matching_pair(list, want_from, want_to, want_from_adr, want_to_adr) {
        const norm  = s => String(s || '').trim().toLowerCase();
        const is_ip = s => /^[0-9.]+$/.test(s) || s.indexOf(':') >= 0;
        // Loose equality for names: FQDN vs short form either way. Addresses
        // only match exactly - "10.0.0.1" must not swallow "10.0.0.10".
        const like = (a, b) => a === b || (!is_ip(a) && !is_ip(b) && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0));
        const head = s => is_ip(s) ? s : s.split('.')[0];

        // Candidate strings for each end: the topology name and its address.
        const F = [norm(want_from), norm(want_from_adr)].filter(Boolean);
        const T = [norm(want_to),   norm(want_to_adr)].filter(Boolean);
        if (!F.length || !T.length) return null;

        const levels = [
            // 1. Exact match on both ends (name or address, case-insensitive).
            (from, to) => list.find(p => from.includes(norm(p.from)) && to.includes(norm(p.to))),
            // 2. One side is a substring of the other (FQDN vs short form).
            (from, to) => list.find(p => from.some(f => like(norm(p.from), f)) && to.some(t => like(norm(p.to), t))),
            // 3. First DNS label on both ends ("ps-branko" === "ps-branko").
            (from, to) => list.find(p => from.some(f => head(norm(p.from)) === head(f)) && to.some(t => head(norm(p.to)) === head(t))),
            // 4. The destination alone identifies the pair - with a single
            //    archive the source is implicitly "us", however it is spelled.
            (from, to) => { const h = list.filter(p => to.some(t => like(norm(p.to), t)));     return h.length === 1 ? h[0] : null; },
            // 5. Same for the source.
            (from, to) => { const h = list.filter(p => from.some(f => like(norm(p.from), f))); return h.length === 1 ? h[0] : null; }
        ];
        const dirs = [ { from: F, to: T, reversed: false }, { from: T, to: F, reversed: true } ];
        for (const level of levels) {
            for (const d of dirs) {
                const p = level(d.from, d.to);
                if (p) return d.reversed ? Object.assign({}, p, { reversed: true }) : p;
            }
        }
        return null;
    }

    // Every pair the archive holds FROM `want_from` (by name or address): the
    // source as the archive spells it plus the list of peers, or null.
    function find_tree_pairs(list, want_from, want_from_adr) {
        const norm = s => String(s || '').trim().toLowerCase();
        const F = [norm(want_from), norm(want_from_adr)].filter(Boolean);
        if (!F.length) return null;
        const head = s => s.split('.')[0];
        let hits = list.filter(p => F.includes(norm(p.from)));
        if (!hits.length) hits = list.filter(p => F.some(f => !/^[0-9.:]+$/.test(f) && head(norm(p.from)) === head(f)));
        if (!hits.length) return null;
        const cnt = {}; let src = null;
        hits.forEach(p => { cnt[p.from] = (cnt[p.from] || 0) + 1; if (src === null || cnt[p.from] > cnt[src]) src = p.from; });
        const peers = []; const seen = {};
        hits.forEach(p => { if (p.from === src && !seen[p.to]) { seen[p.to] = true; peers.push(p.to); } });
        return { from: src, peers: peers.sort() };
    }

    // ── OpenSearch API: list traceroutes within a time range ────────────
    function fetch_base_os(mahost, t_start, t_end) {
        if (t_end === undefined) t_end = t_start + 24 * 3600;
        const start_iso = new Date(t_start * 1000).toISOString();
        const end_iso   = new Date(t_end   * 1000).toISOString();

        // get-tracetests.pl queries the archive mapconfig.yml gives the network:
        // it takes no archive address, nor any TLS setting, from the page.
        const fetch_url = 'get-tracetests.pl?net=' + encodeURIComponent(params.net) +
                          '&start=' + encodeURIComponent(start_iso) +
                          '&end='   + encodeURIComponent(end_iso) +
                          (params.ip_version ? '&ip_version=' + encodeURIComponent(params.ip_version) : '');

        const start = new Date(t_start * 1000);
        const end   = new Date(t_end   * 1000);

        const head =
            '<div class="ls-toolbar">' +
              '<input type="text" class="ls-search-input" id="' + id + '-peer-search" placeholder="Search peers...">' +
              '<label>From <input type="text" id="' + id + '-dp-from" class="ls-date-input" size="12" value="' + start.toLocaleDateString() + '"></label>' +
              '<label>To <input type="text" id="' + id + '-dp-to" class="ls-date-input" size="12" value="' + end.toLocaleDateString() + '"></label>' +
            '</div>';
        const tableHead =
            '<table id="' + id + '-peer-table" class="sortable ls-table">' +
              '<thead><tr><th class="sorttable_nosort ls-check"><input type="checkbox" class="ls-pick-all" title="Select every listed pair (those matching the search)" aria-label="Select all"></th><th>Time updated<th>Peers list</thead><tbody>';
        const tableTail = '</tbody></table>';

        $.getJSON(fetch_url, function (results) {
            let body = '';
            const seen = {};
            const pair_list = [];

            // The peer names are the archive's own strings: escaped wherever
            // they go into the markup below.
            const buckets = (results && results.aggregations && results.aggregations.peers && results.aggregations.peers.buckets) || [];
            for (let r = 0; r < buckets.length; r++) {
                const peer_from = buckets[r].key[0];
                const peer_to   = buckets[r].key[1];
                const pair_key = peer_from + ' - ' + peer_to;
                if (seen[pair_key]) continue;
                seen[pair_key] = true;
                pair_list.push({ from: peer_from, to: peer_to });

                const tu = new Date(buckets[r].timestamp.value);
                body += '<tr>' +
                          '<td class="ls-check"><input type="checkbox" class="ls-pick" data-from="' + escapeHtml(peer_from) + '" data-to="' + escapeHtml(peer_to) + '" aria-label="Select ' + escapeHtml(pair_key) + '"></td>' +
                          '<td>' + tu.toLocaleDateString() + 'T' + tu.toLocaleTimeString() + '</td>' +
                          '<td><button class="knapp ls-pair-btn" data-action="os-pair" data-server="' + escapeHtml(mahost) + '"' +
                            ' data-from="' + escapeHtml(peer_from) + '" data-to="' + escapeHtml(peer_to) + '"' +
                            ' data-start="' + t_start + '" data-end="' + t_end + '">' + escapeHtml(pair_key) + '</button></td>' +
                        '</tr>';
            }

            // One button per source with several peers: every route from that
            // host in one tree.
            const by_src = {};
            pair_list.forEach(function (p) { (by_src[p.from] = by_src[p.from] || []).push(p.to); });
            let trees = '';
            Object.keys(by_src).sort().forEach(function (src) {
                if (by_src[src].length < 2) return;
                trees += '<button class="knapp ls-pair-btn" data-action="os-tree" data-server="' + escapeHtml(mahost) + '"' +
                         ' data-from="' + escapeHtml(src) + '" data-to="' + escapeHtml(by_src[src].join(',')) + '"' +
                         ' data-start="' + t_start + '" data-end="' + t_end + '"' +
                         ' title="Every route from ' + escapeHtml(src) + ' in one picture">All ' + by_src[src].length + ' peers of ' + escapeHtml(src) + '</button>';
            });
            // "Show selected" opens the checked pairs: one as a pair, several
            // (of one source) as a tree of just those peers.
            const selected_btn = '<button class="knapp ls-pair-btn" data-action="os-selected" data-server="' + escapeHtml(mahost) + '"' +
                                 ' data-start="' + t_start + '" data-end="' + t_end + '" id="' + id + '-show-selected" disabled' +
                                 ' title="Tick pairs in the list, then show them: one as a pair, several of one source as a tree">Show selected</button>';
            const tree_bar = pair_list.length ? '<div class="ls-tree-bar">' + selected_btn + trees + '</div>' : '';

            if (pair_list.length) {
                el('peers').innerHTML = head + tree_bar + tableHead + body + tableTail;
            } else {
                el('peers').innerHTML = head + '<h4 class="center-text">No traceroutes found in this archive for the selected period.</h4>';
            }
            wire_peers_tab(mahost, t_start, t_end);

            // Resolve the Traceroute pane for the requested pair, using the
            // exact strings as stored in the archive (microdep may pass a
            // slightly shorter form which would yield an empty hop graph).
            // The "Resolving peer pair…" spinner was shown in ls_tab() for
            // every from/to launch, so it MUST be replaced on every outcome —
            // match, no-match, or no-peers — otherwise it spins forever.
            if (params.from && Array.isArray(params.to)) {
                // A restored tree tab: the peers are already the archive's own names.
                open_tracetree_os(mahost, params.from, params.to, t_start, t_end);
            } else if (params.from && params.to === '*') {
                // Every peer of the host: the tree view.
                const tree = pair_list.length ? find_tree_pairs(pair_list, params.from, params.from_adr) : null;
                if (tree) {
                    open_tracetree_os(mahost, tree.from, tree.peers, t_start, t_end, { requested: { from: params.from, to: '*' } });
                } else {
                    el('trace').innerHTML =
                        '<div class="center-text" style="padding:40px">' +
                          '<p>No traceroutes from <strong>' + escapeHtml(params.from) + '</strong> were found in this archive for the selected period.</p>' +
                          '<p style="color:var(--c-text-3);font-size:.85rem">Traceroutes are recorded by the host that runs them, so a tree needs the archive of that host.</p>' +
                        '</div>';
                }
            } else if (params.from && params.to) {
                const match = pair_list.length
                    ? find_matching_pair(pair_list, params.from, params.to, params.from_adr, params.to_adr)
                    : null;
                if (match) {
                    open_tracetree_os(mahost, match.from, match.to, t_start, t_end, {
                        requested: { from: params.from, to: params.to },
                        notice: match.reversed ? reverse_notice(match) : ''
                    });
                } else {
                    el('trace').innerHTML =
                        '<div class="center-text" style="padding:40px">' +
                          '<p>No traceroute data matching ' +
                            '<strong>' + escapeHtml(params.from) + '</strong> → <strong>' + escapeHtml(params.to) + '</strong> ' +
                            'was found in this archive for the selected period.</p>' +
                          '<p style="color:var(--c-text-3);font-size:.85rem">Pick a pair from the <em>Peers</em> tab, or widen the date range.</p>' +
                        '</div>';
                }
            }
        }).fail(function (jqxhr, textStatus, error) {
            const msg = "Failed to get " + fetch_url + " (" + textStatus + ", " + error + ")";
            console.log("ls_tab: " + msg);
            el('peers').innerHTML = '<h4 class="center-text">' + escapeHtml(msg) + '</h4>';
            // Don't leave the Traceroute spinner spinning on a failed fetch.
            if (params.from && params.to) {
                el('trace').innerHTML =
                    '<div class="center-text" style="padding:40px">' +
                      '<p>Failed to load traceroute data.</p>' +
                      '<p style="color:var(--c-text-3);font-size:.85rem">' + escapeHtml(msg) + '</p>' +
                    '</div>';
            }
        });
    }

    // ── Wire up search box, datepickers, sortable, pair buttons ─────────
    function wire_peers_tab(mahost, t_start, t_end) {
        // Search filter
        const search = document.getElementById(id + '-peer-search');
        if (search) {
            search.addEventListener('keyup', function () {
                search_table(id + '-peer-search', id + '-peer-table');
                sync_pick_all();
            });
        }

        // Date pickers (jQuery UI)
        const $from = $('#' + id + '-dp-from');
        const $to   = $('#' + id + '-dp-to');
        if ($from.length) {
            $from.datepicker({
                defaultDate: new Date(t_start * 1000),
                changeMonth: true,
                numberOfMonths: 1
            }).on('change', function () {
                const ns = new Date($from.val()) / 1000;
                const ne = new Date($to.val()) / 1000;
                fetch_base_os(mahost, ns, ne);
            });
        }
        if ($to.length) {
            $to.datepicker({
                defaultDate: new Date(t_end * 1000),
                changeMonth: true,
                numberOfMonths: 1
            }).on('change', function () {
                const ns = new Date($from.val()) / 1000;
                const ne = new Date($to.val()) / 1000;
                fetch_base_os(mahost, ns, ne);
            });
        }

        // Sortable
        const tbl = document.getElementById(id + '-peer-table');
        if (tbl && typeof sorttable !== 'undefined') {
            sorttable.makeSortable(tbl);
        }
        // Pair button click delegation is attached once at init time
        // (see init_pair_delegation) to avoid duplicate handlers on re-fetch.
    }

    // Attach the pair-button click delegation only once to the peers pane
    // (re-fetch destroys table HTML but the outer pane element is reused).
    function init_pair_delegation() {
        const peers_pane = el('peers');
        if (!peers_pane || peers_pane.dataset.lsDelegated) return;
        peers_pane.dataset.lsDelegated = '1';
        peers_pane.addEventListener('click', function (ev) {
            const btn = ev.target.closest('button[data-action]');
            if (!btn) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (btn.dataset.action === 'os-pair') {
                open_tracetree_os(
                    btn.dataset.server,
                    btn.dataset.from,
                    btn.dataset.to,
                    parseInt(btn.dataset.start, 10),
                    parseInt(btn.dataset.end,   10)
                );
            } else if (btn.dataset.action === 'os-tree') {
                open_tracetree_os(
                    btn.dataset.server,
                    btn.dataset.from,
                    btn.dataset.to.split(','),
                    parseInt(btn.dataset.start, 10),
                    parseInt(btn.dataset.end,   10)
                );
            } else if (btn.dataset.action === 'os-selected') {
                const picked = picked_pairs();
                if (!picked.length) return;
                const t0 = parseInt(btn.dataset.start, 10), t1 = parseInt(btn.dataset.end, 10);
                if (picked.length === 1) open_tracetree_os(btn.dataset.server, picked[0].from, picked[0].to, t0, t1);
                else open_tracetree_os(btn.dataset.server, picked[0].from, picked.map(function (p) { return p.to; }), t0, t1);
            }
        });
        // The tick boxes: the header box follows the search filter, the rows
        // keep the header box and the "Show selected" button in step.
        peers_pane.addEventListener('change', function (ev) {
            const box = ev.target;
            if (box.classList && box.classList.contains('ls-pick-all')) {
                visible_rows().forEach(function (tr) { const cb = tr.querySelector('.ls-pick'); if (cb) cb.checked = box.checked; });
            } else if (!(box.classList && box.classList.contains('ls-pick'))) {
                return;
            }
            sync_pick_all();
            update_selected_button();
        });
    }

    function visible_rows() {
        const tbl = document.getElementById(id + '-peer-table');
        return tbl ? Array.prototype.filter.call(tbl.querySelectorAll('tbody tr'), function (tr) { return tr.style.display !== 'none'; }) : [];
    }

    function picked_pairs() {
        const peers_pane = el('peers');
        return peers_pane ? Array.prototype.map.call(peers_pane.querySelectorAll('.ls-pick:checked'), function (cb) { return { from: cb.dataset.from, to: cb.dataset.to }; }) : [];
    }

    function sync_pick_all() {
        const all = document.querySelector('#' + id + '-peer-table .ls-pick-all'); if (!all) return;
        const rows = visible_rows().map(function (tr) { return tr.querySelector('.ls-pick'); }).filter(Boolean);
        const n = rows.filter(function (cb) { return cb.checked; }).length;
        all.checked = rows.length > 0 && n === rows.length;
        all.indeterminate = n > 0 && n < rows.length;
    }

    function update_selected_button() {
        const btn = el('show-selected'); if (!btn) return;
        const picked = picked_pairs();
        const sources = {}; picked.forEach(function (p) { sources[p.from] = true; });
        const n_src = Object.keys(sources).length;
        btn.disabled = !picked.length || n_src > 1;
        btn.textContent = !picked.length ? 'Show selected'
                        : picked.length === 1 ? 'Show the selected pair'
                        : 'Show ' + picked.length + ' selected peers as a tree';
        btn.title = n_src > 1 ? 'The selected pairs have ' + n_src + ' different sources; a tree grows from one'
                  : 'Tick pairs in the list, then show them: one as a pair, several of one source as a tree';
    }

    // ── Open the Traceroute tab and render via tracetree_tab() ──────────
    function open_tracetree_os(server, peer_from, peer_to, t_start, t_end, extra) {
        render_tracetree(server, peer_from, peer_to, t_start, t_end, /*api=*/'opensearch', extra);
    }

    // Text for the strip above the graph when only the opposite direction of
    // the requested pair exists in the archive.
    function reverse_notice(match) {
        const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        return 'Opposite direction shown: this archive has no traceroute for ' +
               '<strong>' + esc(params.from) + '</strong> \u2192 <strong>' + esc(params.to) + '</strong>, ' +
               'so <strong>' + esc(match.from) + '</strong> \u2192 <strong>' + esc(match.to) + '</strong> is displayed instead. ' +
               'Hops and round-trip times are as seen from ' + esc(match.from) + '.';
    }

    // `extra` (optional): { notice: html shown above the graph,
    //                       requested: {from, to} the pair the caller asked for
    //                       when it differs from the one displayed }
    function render_tracetree(mahost, p_from, p_to, t_start, t_end, api, extra) {
        extra = extra || {};
        const inner_id = id + '-trace-inner';
        const trace_pane = el('trace');
        // The wrapper needs a class: as a plain block it would not grow, and the
        // tracetree inside it (flex: 1) would stop at its min-height, leaving the
        // lower part of the tab empty.
        trace_pane.innerHTML =
            (extra.notice ? '<div class="tracetree-notice">' + extra.notice + '</div>' : '') +
            '<div id="' + inner_id + '" class="tracetree-host"></div>';
        // Sub-tabs are Traceroute (0) and Peers (1) - the old `active: 2` is a
        // leftover from a three-tab layout and selects nothing, so opening a
        // pair from the Peers list never switched to the graph.
        $('#' + id + '-tabs').tabs({ active: 0 });

        tracetree_tab(inner_id, p_from, p_to, t_start, t_end, {
            net:         params.net,
            mahost:      mahost,
            api:         api,
            ip_version:  params.ip_version,
            leaf_status: params.leaf_status
        });

        // Tell the map which pair is on screen, so a reload comes back to it
        // instead of the "no traceroute data matching ..." pane. Picking a pair
        // from the Peers list used to be forgotten entirely.
        // A pair resolved from a map link is remembered as the map named it,
        // so a reload resolves it the same way (and shows the same notice).
        const req = extra.requested || {};
        document.dispatchEvent(new CustomEvent('microdep-tracetree-pair', {
            detail: {
                divid: id, from: req.from || p_from, to: req.to || p_to,
                startEpoch: t_start, endEpoch: t_end,
                mahost: mahost, api: api, ip_version: params.ip_version,
                net: params.net
            }
        }));
    }

    // ── Build the outer 2-tab structure ─────────────────────────────────
    function build_html() {
        const container = document.getElementById(id);
        if (!container) {
            console.error('ls_tab: container #' + id + ' not found');
            return false;
        }
        container.innerHTML = `
<div id="${id}-inner" class="ls-tab-inner">
  <div id="${id}-tabs" class="ls-tabs">
    <ul>
      <li><a href="#${id}-trace">Traceroute</a></li>
      <li><a href="#${id}-peers">Peers</a></li>
    </ul>
    <div id="${id}-peers" class="ls-pane">
      <h2 class="center-text">Error: Failed to access measurement archive. Check mapconfig.yml.</h2>
    </div>
    <div id="${id}-trace" class="ls-pane">
      <h2 class="center-text">Please choose a peer pair</h2>
    </div>
  </div>
</div>`;
        return true;
    }

    // ── Initialisation ──────────────────────────────────────────────────
    if (!build_html()) return;
    $('#' + id + '-tabs').tabs();
    init_pair_delegation();

    // If from/to are known (typical case when launched from the microdep
    // map), preselect the Traceroute sub-tab and show a spinner. The actual
    // topology load is deferred until the Peers fetch returns, so we can
    // resolve the *exact* peer-name strings stored in OpenSearch (the
    // microdep map sometimes uses a slightly different form than what the
    // archive recorded — exact-string match on from/to is required by the
    // backend or the hop graph comes back empty).
    if (params.from && params.to) {
        $('#' + id + '-tabs').tabs({ active: 0 });
        el('trace').innerHTML =
            '<div class="center-text" style="padding:40px">' +
              '<div class="spinner"></div>' +
              '<p>Resolving peer pair for ' + escapeHtml(params.from) + ' → ' + escapeHtml(params.to) + '…</p>' +
            '</div>';
    } else {
        // Opened without a pair (the map's "Routes" menu entry): show the
        // Peers list, which is what the user came for (issue #124).
        $('#' + id + '-tabs').tabs({ active: 1 });
        el('peers').innerHTML =
            '<div class="center-text" style="padding:40px">' +
              '<div class="spinner"></div><p>Loading traceroute peers…</p>' +
            '</div>';
    }

    fetch_base_os(params.mahost, start_time, end_time);
}
