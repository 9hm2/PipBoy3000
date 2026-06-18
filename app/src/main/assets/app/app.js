/* PipBoy 3000 launcher front-end.
 * Renders the shipped design system (window.PipBoy.*) via React.createElement.
 * Talks to Android through window.AndroidBridge (all methods synchronous).
 */
(function () {
  "use strict";

  var React = window.React;
  var ReactDOM = window.ReactDOM;
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;
  var useCallback = React.useCallback;
  var useRef = React.useRef;

  var P = window.PipBoy;
  var Screen = P.Screen,
    Heading = P.Heading,
    StatusBar = P.StatusBar,
    Tabs = P.Tabs,
    ProgressBar = P.ProgressBar,
    Panel = P.Panel,
    Text = P.Text,
    Input = P.Input,
    Menu = P.Menu,
    Button = P.Button,
    Toggle = P.Toggle,
    Modal = P.Modal;

  /* ---------------------------------------------------------------- bridge */
  // Every call is guarded so the page also works in a plain browser (no bridge).
  function hasBridge() {
    return typeof window.AndroidBridge !== "undefined" && window.AndroidBridge;
  }
  function bridge() {
    return window.AndroidBridge;
  }

  // Parse a JSON-string bridge result; never throw.
  function parseJson(str, fallback) {
    try {
      if (str == null) return fallback;
      var v = JSON.parse(str);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  // Generic guarded getter returning parsed JSON.
  function callJson(method, args, fallback) {
    try {
      if (!hasBridge()) return fallback;
      var fn = bridge()[method];
      if (typeof fn !== "function") return fallback;
      return parseJson(fn.apply(bridge(), args || []), fallback);
    } catch (e) {
      return fallback;
    }
  }
  // Generic guarded action returning a boolean.
  function callBool(method, args) {
    try {
      if (!hasBridge()) return false;
      var fn = bridge()[method];
      if (typeof fn !== "function") return false;
      return !!fn.apply(bridge(), args || []);
    } catch (e) {
      return false;
    }
  }

  function getApps() {
    return callJson("getApps", [], []);
  }
  function getCallLog(limit) {
    return callJson("getCallLog", [limit], []);
  }
  function getContacts() {
    return callJson("getContacts", [], []);
  }
  function getDeviceStats() {
    return callJson("getDeviceStats", [], null);
  }
  function getPermissions() {
    return callJson("getPermissions", [], { callLog: false, contacts: false, phone: false });
  }
  function getUsageStats(limit) {
    return callJson("getUsageStats", [limit], []);
  }
  function getNetworkInfo() {
    return callJson("getNetworkInfo", [], null);
  }
  function getAudioInfo() {
    return callJson("getAudioInfo", [], null);
  }
  function getDisplayInfo() {
    return callJson("getDisplayInfo", [], null);
  }
  function getNotifications() {
    return callJson("getNotifications", [], []);
  }
  function getAccessState() {
    return callJson("getAccessState", [], {
      defaultLauncher: false,
      usageAccess: false,
      notificationAccess: false,
    });
  }
  function launchApp(pkg) {
    callBool("launchApp", [pkg]);
  }
  function openAppInfo(pkg) {
    callBool("openAppInfo", [pkg]);
  }
  function uninstallApp(pkg) {
    callBool("uninstallApp", [pkg]);
  }
  function launchAppShortcut(which) {
    callBool("launchAppShortcut", [which]);
  }
  function dial(num) {
    callBool("dial", [num]);
  }
  function requestPermissions() {
    callBool("requestPermissions", []);
  }
  function openSettings(which) {
    callBool("openSettings", [which]);
  }
  function openSettingsPanel(which) {
    callBool("openSettingsPanel", [which]);
  }
  function openUsageAccessSettings() {
    callBool("openUsageAccessSettings", []);
  }
  function openNotificationAccessSettings() {
    callBool("openNotificationAccessSettings", []);
  }
  function dismissNotification(key) {
    callBool("dismissNotification", [key]);
  }
  function openNotification(key) {
    callBool("openNotification", [key]);
  }
  function requestDefaultLauncher() {
    callBool("requestDefaultLauncher", []);
  }
  function webSearch(q) {
    callBool("webSearch", [q]);
  }
  function setFlashlight(on) {
    return callBool("setFlashlight", [on]);
  }
  function vibrate(ms) {
    callBool("vibrate", [ms]);
  }

  /* ------------------------------------------------------------- storage */
  function lsGet(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw == null) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function lsSet(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }
  function lsGetRaw(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw == null ? fallback : raw;
    } catch (e) {
      return fallback;
    }
  }
  function lsSetRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
  }

  var FAV_KEY = "pipboy.favorites";
  var HIDDEN_KEY = "pipboy.hidden";
  var TAB_KEY = "pipboy.lastTab";

  /* --------------------------------------------------------------- helpers */
  function formatBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return "--";
    var units = ["B", "KB", "MB", "GB", "TB"];
    var n = Number(bytes);
    var i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return (n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)) + " " + units[i];
  }

  function relativeTime(epochMs) {
    if (!epochMs) return "";
    var diff = Date.now() - Number(epochMs);
    if (diff < 0) diff = 0;
    var s = Math.floor(diff / 1000);
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m";
    var hr = Math.floor(m / 60);
    if (hr < 24) return hr + "h";
    var d = Math.floor(hr / 24);
    if (d < 7) return d + "d";
    var w = Math.floor(d / 7);
    if (w < 5) return w + "w";
    var mo = Math.floor(d / 30);
    if (mo < 12) return mo + "mo";
    return Math.floor(d / 365) + "y";
  }

  function formatUptime(ms) {
    if (!ms) return "--";
    var s = Math.floor(Number(ms) / 1000);
    var d = Math.floor(s / 86400);
    s -= d * 86400;
    var hr = Math.floor(s / 3600);
    s -= hr * 3600;
    var m = Math.floor(s / 60);
    var out = [];
    if (d) out.push(d + "d");
    if (hr || d) out.push(hr + "h");
    out.push(m + "m");
    return out.join(" ");
  }

  function isMostlyDigits(q) {
    var t = (q || "").trim();
    if (!t) return false;
    var digits = t.replace(/[^0-9]/g, "");
    var nonDigitsAllowed = t.replace(/[0-9\s\-\+\(\)\*#]/g, "");
    return digits.length >= 3 && nonDigitsAllowed.length === 0;
  }

  // Text marker + StatusBar/Text tone for a call-log type.
  function byType(type) {
    switch (type) {
      case "INCOMING":
        return { marker: "▼", tone: "default" };
      case "OUTGOING":
        return { marker: "▲", tone: "default" };
      case "MISSED":
        return { marker: "✕", tone: "danger" };
      case "REJECTED":
        return { marker: "✕", tone: "danger" };
      case "BLOCKED":
        return { marker: "⊘", tone: "danger" };
      case "VOICEMAIL":
        return { marker: "☎", tone: "warning" };
      default:
        return { marker: "·", tone: "default" };
    }
  }

  // battery % -> ProgressBar / StatusBar tone
  function batteryTone(pct) {
    if (pct == null) return "default";
    if (pct < 15) return "danger";
    if (pct < 30) return "warning";
    return "default";
  }
  function batteryProgressVariant(pct) {
    var t = batteryTone(pct);
    return t === "default" ? "primary" : t;
  }

  function signalBars(level) {
    // level 0..4, -1 unknown
    if (level == null || level < 0) return "----";
    var full = "█";
    var empty = "░";
    var n = Math.max(0, Math.min(4, level));
    return full.repeat(n) + empty.repeat(4 - n);
  }

  /* -------------------------------------------------------- long-press hook */
  function useLongPress(onLongPress, ms) {
    var timer = useRef(null);
    var fired = useRef(false);
    ms = ms || 500;
    var clear = function () {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
    var start = function (id) {
      fired.current = false;
      clear();
      timer.current = setTimeout(function () {
        fired.current = true;
        vibrate(15);
        onLongPress(id);
      }, ms);
    };
    return {
      didFire: function () {
        return fired.current;
      },
      onStart: start,
      onEnd: clear,
      onCancel: clear,
    };
  }

  // Resolve which menu item (by id) a pointer event targets, via DOM index.
  function pkgFromMenuEvent(e, items) {
    var btn = e.target && e.target.closest ? e.target.closest(".pip-menu__item") : null;
    if (!btn) return null;
    var ul = btn.closest(".pip-menu");
    if (!ul) return null;
    var buttons = ul.querySelectorAll(".pip-menu__item");
    var idx = Array.prototype.indexOf.call(buttons, btn);
    if (idx < 0 || idx >= items.length) return null;
    return items[idx].id;
  }

  function kvRow(k, v) {
    return h(
      "div",
      { className: "kv", key: k },
      h(Text, { as: "span", variant: "dim", size: "sm" }, k),
      h(Text, { as: "span", variant: "bright", size: "sm" }, v)
    );
  }

  // A StatusBar-driven status item row helper (single StatusBar with items).
  function statusItem(label, value, tone) {
    return { label: label, value: value, tone: tone || "default" };
  }

  /* ====================================================== shared app helpers */
  function appLabelOf(app) {
    return (app.label || app.packageName || "").toUpperCase();
  }
  function findApp(apps, pkg) {
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].packageName === pkg) return apps[i];
    }
    return null;
  }

  // A grid of launchable buttons. entries: [{id,label,onClick}]
  function buttonGrid(entries) {
    return h(
      "div",
      { className: "grid-3" },
      entries.map(function (e) {
        return h(
          Button,
          {
            key: e.id,
            variant: e.variant || "ghost",
            block: true,
            glow: false,
            onClick: e.onClick,
          },
          e.label
        );
      })
    );
  }

  /* ============================================================ HOME screen */
  function HomeScreen(props) {
    var stats = props.stats;
    var apps = props.apps;
    var favorites = props.favorites;
    var usage = props.usage;
    var notifs = props.notifs;
    var access = props.access;
    var perms = props.perms;
    var goTo = props.goTo; // (tab, subtab)
    var onLaunch = props.onLaunch;

    var queryState = useState("");
    var query = queryState[0];
    var setQuery = queryState[1];

    var battery = stats ? stats.batteryPct : null;

    // ---- search results: filter apps + smart actions ----
    var q = (query || "").trim();
    var ql = q.toLowerCase();
    var appMatches = useMemo(
      function () {
        if (!ql) return [];
        return apps
          .filter(function (a) {
            return (a.label || "").toLowerCase().indexOf(ql) !== -1;
          })
          .slice(0, 8);
      },
      [apps, ql]
    );

    var searchItems = [];
    if (q) {
      if (isMostlyDigits(q)) {
        searchItems.push({ id: "__dial", label: "DIAL " + q });
      }
      searchItems.push({ id: "__web", label: "WEB SEARCH “" + q + "”" });
      appMatches.forEach(function (a) {
        searchItems.push({ id: a.packageName, label: appLabelOf(a) });
      });
    }
    var onSearchSelect = function (id) {
      if (id === "__dial") {
        dial(q);
      } else if (id === "__web") {
        webSearch(q);
      } else {
        onLaunch(id);
      }
    };

    // ---- favorites dock ----
    var favApps = useMemo(
      function () {
        var out = [];
        for (var i = 0; i < favorites.length; i++) {
          var a = findApp(apps, favorites[i]);
          if (a) out.push(a);
        }
        return out;
      },
      [favorites, apps]
    );

    // ---- frequent (usage) ----
    var freqApps = useMemo(
      function () {
        var out = [];
        for (var i = 0; i < usage.length && out.length < 6; i++) {
          var u = usage[i];
          var label = u.label;
          if (!label) {
            var a = findApp(apps, u.packageName);
            label = a ? a.label : u.packageName;
          }
          out.push({ packageName: u.packageName, label: label });
        }
        return out;
      },
      [usage, apps]
    );

    // quick launch row
    var quick = [
      { id: "phone", label: "PHONE", which: "phone" },
      { id: "camera", label: "CAMERA", which: "camera" },
      { id: "messages", label: "MSGS", which: "messages" },
      { id: "browser", label: "WEB", which: "browser" },
      { id: "clock", label: "CLOCK", which: "clock" },
      { id: "calculator", label: "CALC", which: "calculator" },
    ];

    var notifCount = notifs ? notifs.length : 0;
    var latest = notifs ? notifs.slice(0, 3) : [];

    return h(
      "div",
      { className: "stack" },
      // big clock + date
      h(
        "div",
        { className: "home-clock" },
        h(Heading, { level: 1 }, stats && stats.time ? stats.time : "--:--"),
        h(Text, { variant: "dim", size: "base" }, stats && stats.date ? stats.date : "----")
      ),
      // battery HP
      h(ProgressBar, {
        label: "HP " + (stats && stats.charging ? "(CHARGING)" : ""),
        value: battery == null ? 0 : battery,
        max: 100,
        showValue: true,
        variant: batteryProgressVariant(battery),
      }),
      // universal search
      h(Input, {
        label: "SEARCH",
        placeholder: "apps, dial, web…",
        value: query,
        onChange: function (e) {
          setQuery(e.target.value);
        },
      }),
      q
        ? searchItems.length
          ? h(Menu, { items: searchItems, onSelect: onSearchSelect })
          : h(Text, { variant: "dim", size: "sm" }, "NO MATCHES.")
        : null,
      // favorites
      h(
        Panel,
        { title: "FAVORITES" },
        favApps.length === 0
          ? h(Text, { variant: "dim", size: "sm" }, "NO PINNED APPS — long-press an app in INV to pin.")
          : h(Menu, {
              items: favApps.map(function (a) {
                return { id: a.packageName, label: appLabelOf(a) };
              }),
              onSelect: onLaunch,
            })
      ),
      // frequent
      h(
        Panel,
        { title: "FREQUENT", variant: "inset" },
        access && access.usageAccess
          ? freqApps.length
            ? h(Menu, {
                items: freqApps.map(function (a) {
                  return { id: a.packageName, label: (a.label || a.packageName).toUpperCase() };
                }),
                onSelect: onLaunch,
              })
            : h(Text, { variant: "dim", size: "sm" }, "NO USAGE DATA YET.")
          : h(
              "div",
              { className: "stack" },
              h(Text, { variant: "dim", size: "sm" }, "USAGE ACCESS REQUIRED for frequent apps."),
              h(
                Button,
                { variant: "warning", block: true, onClick: openUsageAccessSettings },
                "ENABLE USAGE ACCESS"
              )
            )
      ),
      // quick launch
      h(
        Panel,
        { title: "QUICK LAUNCH" },
        buttonGrid(
          quick.map(function (qq) {
            return {
              id: qq.id,
              label: qq.label,
              onClick: function () {
                launchAppShortcut(qq.which);
              },
            };
          })
        )
      ),
      // notifications preview
      h(
        Panel,
        { title: "NOTIFICATIONS" + (notifCount ? " (" + notifCount + ")" : ""), variant: "inset" },
        access && access.notificationAccess
          ? notifCount === 0
            ? h(Text, { variant: "dim", size: "sm" }, "NO ACTIVE NOTIFICATIONS.")
            : h(
                "div",
                { className: "stack" },
                latest.map(function (n, i) {
                  return h(
                    "div",
                    { className: "notif-mini", key: n.key || i },
                    h(
                      Text,
                      { as: "div", variant: "bright", size: "sm" },
                      (n.appLabel || n.packageName || "") + (n.title ? " · " + n.title : "")
                    ),
                    n.text
                      ? h(Text, { as: "div", variant: "dim", size: "xs" }, n.text)
                      : null
                  );
                }),
                h(
                  Button,
                  {
                    variant: "ghost",
                    block: true,
                    glow: false,
                    onClick: function () {
                      goTo("data", "notifs");
                    },
                  },
                  "VIEW ALL"
                )
              )
          : h(
              "div",
              { className: "stack" },
              h(Text, { variant: "dim", size: "sm" }, "NOTIFICATION ACCESS REQUIRED."),
              h(
                Button,
                { variant: "warning", block: true, onClick: openNotificationAccessSettings },
                "ENABLE"
              )
            )
      )
    );
  }

  /* ============================================================ STAT screen */
  function StatScreen(props) {
    var stats = props.stats;
    var net = props.net;
    var audio = props.audio;
    var display = props.display;

    if (!stats) {
      return h(
        Panel,
        { title: "SYSTEM", variant: "inset" },
        h(Text, { variant: "dim" }, "NO DEVICE TELEMETRY — bridge unavailable.")
      );
    }
    var battery = stats.batteryPct;
    var storUsed = Number(stats.storageUsedBytes) || 0;
    var storTotal = Number(stats.storageTotalBytes) || 0;
    var ramUsed = Number(stats.ramUsedBytes) || 0;
    var ramTotal = Number(stats.ramTotalBytes) || 0;

    var vitalsExtra = [];
    if (stats.batteryTemp != null)
      vitalsExtra.push("TEMP " + Math.round(Number(stats.batteryTemp)) + "°C");
    if (stats.batteryHealth) vitalsExtra.push("HEALTH " + stats.batteryHealth);
    if (stats.batteryVoltage != null)
      vitalsExtra.push((Number(stats.batteryVoltage) / 1000).toFixed(2) + "V");

    // network items
    var netPanel = null;
    if (net) {
      var netItems = [
        statusItem(
          "WIFI",
          net.wifiEnabled ? "ON " + signalBars(net.wifiSignalLevel) : "OFF",
          net.wifiEnabled ? "default" : "warning"
        ),
        statusItem(
          "MOBILE",
          net.mobileNetworkType || "--",
          net.mobileNetworkType ? "default" : "warning"
        ),
        statusItem("DATA", net.dataConnected ? "LINKED" : "DOWN", net.dataConnected ? "default" : "danger"),
        statusItem("AIRPLANE", net.airplaneMode ? "ON" : "OFF", net.airplaneMode ? "warning" : "default"),
        statusItem("BLUETOOTH", net.bluetoothEnabled ? "ON" : "OFF", net.bluetoothEnabled ? "default" : "default"),
      ];
      netPanel = h(Panel, { title: "NETWORK", variant: "inset" }, h(StatusBar, { items: netItems }));
    }

    // audio panel
    var audioPanel = null;
    if (audio) {
      var volBars = [];
      function vol(label, obj) {
        if (!obj) return;
        volBars.push(
          h(ProgressBar, {
            key: label,
            label: label + " " + obj.cur + "/" + obj.max,
            value: Number(obj.cur) || 0,
            max: Number(obj.max) > 0 ? Number(obj.max) : 100,
            variant: "primary",
          })
        );
        volBars.push(h("div", { key: label + "-sp", style: { height: 8 } }));
      }
      vol("MEDIA", audio.media);
      vol("RING", audio.ring);
      vol("ALARM", audio.alarm);
      audioPanel = h(
        Panel,
        { title: "AUDIO", variant: "inset" },
        kvRow("RINGER", audio.ringerMode || "--"),
        h("div", { style: { height: 8 } }),
        volBars
      );
    }

    // display panel
    var displayPanel = null;
    if (display) {
      displayPanel = h(
        Panel,
        { title: "DISPLAY", variant: "inset" },
        h(ProgressBar, {
          label: "BRIGHTNESS",
          value: Number(display.brightness) || 0,
          max: 100,
          showValue: true,
          variant: "primary",
        }),
        h("div", { style: { height: 8 } }),
        kvRow("AUTO", display.autoBrightness ? "ON" : "OFF")
      );
    }

    return h(
      "div",
      { className: "stack" },
      h(
        Panel,
        { title: "VITALS" },
        h(ProgressBar, {
          label: "HP " + (stats.charging ? "(CHARGING)" : ""),
          value: battery == null ? 0 : battery,
          max: 100,
          showValue: true,
          variant: batteryProgressVariant(battery),
        }),
        vitalsExtra.length
          ? h(Text, { as: "div", variant: "dim", size: "xs", style: { marginTop: 4 } }, vitalsExtra.join("  ·  "))
          : null,
        h("div", { style: { height: 10 } }),
        h(ProgressBar, {
          label: "STORAGE — " + formatBytes(storUsed) + " / " + formatBytes(storTotal),
          value: storUsed,
          max: storTotal > 0 ? storTotal : 100,
          variant: "primary",
        }),
        h("div", { style: { height: 10 } }),
        h(ProgressBar, {
          label: "MEMORY — " + formatBytes(ramUsed) + " / " + formatBytes(ramTotal),
          value: ramUsed,
          max: ramTotal > 0 ? ramTotal : 100,
          variant: "primary",
        })
      ),
      netPanel,
      audioPanel,
      displayPanel,
      h(
        Panel,
        { title: "SYSTEM", variant: "inset" },
        kvRow("MODEL", (stats.manufacturer || "") + " " + (stats.model || "")),
        kvRow("ANDROID", stats.androidVersion + " (SDK " + stats.sdkInt + ")"),
        stats.securityPatch ? kvRow("SEC PATCH", stats.securityPatch) : null,
        kvRow("UPTIME", formatUptime(stats.uptimeMillis)),
        kvRow("TIME", (stats.time || "") + "  " + (stats.date || ""))
      )
    );
  }

  /* ============================================================= INV screen */
  function InvScreen(props) {
    var apps = props.apps;
    var query = props.query;
    var setQuery = props.setQuery;
    var favorites = props.favorites;
    var hidden = props.hidden;
    var usage = props.usage;
    var access = props.access;

    var showHiddenState = useState(false);
    var showHidden = showHiddenState[0];
    var setShowHidden = showHiddenState[1];

    var favSet = useMemo(
      function () {
        var s = {};
        favorites.forEach(function (p) {
          s[p] = true;
        });
        return s;
      },
      [favorites]
    );
    var hiddenSet = useMemo(
      function () {
        var s = {};
        hidden.forEach(function (p) {
          s[p] = true;
        });
        return s;
      },
      [hidden]
    );

    var q = (query || "").trim().toLowerCase();

    // ALL apps: sorted, optionally excluding hidden, filtered by query.
    var allList = useMemo(
      function () {
        var list = apps.slice().sort(function (a, b) {
          return (a.label || "").toLowerCase().localeCompare((b.label || "").toLowerCase());
        });
        list = list.filter(function (a) {
          if (!showHidden && hiddenSet[a.packageName]) return false;
          if (q && (a.label || "").toLowerCase().indexOf(q) === -1) return false;
          return true;
        });
        return list;
      },
      [apps, q, showHidden, hiddenSet]
    );

    var favList = useMemo(
      function () {
        var out = [];
        favorites.forEach(function (p) {
          var a = findApp(apps, p);
          if (a) out.push(a);
        });
        return out;
      },
      [favorites, apps]
    );

    var freqList = useMemo(
      function () {
        var out = [];
        for (var i = 0; i < usage.length && out.length < 8; i++) {
          var a = findApp(apps, usage[i].packageName);
          if (a) out.push(a);
        }
        return out;
      },
      [usage, apps]
    );

    var lp = useLongPress(function (pkg) {
      props.onLongPress(pkg);
    });

    function section(title, list, variant) {
      if (!list.length) return null;
      var items = list.map(function (a) {
        var marks = "";
        if (favSet[a.packageName]) marks += " ★";
        if (hiddenSet[a.packageName]) marks += " ⊘";
        return { id: a.packageName, label: appLabelOf(a) + marks };
      });
      var pressHandlers = {
        onPointerDown: function (e) {
          var pkg = pkgFromMenuEvent(e, items);
          if (pkg) lp.onStart(pkg);
        },
        onPointerUp: lp.onEnd,
        onPointerLeave: lp.onCancel,
        onPointerCancel: lp.onCancel,
      };
      var onSelect = function (id) {
        if (lp.didFire()) return;
        launchApp(id);
      };
      return h(
        Panel,
        { title: title, variant: variant || "default" },
        h("div", pressHandlers, h(Menu, { items: items, onSelect: onSelect }))
      );
    }

    return h(
      "div",
      { className: "stack" },
      h(Input, {
        label: "SEARCH (" + allList.length + " / " + apps.length + " APPS)",
        placeholder: "filter inventory…",
        value: query,
        onChange: function (e) {
          setQuery(e.target.value);
        },
      }),
      h(Toggle, {
        checked: showHidden,
        label: "SHOW HIDDEN",
        onChange: function (next) {
          setShowHidden(next);
        },
      }),
      apps.length === 0
        ? h(
            Panel,
            { variant: "inset" },
            h(Text, { variant: "dim" }, "INVENTORY EMPTY — no apps reported by host.")
          )
        : h(
            "div",
            { className: "stack list-scroll" },
            q ? null : section("FAVORITES", favList),
            q || !(access && access.usageAccess) ? null : section("FREQUENT", freqList, "inset"),
            allList.length === 0
              ? h(Text, { variant: "dim" }, "NO MATCHES.")
              : section(q ? "RESULTS" : "ALL APPS", allList, "inset")
          ),
      h(Text, { variant: "dim", size: "xs" }, "Tap to launch · long-press for actions.")
    );
  }

  /* ============================================================ DATA screen */
  function DataScreen(props) {
    var perms = props.perms;
    var callLog = props.callLog;
    var contacts = props.contacts;
    var notifs = props.notifs;
    var notifAccess = props.notifAccess;
    var sub = props.dataTab;
    var setSub = props.setDataTab;
    var onDismiss = props.onDismiss;

    var subTabs = [
      { id: "calls", label: "CALL LOG" },
      { id: "contacts", label: "CONTACTS" },
      { id: "notifs", label: "NOTIFS" },
    ];

    var content;
    if (sub === "calls") {
      content = perms.callLog
        ? h(CallLog, { entries: callLog })
        : permGate("CALL LOG ACCESS REQUIRED", "Grant call-log permission to read recent calls.");
    } else if (sub === "contacts") {
      content = perms.contacts
        ? h(Contacts, { contacts: contacts })
        : permGate("CONTACTS ACCESS REQUIRED", "Grant contacts permission to read your address book.");
    } else {
      content = h(Notifs, { notifs: notifs, access: notifAccess, onDismiss: onDismiss });
    }

    return h(
      "div",
      { className: "stack" },
      h(Tabs, { tabs: subTabs, value: sub, onChange: setSub }),
      content
    );
  }

  function permGate(title, msg) {
    return h(
      Panel,
      { title: title, variant: "inset" },
      h("div", { className: "stack" }, h(Text, { variant: "dim" }, msg)),
      h("div", { style: { height: 12 } }),
      h(Button, { variant: "warning", block: true, onClick: requestPermissions }, "GRANT ACCESS")
    );
  }

  function Notifs(props) {
    var notifs = props.notifs || [];
    var access = props.access;
    var onDismiss = props.onDismiss;

    if (!access) {
      return h(
        Panel,
        { title: "NOTIFICATION ACCESS REQUIRED", variant: "inset" },
        h(Text, { variant: "dim" }, "Grant notification access to view active notifications."),
        h("div", { style: { height: 12 } }),
        h(
          Button,
          { variant: "warning", block: true, onClick: openNotificationAccessSettings },
          "GRANT NOTIFICATION ACCESS"
        )
      );
    }
    if (notifs.length === 0) {
      return h(Panel, { variant: "inset" }, h(Text, { variant: "dim" }, "NO ACTIVE NOTIFICATIONS."));
    }
    return h(
      "div",
      { className: "list-scroll stack" },
      notifs.map(function (n, i) {
        return h(
          "div",
          { className: "notif-row", key: n.key || i },
          h(
            "button",
            {
              type: "button",
              className: "notif-row__main",
              onClick: function () {
                openNotification(n.key);
              },
            },
            h(
              Text,
              { as: "div", variant: "bright", size: "sm" },
              (n.appLabel || n.packageName || "") +
                (n.time ? "  ·  " + relativeTime(n.time) : "")
            ),
            n.title ? h(Text, { as: "div", variant: "body", size: "sm" }, n.title) : null,
            n.text ? h(Text, { as: "div", variant: "dim", size: "xs" }, n.text) : null
          ),
          n.clearable
            ? h(
                "div",
                { className: "notif-row__clear" },
                h(
                  Button,
                  {
                    variant: "danger",
                    glow: false,
                    onClick: function () {
                      onDismiss(n.key);
                    },
                  },
                  "✕"
                )
              )
            : null
        );
      })
    );
  }

  function CallLog(props) {
    var entries = props.entries || [];
    if (entries.length === 0) {
      return h(Panel, { variant: "inset" }, h(Text, { variant: "dim" }, "NO RECENT CALLS."));
    }
    return h(
      "div",
      { className: "list-scroll" },
      entries.map(function (c, i) {
        var t = byType(c.type);
        var title = c.name && c.name.length ? c.name : c.number || "UNKNOWN";
        var danger = t.tone === "danger";
        return h(
          Button,
          {
            key: i,
            variant: "ghost",
            block: true,
            glow: false,
            onClick: function () {
              dial(c.number);
            },
          },
          h(
            "span",
            { className: "row" },
            h(
              "span",
              {
                className: "row__marker",
                style: danger ? { color: "var(--pip-danger, #ff5555)" } : null,
              },
              t.marker
            ),
            h(
              "span",
              { className: "row__main" },
              h("span", { className: "ellipsis", style: { display: "block" } }, (title || "").toString().toUpperCase()),
              c.name && c.name.length
                ? h("span", { className: "ellipsis", style: { display: "block", opacity: 0.6 } }, c.number || "")
                : null
            ),
            h("span", { className: "row__meta", style: { opacity: 0.7 } }, relativeTime(c.date))
          )
        );
      })
    );
  }

  function Contacts(props) {
    var contacts = props.contacts || [];
    var queryState = useState("");
    var query = queryState[0];
    var setQuery = queryState[1];

    var filtered = useMemo(
      function () {
        var q = query.trim().toLowerCase();
        var list = contacts.slice().sort(function (a, b) {
          return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase());
        });
        if (!q) return list;
        return list.filter(function (c) {
          return (
            (c.name || "").toLowerCase().indexOf(q) !== -1 ||
            (c.number || "").toLowerCase().indexOf(q) !== -1
          );
        });
      },
      [contacts, query]
    );

    var items = filtered.map(function (c, i) {
      var label = (c.name || c.number || "UNKNOWN").toUpperCase();
      return { id: String(i), label: label };
    });

    var onSelect = function (id) {
      var c = filtered[Number(id)];
      if (c) dial(c.number);
    };

    return h(
      "div",
      { className: "stack" },
      h(Input, {
        label: "SEARCH (" + filtered.length + " / " + contacts.length + ")",
        placeholder: "filter contacts…",
        value: query,
        onChange: function (e) {
          setQuery(e.target.value);
        },
      }),
      contacts.length === 0
        ? h(Panel, { variant: "inset" }, h(Text, { variant: "dim" }, "NO CONTACTS."))
        : filtered.length === 0
        ? h(Text, { variant: "dim" }, "NO MATCHES.")
        : h("div", { className: "list-scroll" }, h(Menu, { items: items, onSelect: onSelect })),
      h(Text, { variant: "dim", size: "xs" }, "Tap a contact to dial.")
    );
  }

  /* =========================================================== RADIO screen */
  function RadioScreen(props) {
    var flashOn = props.flashOn;
    var setFlashOn = props.setFlashOn;
    var access = props.access;

    var webState = useState("");
    var webQ = webState[0];
    var setWebQ = webState[1];

    // quick settings panels
    var panels = [
      { id: "internet", label: "INTERNET" },
      { id: "wifi", label: "WIFI" },
      { id: "volume", label: "VOLUME" },
      { id: "nfc", label: "NFC" },
    ];

    var shortcuts = [
      { id: "camera", label: "CAMERA" },
      { id: "clock", label: "CLOCK" },
      { id: "calculator", label: "CALCULATOR" },
      { id: "calendar", label: "CALENDAR" },
      { id: "contacts", label: "CONTACTS" },
      { id: "email", label: "EMAIL" },
    ];

    var settingsShortcuts = [
      ["WI-FI", "wifi"],
      ["BLUETOOTH", "bluetooth"],
      ["LOCATION", "location"],
      ["DISPLAY", "display"],
      ["SOUND", "sound"],
      ["DATE & TIME", "date"],
      ["BATTERY", "battery"],
      ["STORAGE", "storage"],
      ["APPS", "apps"],
    ];

    // SYSTEM ACCESS rows
    function accessRow(label, on, enableLabel, onEnable) {
      return h(
        "div",
        { className: "access-row", key: label },
        h(
          "div",
          { className: "access-row__info" },
          h(Text, { as: "div", variant: "bright", size: "sm" }, label),
          h(
            Text,
            { as: "div", variant: on ? "body" : "dim", size: "xs" },
            on ? "GRANTED" : "NOT GRANTED"
          )
        ),
        on
          ? h(Text, { as: "span", variant: "body", size: "sm" }, "✓")
          : h(
              "div",
              { className: "access-row__btn" },
              h(Button, { variant: "warning", glow: false, onClick: onEnable }, enableLabel)
            )
      );
    }

    return h(
      "div",
      { className: "stack" },
      h(
        Panel,
        { title: "DEVICE CONTROLS" },
        h(Toggle, {
          checked: flashOn,
          label: "FLASHLIGHT",
          onChange: function (next) {
            var ok = setFlashlight(next);
            setFlashOn(ok ? next : flashOn);
            vibrate(10);
          },
        }),
        h("div", { style: { height: 10 } }),
        buttonGrid(
          panels.map(function (p) {
            return {
              id: p.id,
              label: p.label,
              variant: "primary",
              onClick: function () {
                openSettingsPanel(p.id);
              },
            };
          })
        )
      ),
      h(
        Panel,
        { title: "APP SHORTCUTS", variant: "inset" },
        buttonGrid(
          shortcuts.map(function (s) {
            return {
              id: s.id,
              label: s.label,
              onClick: function () {
                launchAppShortcut(s.id);
              },
            };
          })
        )
      ),
      h(
        Panel,
        { title: "WEB SEARCH" },
        h(Input, {
          placeholder: "search the web…",
          value: webQ,
          onChange: function (e) {
            setWebQ(e.target.value);
          },
        }),
        h("div", { style: { height: 8 } }),
        h(
          Button,
          {
            variant: "primary",
            block: true,
            onClick: function () {
              if (webQ && webQ.trim()) webSearch(webQ.trim());
            },
          },
          "GO"
        )
      ),
      h(
        Panel,
        { title: "SETTINGS SHORTCUTS", variant: "inset" },
        buttonGrid(
          settingsShortcuts.map(function (q) {
            return {
              id: q[1],
              label: q[0],
              onClick: function () {
                openSettings(q[1]);
              },
            };
          })
        ),
        h("div", { style: { height: 10 } }),
        h(
          Button,
          {
            variant: "primary",
            block: true,
            onClick: function () {
              openSettings("settings");
            },
          },
          "SYSTEM SETTINGS"
        )
      ),
      h(
        Panel,
        { title: "SYSTEM ACCESS" },
        accessRow(
          "DEFAULT LAUNCHER",
          access && access.defaultLauncher,
          "SET AS DEFAULT",
          requestDefaultLauncher
        ),
        accessRow(
          "USAGE ACCESS",
          access && access.usageAccess,
          "ENABLE",
          openUsageAccessSettings
        ),
        accessRow(
          "NOTIFICATION ACCESS",
          access && access.notificationAccess,
          "ENABLE",
          openNotificationAccessSettings
        )
      )
    );
  }

  /* ================================================================ App root */
  function App() {
    var tabState = useState(function () {
      return lsGetRaw(TAB_KEY, "home");
    });
    var tab = tabState[0];
    var setTabRaw = tabState[1];
    var setTab = useCallback(function (t) {
      setTabRaw(t);
      lsSetRaw(TAB_KEY, t);
    }, []);

    var dataTabState = useState("calls");

    var statsState = useState(null);
    var appsState = useState([]);
    var callLogState = useState([]);
    var contactsState = useState([]);
    var permsState = useState({ callLog: false, contacts: false, phone: false });
    var queryState = useState(""); // INV drawer search
    var flashState = useState(false);
    var actionPkgState = useState(null);

    var usageState = useState([]);
    var notifsState = useState([]);
    var accessState = useState({ defaultLauncher: false, usageAccess: false, notificationAccess: false });
    var netState = useState(null);
    var audioState = useState(null);
    var displayState = useState(null);

    var favState = useState(function () {
      return lsGet(FAV_KEY, []);
    });
    var hiddenState = useState(function () {
      return lsGet(HIDDEN_KEY, []);
    });

    var stats = statsState[0], setStats = statsState[1];
    var apps = appsState[0], setApps = appsState[1];
    var callLog = callLogState[0], setCallLog = callLogState[1];
    var contacts = contactsState[0], setContacts = contactsState[1];
    var perms = permsState[0], setPerms = permsState[1];
    var actionPkg = actionPkgState[0], setActionPkg = actionPkgState[1];
    var usage = usageState[0], setUsage = usageState[1];
    var notifs = notifsState[0], setNotifs = notifsState[1];
    var access = accessState[0], setAccess = accessState[1];
    var net = netState[0], setNet = netState[1];
    var audio = audioState[0], setAudio = audioState[1];
    var display = displayState[0], setDisplay = displayState[1];
    var favorites = favState[0], setFavorites = favState[1];
    var hidden = hiddenState[0], setHidden = hiddenState[1];

    var tabRef = useRef(tab);
    tabRef.current = tab;

    // Heavier per-tab data (network/audio/display fetched lazily for STAT;
    // usage/notifs needed by HOME and DATA).
    var refreshLazy = useCallback(function () {
      var ax = getAccessState();
      setAccess(ax);
      setUsage(ax.usageAccess ? getUsageStats(20) : []);
      setNotifs(ax.notificationAccess ? getNotifications() : []);
      var t = tabRef.current;
      if (t === "stat") {
        setNet(getNetworkInfo());
        setAudio(getAudioInfo());
        setDisplay(getDisplayInfo());
      }
    }, []);

    // Full data refresh.
    var refreshAll = useCallback(function () {
      setStats(getDeviceStats());
      setApps(getApps());
      var p = getPermissions();
      setPerms(p);
      setCallLog(p.callLog ? getCallLog(100) : []);
      setContacts(p.contacts ? getContacts() : []);
      refreshLazy();
    }, [refreshLazy]);

    // Lightweight poll for the live clock / battery.
    var refreshStats = useCallback(function () {
      var s = getDeviceStats();
      if (s) setStats(s);
    }, []);

    useEffect(
      function () {
        refreshAll();
        function onRefresh() {
          refreshAll();
        }
        window.addEventListener("pipboy:refresh", onRefresh);
        var iv = setInterval(refreshStats, 10000);
        return function () {
          window.removeEventListener("pipboy:refresh", onRefresh);
          clearInterval(iv);
        };
      },
      [refreshAll, refreshStats]
    );

    // When switching into STAT, fetch the heavier network/audio/display data.
    useEffect(
      function () {
        if (tab === "stat") {
          setNet(getNetworkInfo());
          setAudio(getAudioInfo());
          setDisplay(getDisplayInfo());
        }
      },
      [tab]
    );

    // ---- favorites / hidden mutators ----
    var toggleFavorite = useCallback(
      function (pkg) {
        setFavorites(function (prev) {
          var next;
          if (prev.indexOf(pkg) !== -1) {
            next = prev.filter(function (p) {
              return p !== pkg;
            });
          } else {
            next = prev.concat([pkg]);
          }
          lsSet(FAV_KEY, next);
          return next;
        });
      },
      []
    );
    var toggleHidden = useCallback(
      function (pkg) {
        setHidden(function (prev) {
          var next;
          if (prev.indexOf(pkg) !== -1) {
            next = prev.filter(function (p) {
              return p !== pkg;
            });
          } else {
            next = prev.concat([pkg]);
          }
          lsSet(HIDDEN_KEY, next);
          return next;
        });
      },
      []
    );

    var dismissAndRefresh = useCallback(function (key) {
      dismissNotification(key);
      setNotifs(getNotifications());
    }, []);

    var goTo = useCallback(
      function (t, sub) {
        setTab(t);
        if (sub) dataTabState[1](sub);
      },
      [setTab]
    );

    // ---- header status items ----
    var battery = stats ? stats.batteryPct : null;
    var statusItems = [
      { label: "TIME", value: stats && stats.time ? stats.time : "--:--" },
      { label: "DATE", value: stats && stats.date ? stats.date : "--" },
      { label: "HP", value: battery == null ? "--" : battery + "%", tone: batteryTone(battery) },
      { label: "PWR", value: stats && stats.charging ? "CHRG" : "BATT", tone: "default" },
    ];

    var mainTabs = [
      { id: "home", label: "HOME" },
      { id: "stat", label: "STAT" },
      { id: "inv", label: "INV" },
      { id: "data", label: "DATA" },
      { id: "radio", label: "RADIO" },
    ];

    var body;
    if (tab === "home") {
      body = h(HomeScreen, {
        stats: stats,
        apps: apps,
        favorites: favorites,
        usage: usage,
        notifs: notifs,
        access: access,
        perms: perms,
        goTo: goTo,
        onLaunch: launchApp,
      });
    } else if (tab === "stat") {
      body = h(StatScreen, { stats: stats, net: net, audio: audio, display: display });
    } else if (tab === "inv") {
      body = h(InvScreen, {
        apps: apps,
        query: queryState[0],
        setQuery: queryState[1],
        favorites: favorites,
        hidden: hidden,
        usage: usage,
        access: access,
        onLongPress: function (pkg) {
          setActionPkg(pkg);
        },
      });
    } else if (tab === "data") {
      body = h(DataScreen, {
        perms: perms,
        callLog: callLog,
        contacts: contacts,
        notifs: notifs,
        notifAccess: access && access.notificationAccess,
        dataTab: dataTabState[0],
        setDataTab: dataTabState[1],
        onDismiss: dismissAndRefresh,
      });
    } else {
      body = h(RadioScreen, {
        flashOn: flashState[0],
        setFlashOn: flashState[1],
        access: access,
      });
    }

    // ---- app-action modal (long-pressed app in INV) ----
    var actionApp = useMemo(
      function () {
        if (!actionPkg) return null;
        var a = findApp(apps, actionPkg);
        return a || { packageName: actionPkg, label: actionPkg };
      },
      [actionPkg, apps]
    );
    var isFav = actionPkg && favorites.indexOf(actionPkg) !== -1;
    var isHidden = actionPkg && hidden.indexOf(actionPkg) !== -1;
    var closeAction = function () {
      setActionPkg(null);
    };

    var modal = h(
      Modal,
      {
        open: !!actionPkg,
        onClose: closeAction,
        title: actionApp ? appLabelOf(actionApp) : "",
      },
      h(
        "div",
        { className: "modal-actions" },
        actionApp && actionApp.versionName
          ? h(Text, { variant: "dim", size: "sm" }, "v" + actionApp.versionName)
          : null,
        h(
          Button,
          {
            variant: "primary",
            block: true,
            onClick: function () {
              if (actionApp) launchApp(actionApp.packageName);
              closeAction();
            },
          },
          "LAUNCH"
        ),
        h(
          Button,
          {
            variant: "ghost",
            block: true,
            onClick: function () {
              if (actionApp) openAppInfo(actionApp.packageName);
              closeAction();
            },
          },
          "APP INFO"
        ),
        h(
          Button,
          {
            variant: "ghost",
            block: true,
            onClick: function () {
              if (actionApp) toggleFavorite(actionApp.packageName);
              closeAction();
            },
          },
          isFav ? "UNPIN" : "PIN"
        ),
        h(
          Button,
          {
            variant: "ghost",
            block: true,
            onClick: function () {
              if (actionApp) toggleHidden(actionApp.packageName);
              closeAction();
            },
          },
          isHidden ? "UNHIDE" : "HIDE"
        ),
        h(
          Button,
          {
            variant: "danger",
            block: true,
            glow: false,
            onClick: function () {
              if (actionApp) uninstallApp(actionApp.packageName);
              closeAction();
            },
          },
          "UNINSTALL"
        ),
        h(Button, { variant: "ghost", block: true, glow: false, onClick: closeAction }, "CANCEL")
      )
    );

    var noBridgeNotice = !hasBridge()
      ? h(Text, { variant: "dim", size: "xs" }, "OFFLINE PREVIEW — Android bridge not detected.")
      : null;

    return h(
      Screen,
      null,
      h(
        "div",
        { className: "app" },
        h(
          "div",
          { className: "app__header stack" },
          h(Heading, { level: 1 }, "PIP-BOY 3000"),
          h(StatusBar, { items: statusItems }),
          noBridgeNotice
        ),
        h(
          "div",
          { className: "app__tabs", style: { marginTop: 12 } },
          h(Tabs, { tabs: mainTabs, value: tab, onChange: setTab })
        ),
        h("div", { className: "app__body" }, body)
      ),
      modal
    );
  }

  /* ----------------------------------------------------------------- mount */
  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
})();
