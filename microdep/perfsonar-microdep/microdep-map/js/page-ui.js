// Theme, sidebar, custom dropdowns and auto-refresh of the map page.
// (A file of its own, loaded by index.html: the content security policy of the
// map allows no script written into a page.)

(function(){
  // --- Theme switcher ---
  var root = document.documentElement;
  var saved = localStorage.getItem('microdep-theme') || 'auto';
  root.setAttribute('data-theme', saved);

  function applyTheme(mode) {
    root.setAttribute('data-theme', mode);
    localStorage.setItem('microdep-theme', mode);
    document.querySelectorAll('.theme-btn').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.theme === mode);
    });
  }
  applyTheme(saved);

  document.querySelectorAll('.theme-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      applyTheme(this.dataset.theme);
    });
  });

  // --- Sidebar toggle ---
  var sidebar = document.getElementById('sidebar');
  var toggleBtn = document.getElementById('sidebarToggle');
  var openBtn = document.getElementById('openSidebarBtn');
  var openLi = document.getElementById('openSidebarLi');
  var backdrop = document.getElementById('sidebarBackdrop');

  // Mobile-first default: on small viewports start collapsed so the
  // user lands on the map; the drawer opens over a backdrop on demand.
  var mobileMql = window.matchMedia('(max-width: 768px)');
  if (mobileMql.matches) {
    sidebar.classList.add('collapsed');
  }

  function updateOpenBtn() {
    var collapsed = sidebar.classList.contains('collapsed');
    if (collapsed) {
      openLi.style.display = '';
    } else {
      openLi.style.display = 'none';
    }
    // Mirror state onto <body> so the mobile backdrop CSS can react.
    document.body.classList.toggle('sidebar-open', !collapsed);
  }

  toggleBtn.addEventListener('click', function(){
    sidebar.classList.add('collapsed');
    updateOpenBtn();
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); }, 350);
  });

  openBtn.addEventListener('click', function(){
    sidebar.classList.remove('collapsed');
    updateOpenBtn();
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); }, 350);
  });

  // Tap the backdrop on mobile -> close the drawer (no-op on desktop
  // where the backdrop is display:none).
  if (backdrop) {
    backdrop.addEventListener('click', function(){
      sidebar.classList.add('collapsed');
      updateOpenBtn();
      setTimeout(function(){ window.dispatchEvent(new Event('resize')); }, 350);
    });
  }

  updateOpenBtn();

  // --- Link panel close ---
  document.getElementById('linkPanelClose').addEventListener('click', function(){
    document.getElementById('link-panel').classList.add('hidden');
    if (typeof currentPanelLink !== 'undefined') currentPanelLink = null;
    if (typeof window.clearHighlightedLink === 'function') window.clearHighlightedLink();
  });

  // =========================================================
  // CUSTOM SELECT DROPDOWN SYSTEM
  // =========================================================

  var checkIconSVG = '<svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>';

  function createCustomSelect(wrapper) {
    var targetId = wrapper.dataset.target;
    var nativeSelect = document.getElementById(targetId);
    if (!nativeSelect) return;

    wrapper.innerHTML = 
      '<div class="custom-select-trigger">' +
        '<span class="custom-select-value"></span>' +
        '<span class="custom-select-arrow"></span>' +
      '</div>' +
      '<div class="custom-select-dropdown"></div>';

    var trigger = wrapper.querySelector('.custom-select-trigger');
    var valueEl = wrapper.querySelector('.custom-select-value');
    var dropdown = wrapper.querySelector('.custom-select-dropdown');

    function syncOptions() {
      dropdown.innerHTML = '';
      var options = nativeSelect.querySelectorAll('option');
      options.forEach(function(opt) {
        var optionEl = document.createElement('div');
        optionEl.className = 'custom-select-option';
        optionEl.dataset.value = opt.value;
        optionEl.innerHTML = checkIconSVG + '<span class="custom-select-option-text">' + opt.textContent + '</span>';
        // Carry the native option's help text (the config `descr`, set as the
        // option title by make_prop_select) onto the styled option, so hovering
        // a menu item shows its description (issue #108).
        if (opt.title) optionEl.title = opt.title;
        if (opt.selected) {
          optionEl.classList.add('selected');
          valueEl.textContent = opt.textContent;
          if (opt.title) trigger.title = opt.title; else trigger.removeAttribute('title');
        }
        optionEl.addEventListener('click', function(e) {
          e.stopPropagation();
          selectOption(opt.value, opt.textContent);
        });
        dropdown.appendChild(optionEl);
      });
    }

    function selectOption(value, text) {
      nativeSelect.value = value;
      valueEl.textContent = text;
      dropdown.querySelectorAll('.custom-select-option').forEach(function(opt) {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });
      wrapper.classList.remove('open');
      var event = new Event('change', { bubbles: true });
      nativeSelect.dispatchEvent(event);
    }

    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      document.querySelectorAll('.custom-select.open').forEach(function(other) {
        if (other !== wrapper) other.classList.remove('open');
      });
      wrapper.classList.toggle('open');
    });

    var observer = new MutationObserver(function() { syncOptions(); });
    observer.observe(nativeSelect, { childList: true, subtree: true, attributes: true });

    nativeSelect.addEventListener('change', function() {
      var selectedOpt = nativeSelect.options[nativeSelect.selectedIndex];
      if (selectedOpt) {
        valueEl.textContent = selectedOpt.textContent;
        // Keep the selectbox's hover help text in sync with the selection (#108).
        if (selectedOpt.title) trigger.title = selectedOpt.title; else trigger.removeAttribute('title');
        dropdown.querySelectorAll('.custom-select-option').forEach(function(opt) {
          opt.classList.toggle('selected', opt.dataset.value === selectedOpt.value);
        });
      }
    });

    syncOptions();
    return { syncOptions: syncOptions };
  }

  document.addEventListener('click', function() {
    document.querySelectorAll('.custom-select.open').forEach(function(wrapper) {
      wrapper.classList.remove('open');
    });
  });

  function initAllCustomSelects() {
    document.querySelectorAll('.custom-select[data-target]').forEach(function(wrapper) {
      if (!wrapper.dataset.initialized) {
        createCustomSelect(wrapper);
        wrapper.dataset.initialized = 'true';
      }
    });
  }

  function resyncAllCustomSelects() {
    document.querySelectorAll('.custom-select[data-target]').forEach(function(wrapper) {
      var targetId = wrapper.dataset.target;
      var nativeSelect = document.getElementById(targetId);
      var valueEl = wrapper.querySelector('.custom-select-value');
      var dropdown = wrapper.querySelector('.custom-select-dropdown');
      if (!nativeSelect || !dropdown) return;
      var currentCount = dropdown.querySelectorAll('.custom-select-option').length;
      var nativeCount = nativeSelect.querySelectorAll('option').length;
      if (currentCount !== nativeCount) {
        dropdown.innerHTML = '';
        nativeSelect.querySelectorAll('option').forEach(function(opt) {
          var optionEl = document.createElement('div');
          optionEl.className = 'custom-select-option';
          optionEl.dataset.value = opt.value;
          optionEl.innerHTML = checkIconSVG + '<span class="custom-select-option-text">' + opt.textContent + '</span>';
          if (opt.selected) { optionEl.classList.add('selected'); valueEl.textContent = opt.textContent; }
          optionEl.addEventListener('click', function(e) {
            e.stopPropagation();
            nativeSelect.value = opt.value;
            valueEl.textContent = opt.textContent;
            dropdown.querySelectorAll('.custom-select-option').forEach(function(o) {
              o.classList.toggle('selected', o.dataset.value === opt.value);
            });
            wrapper.classList.remove('open');
            var event = new Event('change', { bubbles: true });
            nativeSelect.dispatchEvent(event);
          });
          dropdown.appendChild(optionEl);
        });
      }
      var selectedOpt = nativeSelect.options[nativeSelect.selectedIndex];
      if (selectedOpt && valueEl) {
        valueEl.textContent = selectedOpt.textContent;
        dropdown.querySelectorAll('.custom-select-option').forEach(function(opt) {
          opt.classList.toggle('selected', opt.dataset.value === selectedOpt.value);
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllCustomSelects);
  } else {
    initAllCustomSelects();
  }
  setInterval(resyncAllCustomSelects, 500);

  // --- jQuery ready ---
  $(function(){
    initAllCustomSelects();
    $(document).ajaxComplete(function(){ setTimeout(resyncAllCustomSelects, 100); });

    $(window).on('resize', function(){
      var mainArea = $('.main-area');
      if (mainArea.length) {
        var available = mainArea.height();
        var tabNav = mainArea.find(".ui-tabs-nav").outerHeight(true) || 44;
        var status  = $(".status-bar").outerHeight(true) || 0;
        var mapH = available - tabNav - status;
        if (mapH < 300) mapH = 300;
        $("#mapid").height(mapH);
      }
    });

    var intervalSelect = document.getElementById('refresh_interval');
    if (intervalSelect) {
      intervalSelect.addEventListener('change', function(){ window.refresh_period = parseInt(this.value, 10) * 1000; });
      window.refresh_period = parseInt(intervalSelect.value, 10) * 1000 || 60000;
    }

    var autorefreshCheckbox = document.getElementById('autorefresh_checkbox');
    var progressBar = document.getElementById('refresh_progress_bar');
    var progressContainer = document.getElementById('refresh_progress');
    window.customRefreshInterval = null;

    function resetProgressBar() {
      if (progressBar) {
        progressBar.style.transition = 'none'; progressBar.style.width = '0%'; progressBar.offsetHeight;
        progressBar.style.transition = 'width linear'; progressBar.style.transitionDuration = (window.refresh_period || 60000) + 'ms';
        progressBar.style.width = '100%';
      }
    }
    function startAutoRefresh() {
      if (progressContainer) progressContainer.style.display = 'block';
      resetProgressBar();
      if (typeof $ !== 'undefined' && $('#datepicker').length) { $('#datepicker').datepicker('setDate', new Date()); }
      if (typeof get_connections === 'function') { get_connections(); }
      window.customRefreshInterval = setInterval(function(){
        if (typeof get_connections === 'function') { get_connections(); }
        resetProgressBar();
      }, window.refresh_period || 60000);
    }
    function stopAutoRefresh() {
      if (progressContainer) progressContainer.style.display = 'none';
      if (window.customRefreshInterval) { clearInterval(window.customRefreshInterval); window.customRefreshInterval = null; }
      if (progressBar) { progressBar.style.transition = 'none'; progressBar.style.width = '0%'; }
    }
    if (autorefreshCheckbox) {
      autorefreshCheckbox.addEventListener('click', function(){
        if (this.checked) { startAutoRefresh(); } else { stopAutoRefresh(); }
      });
    }

    // --- Status-bar "Updated" timestamp + stale-data banner (#8, #10) ---
    // _lastRefreshAt ticks on every successful taint_links (set via
    // window._microdep_mark_refreshed, called from microdep-map.js). The
    // "Updated Xs ago" label re-renders each second. We deliberately omit a
    // "next refresh" label — the auto-refresh progress bar already shows it.
    window._lastRefreshAt = null;
    var lastRefreshLabel = document.getElementById('last_refresh_label');
    function _fmt_ago(ms) {
      if (ms < 0) return 'just now';
      var s = Math.floor(ms / 1000);
      if (s < 5)  return 'just now';
      if (s < 60) return s + 's ago';
      var m = Math.floor(s / 60);
      if (m < 60) return m + 'm ago';
      var h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    }
    function _tick_status_labels() {
      if (lastRefreshLabel) {
        lastRefreshLabel.textContent = window._lastRefreshAt
          ? _fmt_ago(Date.now() - window._lastRefreshAt) : 'never';
      }
    }
    setInterval(_tick_status_labels, 1000);

    // Stale-data banner: shown when the displayed data is older than the
    // threshold (5 min when auto-refresh is off, 2x the interval when on).
    // Click / "Refresh now" → re-fetch; × → dismiss until the next stale event.
    var staleBanner  = document.getElementById('stale_data_banner');
    var staleText    = staleBanner && staleBanner.querySelector('.stale-data-text');
    var staleRefresh = staleBanner && staleBanner.querySelector('.stale-data-refresh');
    var staleClose   = staleBanner && staleBanner.querySelector('.stale-data-close');
    var _staleDismissed = false;
    function _stale_threshold_ms() {
      var auto = !!(autorefreshCheckbox && autorefreshCheckbox.checked);
      var period = window.refresh_period || 60000;
      return auto ? Math.max(2 * period, 60000) : 5 * 60 * 1000;
    }
    // The "data is stale / refresh now" nudge only makes sense for live data.
    // When the viewed window ends in the past (a historic date) the data is
    // meant to be old, so suppress the banner there (issue #95). The window
    // end is published by get_connections as window._microdep_view_end.
    function _viewing_live_data() {
      var endIso = window._microdep_view_end;
      if (!endIso) return true;                    // unknown yet -> don't suppress
      var endMs = Date.parse(endIso);
      if (isNaN(endMs)) return true;
      return endMs >= Date.now() - 5 * 60 * 1000;  // window reaches ~now -> live
    }
    function _check_stale_banner() {
      if (!staleBanner) return;
      if (!_viewing_live_data()) { staleBanner.hidden = true; return; }
      if (!window._lastRefreshAt || _staleDismissed) { staleBanner.hidden = true; return; }
      var ageMs = Date.now() - window._lastRefreshAt;
      if (ageMs < _stale_threshold_ms()) { staleBanner.hidden = true; return; }
      var ageMin = Math.floor(ageMs / 60000);
      var ageStr = ageMin >= 60 ? Math.floor(ageMin / 60) + 'h ' + (ageMin % 60) + 'm' : ageMin + 'm';
      if (staleText) staleText.textContent = 'Data is ' + ageStr + ' old';
      staleBanner.hidden = false;
    }
    window._microdep_mark_refreshed = function () {
      window._lastRefreshAt = Date.now();
      _tick_status_labels();
      _check_stale_banner();
    };
    function _do_refresh_now() {
      _staleDismissed = false;
      if (typeof get_connections === 'function') get_connections();
      if (staleBanner) staleBanner.hidden = true;
    }
    if (staleRefresh) staleRefresh.addEventListener('click', function (e) { e.stopPropagation(); _do_refresh_now(); });
    if (staleClose)   staleClose.addEventListener('click',   function (e) { e.stopPropagation(); _staleDismissed = true; staleBanner.hidden = true; });
    if (staleBanner)  staleBanner.addEventListener('click', _do_refresh_now);
    setInterval(_check_stale_banner, 30000);

    function replaceNaN() {
      $('#legend button').each(function(){
        var text = $(this).text();
        if (text.indexOf('NaN') !== -1) { $(this).text(text.replace(/NaN/g, '-')); }
      });
    }
    $(document).ajaxComplete(function(){ setTimeout(replaceNaN, 100); });
    // Footer error indicator: half a dozen places write into #error, so key
    // the colour off what it ends up saying rather than off each writer. Red
    // only when there is something to report; "none" sits there most of the
    // time and should not read as a fault.
    (function () {
      var errEl = document.getElementById('error');
      if (!errEl) return;
      var refreshErrState = function () {
        var txt = (errEl.textContent || '').trim().toLowerCase();
        errEl.classList.toggle('is-quiet', txt === '' || txt === 'none');
      };
      refreshErrState();
      new MutationObserver(refreshErrState)
        .observe(errEl, { childList: true, characterData: true, subtree: true });
    })();

    var legendEl = document.getElementById('legend');
    if (legendEl) {
      var legendObserver = new MutationObserver(function(){ setTimeout(replaceNaN, 50); });
      legendObserver.observe(legendEl, { childList: true, subtree: true, characterData: true });
    }

    $('#today').on('click', function(){
      $('#datepicker').datepicker('setDate', new Date());
      $('#datepicker').trigger('change');
    });

    function updatePercentileVisibility() {
      var eventType = document.getElementById('event_type');
      var group = document.getElementById('percentile-group');
      var statsType = document.getElementById('stats_type');
      if (eventType && group) {
        var isJitter = eventType.value === 'jitter';
        group.style.display = isJitter ? '' : 'none';
        if (isJitter && statsType) { $(statsType).show(); }
      }
    }
    $('#event_type').on('change', function(){ setTimeout(updatePercentileVisibility, 100); });
    setInterval(updatePercentileVisibility, 1000);
    $(document).ajaxComplete(function(){ setTimeout(updatePercentileVisibility, 100); });
    setTimeout(updatePercentileVisibility, 500);

    // --- Hide map-container and legend when switching to non-map tabs ---
    $('main#tabs').on('tabsactivate', function(event, ui) {
      var mapContainer = document.querySelector('.map-container');
      var legend = document.getElementById('legend');
      var isMap = ui.newPanel.attr('id') === 'mapid';
      if (mapContainer) {
        mapContainer.style.display = isMap ? '' : 'none';
      }
      if (legend) {
        legend.style.display = isMap ? '' : 'none';
      }
      // Leaflet internally caches the container size at init and can render
      // an empty/grey grid if the container was hidden when last sized.
      // Whenever we make the map visible again, ask Leaflet to recompute.
      if (isMap && window.mymap && typeof window.mymap.invalidateSize === 'function') {
        setTimeout(function () { window.mymap.invalidateSize(); }, 60);
      }
    });
  });
})();
