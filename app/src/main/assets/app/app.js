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
  var B = window.AndroidBridge;
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

  function getApps() {
    try {
      if (!hasBridge()) return [];
      return parseJson(bridge().getApps(), []);
    } catch (e) {
      return [];
    }
  }
  function getCallLog(limit) {
    try {
      if (!hasBridge()) return [];
      return parseJson(bridge().getCallLog(limit), []);
    } catch (e) {
      return [];
    }
  }
  function getContacts() {
    try {
      if (!hasBridge()) return [];
      return parseJson(bridge().getContacts(), []);
    } catch (e) {
      return [];
    }
  }
  function getDeviceStats() {
    try {
      if (!hasBridge()) return null;
      return parseJson(bridge().getDeviceStats(), null);
    } catch (e) {
      return null;
    }
  }
  function getPermissions() {
    try {
      if (!hasBridge()) return { callLog: false, contacts: false, phone: false };
      return parseJson(bridge().getPermissions(), {
        callLog: false,
        contacts: false,
        phone: false,
      });
    } catch (e) {
      return { callLog: false, contacts: false, phone: false };
    }
  }
  function launchApp(pkg) {
    try {
      if (hasBridge()) bridge().launchApp(pkg);
    } catch (e) {}
  }
  function openAppInfo(pkg) {
    try {
      if (hasBridge()) bridge().openAppInfo(pkg);
    } catch (e) {}
  }
  function dial(num) {
    try {
      if (hasBridge()) bridge().dial(num);
    } catch (e) {}
  }
  function requestPermissions() {
    try {
      if (hasBridge()) bridge().requestPermissions();
    } catch (e) {}
  }
  function openSettings(which) {
    try {
      if (hasBridge()) bridge().openSettings(which);
    } catch (e) {}
  }
  function setFlashlight(on) {
    try {
      if (hasBridge()) return !!bridge().setFlashlight(on);
    } catch (e) {}
    return false;
  }
  function vibrate(ms) {
    try {
      if (hasBridge()) bridge().vibrate(ms);
    } catch (e) {}
  }

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

  // Text marker + StatusBar/Text tone for a call-log type.
  function byType(type) {
    switch (type) {
      case "INCOMING":
        return { marker: "▼", tone: "default" }; // ▼ down/in
      case "OUTGOING":
        return { marker: "▲", tone: "default" }; // ▲ up/out
      case "MISSED":
        return { marker: "✕", tone: "danger" }; // ✕
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
  // ProgressBar uses "primary" instead of "default"
  function batteryProgressVariant(pct) {
    var t = batteryTone(pct);
    return t === "default" ? "primary" : t;
  }

  /* -------------------------------------------------------- long-press hook */
  // Returns handlers to attach to a wrapper element. Fires onLongPress after
  // ~500ms of a stationary press; suppresses the subsequent click.
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

  /* ============================================================ STAT screen */
  function StatScreen(props) {
    var stats = props.stats;
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

    return h(
      "div",
      { className: "stack" },
      h(
        Panel,
        { title: "VITALS" },
        // HP = battery: value 0..100, max 100 (default), variant per tone.
        h(ProgressBar, {
          label: "HP " + (stats.charging ? "(CHARGING)" : ""),
          value: battery == null ? 0 : battery,
          max: 100,
          showValue: true,
          variant: batteryProgressVariant(battery),
        }),
        h("div", { style: { height: 10 } }),
        // STORAGE: pass raw used/total bytes; component computes pct = value/max.
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
      h(
        Panel,
        { title: "SYSTEM", variant: "inset" },
        kvRow("MODEL", (stats.manufacturer || "") + " " + (stats.model || "")),
        kvRow("ANDROID", stats.androidVersion + " (SDK " + stats.sdkInt + ")"),
        kvRow("UPTIME", formatUptime(stats.uptimeMillis)),
        kvRow("TIME", (stats.time || "") + "  " + (stats.date || ""))
      )
    );
  }

  function kvRow(k, v) {
    return h(
      "div",
      { className: "kv", key: k },
      h(Text, { as: "span", variant: "dim", size: "sm" }, k),
      h(Text, { as: "span", variant: "bright", size: "sm" }, v)
    );
  }

  /* ============================================================= INV screen */
  function InvScreen(props) {
    var apps = props.apps;
    var query = props.query;
    var setQuery = props.setQuery;

    // Alphabetical, then filter by query against label.
    var filtered = useMemo(
      function () {
        var q = (query || "").trim().toLowerCase();
        var list = apps.slice().sort(function (a, b) {
          return (a.label || "").toLowerCase().localeCompare((b.label || "").toLowerCase());
        });
        if (!q) return list;
        return list.filter(function (a) {
          return (a.label || "").toLowerCase().indexOf(q) !== -1;
        });
      },
      [apps, query]
    );

    // Map apps -> Menu items: id = packageName, label = uppercase name.
    var menuItems = useMemo(
      function () {
        return filtered.map(function (a) {
          return { id: a.packageName, label: (a.label || a.packageName).toUpperCase() };
        });
      },
      [filtered]
    );

    var lp = useLongPress(function (pkg) {
      props.onLongPress(pkg);
    });

    // Menu has no per-item event other than onSelect(id). A long-press starts
    // when a press begins on a menu item; we resolve the package from the
    // pressed <button>'s position in the list via data attr set below isn't
    // available, so we capture the id on pointerdown using the closest item.
    var onSelect = useCallback(
      function (id) {
        if (lp.didFire()) return; // long-press already handled the action
        launchApp(id);
      },
      [lp]
    );

    // Resolve which app a pointer event targets by index within the menu.
    function pkgFromEvent(e) {
      var btn = e.target && e.target.closest ? e.target.closest(".pip-menu__item") : null;
      if (!btn) return null;
      var ul = btn.closest(".pip-menu");
      if (!ul) return null;
      var buttons = ul.querySelectorAll(".pip-menu__item");
      var idx = Array.prototype.indexOf.call(buttons, btn);
      if (idx < 0 || idx >= menuItems.length) return null;
      return menuItems[idx].id;
    }

    var pressHandlers = {
      onPointerDown: function (e) {
        var pkg = pkgFromEvent(e);
        if (pkg) lp.onStart(pkg);
      },
      onPointerUp: lp.onEnd,
      onPointerLeave: lp.onCancel,
      onPointerCancel: lp.onCancel,
    };

    return h(
      "div",
      { className: "stack" },
      h(Input, {
        label: "SEARCH (" + filtered.length + " / " + apps.length + " APPS)",
        placeholder: "filter inventory…",
        value: query,
        onChange: function (e) {
          setQuery(e.target.value);
        },
      }),
      apps.length === 0
        ? h(
            Panel,
            { variant: "inset" },
            h(Text, { variant: "dim" }, "INVENTORY EMPTY — no apps reported by host.")
          )
        : filtered.length === 0
        ? h(Text, { variant: "dim" }, "NO MATCHES.")
        : h(
            "div",
            Object.assign({ className: "list-scroll" }, pressHandlers),
            h(Menu, { items: menuItems, onSelect: onSelect })
          ),
      h(
        Text,
        { variant: "dim", size: "xs" },
        "Tap to launch · long-press for actions."
      )
    );
  }

  /* ============================================================ DATA screen */
  function DataScreen(props) {
    var perms = props.perms;
    var callLog = props.callLog;
    var contacts = props.contacts;
    var sub = props.dataTab;
    var setSub = props.setDataTab;

    var subTabs = [
      { id: "calls", label: "CALL LOG" },
      { id: "contacts", label: "CONTACTS" },
    ];

    return h(
      "div",
      { className: "stack" },
      h(Tabs, { tabs: subTabs, value: sub, onChange: setSub }),
      sub === "calls"
        ? perms.callLog
          ? h(CallLog, { entries: callLog })
          : permGate("CALL LOG ACCESS REQUIRED", "Grant call-log permission to read recent calls.")
        : perms.contacts
        ? h(Contacts, { contacts: contacts })
        : permGate("CONTACTS ACCESS REQUIRED", "Grant contacts permission to read your address book.")
    );
  }

  function permGate(title, msg) {
    return h(
      Panel,
      { title: title, variant: "inset" },
      h("div", { className: "stack" }, h(Text, { variant: "dim" }, msg)),
      h("div", { style: { height: 12 } }),
      h(
        Button,
        { variant: "warning", block: true, onClick: requestPermissions },
        "GRANT ACCESS"
      )
    );
  }

  function CallLog(props) {
    var entries = props.entries || [];
    if (entries.length === 0) {
      return h(
        Panel,
        { variant: "inset" },
        h(Text, { variant: "dim" }, "NO RECENT CALLS.")
      );
    }
    return h(
      "div",
      { className: "list-scroll" },
      entries.map(function (c, i) {
        var t = byType(c.type);
        var title = c.name && c.name.length ? c.name : c.number || "UNKNOWN";
        var danger = t.tone === "danger";
        return h(
          // Use a Button (ghost) as the tappable row so it carries DS styling.
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
              h(
                "span",
                {
                  className: "ellipsis",
                  style: { display: "block" },
                },
                (title || "").toString().toUpperCase()
              ),
              c.name && c.name.length
                ? h(
                    "span",
                    { className: "ellipsis", style: { display: "block", opacity: 0.6 } },
                    c.number || ""
                  )
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

    // Menu items keyed by index (numbers can repeat / be empty).
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

    // (label shown on button, openSettings key)
    var quick = [
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
            // Only reflect state we believe applied; setFlashlight returns bool.
            setFlashOn(ok ? next : flashOn);
            vibrate(10);
          },
        })
      ),
      h(
        Panel,
        { title: "SETTINGS SHORTCUTS", variant: "inset" },
        h(
          "div",
          { className: "grid-2" },
          quick.map(function (q) {
            return h(
              Button,
              {
                key: q[1],
                variant: "ghost",
                block: true,
                glow: false,
                onClick: function () {
                  openSettings(q[1]);
                },
              },
              q[0]
            );
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
      )
    );
  }

  /* ================================================================ App root */
  function App() {
    var tabState = useState("stat");
    var tab = tabState[0];
    var setTab = tabState[1];

    var dataTabState = useState("calls");

    var statsState = useState(null);
    var appsState = useState([]);
    var callLogState = useState([]);
    var contactsState = useState([]);
    var permsState = useState({ callLog: false, contacts: false, phone: false });
    var queryState = useState(""); // app drawer search
    var flashState = useState(false);
    var actionPkgState = useState(null); // package whose action modal is open

    var stats = statsState[0],
      setStats = statsState[1];
    var apps = appsState[0],
      setApps = appsState[1];
    var callLog = callLogState[0],
      setCallLog = callLogState[1];
    var contacts = contactsState[0],
      setContacts = contactsState[1];
    var perms = permsState[0],
      setPerms = permsState[1];
    var actionPkg = actionPkgState[0],
      setActionPkg = actionPkgState[1];

    // Full data refresh: device stats + apps + call log + contacts + perms.
    var refreshAll = useCallback(function () {
      setStats(getDeviceStats());
      setApps(getApps());
      var p = getPermissions();
      setPerms(p);
      setCallLog(p.callLog ? getCallLog(100) : []);
      setContacts(p.contacts ? getContacts() : []);
    }, []);

    // Lightweight poll just for the live clock / battery.
    var refreshStats = useCallback(function () {
      var s = getDeviceStats();
      if (s) setStats(s);
    }, []);

    useEffect(
      function () {
        refreshAll();
        // Native dispatches this on launch / resume / permission change.
        function onRefresh() {
          refreshAll();
        }
        window.addEventListener("pipboy:refresh", onRefresh);
        // Live clock / battery every 10s.
        var iv = setInterval(refreshStats, 10000);
        return function () {
          window.removeEventListener("pipboy:refresh", onRefresh);
          clearInterval(iv);
        };
      },
      [refreshAll, refreshStats]
    );

    // ---- header status items mapped from device stats ----
    var battery = stats ? stats.batteryPct : null;
    var statusItems = [
      { label: "TIME", value: stats && stats.time ? stats.time : "--:--" },
      { label: "DATE", value: stats && stats.date ? stats.date : "--" },
      {
        label: "HP",
        value: battery == null ? "--" : battery + "%",
        tone: batteryTone(battery), // 'default' | 'warning' (<30) | 'danger' (<15)
      },
      {
        label: "PWR",
        value: stats && stats.charging ? "CHRG" : "BATT",
        tone: stats && stats.charging ? "default" : "default",
      },
    ];

    var mainTabs = [
      { id: "stat", label: "STAT" },
      { id: "inv", label: "INV" },
      { id: "data", label: "DATA" },
      { id: "radio", label: "RADIO" },
    ];

    // Body for the active main tab.
    var body;
    if (tab === "stat") {
      body = h(StatScreen, { stats: stats });
    } else if (tab === "inv") {
      body = h(InvScreen, {
        apps: apps,
        query: queryState[0],
        setQuery: queryState[1],
        onLongPress: function (pkg) {
          setActionPkg(pkg);
        },
      });
    } else if (tab === "data") {
      body = h(DataScreen, {
        perms: perms,
        callLog: callLog,
        contacts: contacts,
        dataTab: dataTabState[0],
        setDataTab: dataTabState[1],
      });
    } else {
      body = h(RadioScreen, {
        flashOn: flashState[0],
        setFlashOn: flashState[1],
      });
    }

    // App-action modal (LAUNCH / APP INFO / CANCEL) for long-pressed app.
    var actionApp = useMemo(
      function () {
        if (!actionPkg) return null;
        for (var i = 0; i < apps.length; i++) {
          if (apps[i].packageName === actionPkg) return apps[i];
        }
        return { packageName: actionPkg, label: actionPkg };
      },
      [actionPkg, apps]
    );
    var closeAction = function () {
      setActionPkg(null);
    };

    var modal = h(
      Modal,
      {
        open: !!actionPkg,
        onClose: closeAction,
        title: actionApp ? (actionApp.label || actionApp.packageName).toUpperCase() : "",
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
        h(Button, { variant: "danger", block: true, glow: false, onClick: closeAction }, "CANCEL")
      )
    );

    var noBridgeNotice = !hasBridge()
      ? h(
          Text,
          { variant: "dim", size: "xs" },
          "OFFLINE PREVIEW — Android bridge not detected."
        )
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
        h("div", { className: "app__tabs", style: { marginTop: 12 } },
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
