/* PipBoy 3000 launcher front-end.
 * Renders the shipped design system (window.PipBoy.*) via React.createElement.
 * Talks to Android through window.AndroidBridge (all methods synchronous).
 *
 * Information architecture (one function = one place):
 *   CHROME  : system bar (clock + BAT/SIG/NOTIF vitals chips) + main Tabs.
 *   APPS    : favorites dock, frequent strip, the ONLY search box, all apps.
 *   DATA    : CALL LOG | SMS | CONTACTS | NOTIFS (the ONLY comms/feeds surface).
 *   STAT    : read-only readouts (vitals, network, audio, display, system).
 *   RADIO   : the ONLY controls/settings/system-access surface.
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
    return callJson("getPermissions", [], {
      callLog: false,
      contacts: false,
      phone: false,
      sms: false,
    });
  }
  function getSms(limit) {
    return callJson("getSms", [limit], []);
  }
  function getSmsThread(threadId, limit) {
    return callJson("getSmsThread", [String(threadId), limit], []);
  }
  function getTraffic() {
    return callJson("getTraffic", [], null);
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
  function dial(num) {
    callBool("dial", [num]);
  }
  function openSms(address) {
    callBool("openSms", [address]);
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

  // Human-readable transfer rate (bytes/second).
  function formatSpeed(bytesPerSec) {
    if (bytesPerSec == null || isNaN(bytesPerSec) || bytesPerSec < 0) return "0";
    var n = Number(bytesPerSec);
    if (n < 1) return "0";
    var units = ["B/s", "KB/s", "MB/s", "GB/s"];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return (n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)) + " " + units[i];
  }

  // Left-pad to a fixed width (monospace -> stable column width, no jitter).
  function padL(s, w) {
    s = String(s);
    while (s.length < w) s = " " + s;
    return s;
  }
  function padR(s, w) {
    s = String(s);
    while (s.length < w) s = s + " ";
    return s;
  }

  // Compact, FIXED-WIDTH transfer rate for the chrome (e.g. "  1.2M"): a single
  // unit letter keeps it short, padded so the value never changes the layout.
  function speedTokenFixed(bytesPerSec) {
    var n = (bytesPerSec == null || isNaN(bytesPerSec) || bytesPerSec < 0) ? 0 : Number(bytesPerSec);
    var u = ["B", "K", "M", "G"];
    var i = 0;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    var tok = (i === 0 || n >= 100 ? Math.round(n).toString() : n.toFixed(1)) + u[i];
    return padL(tok, 6);
  }

  // Run an action that opens/launches/navigates externally, then drop focus so
  // the tapped control does not stay visually "lit" (focus glow / active state).
  function act(fn) {
    return function () {
      try {
        if (typeof fn === "function") fn.apply(null, arguments);
      } finally {
        setTimeout(function () {
          try {
            if (document.activeElement && document.activeElement.blur) {
              document.activeElement.blur();
            }
          } catch (e) {}
        }, 0);
      }
    };
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

  // Local live clock — { time:"HH:MM", date:"YYYY-MM-DD DOW" }.
  function clockNow() {
    var d = new Date();
    function p2(n) {
      return (n < 10 ? "0" : "") + n;
    }
    var days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    var time = p2(d.getHours()) + ":" + p2(d.getMinutes());
    var date =
      d.getFullYear() +
      "-" +
      p2(d.getMonth() + 1) +
      "-" +
      p2(d.getDate()) +
      " " +
      days[d.getDay()];
    return { time: time, date: date };
  }

  function isMostlyDigits(q) {
    var t = (q || "").trim();
    if (!t) return false;
    var digits = t.replace(/[^0-9]/g, "");
    var nonDigitsAllowed = t.replace(/[0-9\s\-\+\(\)\*#]/g, "");
    return digits.length >= 3 && nonDigitsAllowed.length === 0;
  }

  // Text marker + tone for a call-log type.
  function byCallType(type) {
    switch (type) {
      case "INCOMING":
        return { marker: "<", tone: "default" };
      case "OUTGOING":
        return { marker: ">", tone: "default" };
      case "MISSED":
        return { marker: "x", tone: "danger" };
      case "REJECTED":
        return { marker: "x", tone: "danger" };
      case "BLOCKED":
        return { marker: "#", tone: "danger" };
      case "VOICEMAIL":
        return { marker: "@", tone: "warning" };
      default:
        return { marker: "-", tone: "default" };
    }
  }

  // Text marker for an SMS message direction.
  function smsMarker(type) {
    switch (type) {
      case "SENT":
      case "OUTBOX":
      case "QUEUED":
        return ">";
      case "FAILED":
        return "x";
      case "DRAFT":
        return "~";
      default:
        return "<"; // INBOX / UNKNOWN
    }
  }

  // battery % -> tone
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
    var full = "#";
    var empty = "-";
    var n = Math.max(0, Math.min(4, level));
    return full.repeat(n) + empty.repeat(4 - n);
  }

  function appLabelOf(app) {
    return (app.label || app.packageName || "").toUpperCase();
  }
  function findApp(apps, pkg) {
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].packageName === pkg) return apps[i];
    }
    return null;
  }

  /* ======================================================= shared UI parts */

  // Section — a Panel with the design-system "//" title style.
  function Section(props) {
    return h(
      Panel,
      { title: props.title, variant: props.variant || "default", className: props.className },
      props.children
    );
  }

  // ListRow — the single tappable row used by apps, contacts, call log, notifs.
  //   marker?    : leading glyph (string)
  //   primary    : main text (string)
  //   secondary? : dim secondary line (string)
  //   meta?      : trailing meta text (string)
  //   tone?      : "default" | "warning" | "danger" (colors the marker)
  //   onClick?   : tap handler for the row
  //   action?    : { label, onClick, variant } -> trailing action button
  //   pressHandlers? : pointer handlers (for long-press), spread on the main button
  function ListRow(props) {
    var tone = props.tone || "default";
    var markerStyle = null;
    if (tone === "danger") markerStyle = { color: "var(--pip-danger, #ff5555)" };
    else if (tone === "warning") markerStyle = { color: "var(--pip-warning, #ffb000)" };

    var mainChildren = [
      props.marker != null
        ? h("span", { className: "lrow__marker", key: "m", style: markerStyle }, props.marker)
        : null,
      h(
        "span",
        { className: "lrow__body", key: "b" },
        h("span", { className: "lrow__primary ellipsis" }, props.primary),
        props.secondary
          ? h("span", { className: "lrow__secondary ellipsis" }, props.secondary)
          : null
      ),
      props.meta ? h("span", { className: "lrow__meta", key: "t" }, props.meta) : null,
    ];

    var mainProps = {
      type: "button",
      className: "lrow__main",
      onClick: props.onClick,
    };
    if (props.pressHandlers) {
      for (var k in props.pressHandlers) {
        if (props.pressHandlers.hasOwnProperty(k)) mainProps[k] = props.pressHandlers[k];
      }
    }

    return h(
      "div",
      { className: "lrow" },
      h("button", mainProps, mainChildren),
      props.action
        ? h(
            "div",
            { className: "lrow__action" },
            h(
              Button,
              {
                variant: props.action.variant || "ghost",
                glow: false,
                onClick: props.action.onClick,
              },
              props.action.label
            )
          )
        : null
    );
  }

  // PermissionGate — the single access-denied prompt.
  function PermissionGate(props) {
    return h(
      Section,
      { title: props.title, variant: "inset" },
      h(Text, { variant: "dim" }, props.message),
      h("div", { style: { height: 12 } }),
      h(Button, { variant: "warning", block: true, onClick: props.onAction }, props.actionLabel)
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

  function statusItem(label, value, tone) {
    return { label: label, value: value, tone: tone || "default" };
  }

  // A grid of buttons. entries: [{id,label,onClick,variant?}]
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

  /* ============================================================ APPS screen */
  // The ONLY app-launch + search surface.
  function AppsScreen(props) {
    var apps = props.apps;
    var favorites = props.favorites;
    var hidden = props.hidden;
    var usage = props.usage;
    var access = props.access;
    var onLaunch = props.onLaunch;
    var onLongPress = props.onLongPress;

    var queryState = useState("");
    var query = queryState[0];
    var setQuery = queryState[1];

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

    var q = (query || "").trim();
    var ql = q.toLowerCase();

    // favorites dock apps
    var favApps = useMemo(
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

    // frequent strip (top ~6)
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

    // all apps (alphabetical, exclude hidden unless toggled), filtered by query
    var allList = useMemo(
      function () {
        var list = apps.slice().sort(function (a, b) {
          return (a.label || "").toLowerCase().localeCompare((b.label || "").toLowerCase());
        });
        return list.filter(function (a) {
          if (!showHidden && hiddenSet[a.packageName]) return false;
          if (ql && (a.label || "").toLowerCase().indexOf(ql) === -1) return false;
          return true;
        });
      },
      [apps, ql, showHidden, hiddenSet]
    );

    var lp = useLongPress(function (pkg) {
      onLongPress(pkg);
    });

    function appRow(a) {
      var marks = "";
      if (favSet[a.packageName]) marks += " *";
      if (hiddenSet[a.packageName]) marks += " #";
      var pressHandlers = {
        onPointerDown: function () {
          lp.onStart(a.packageName);
        },
        onPointerUp: lp.onEnd,
        onPointerLeave: lp.onCancel,
        onPointerCancel: lp.onCancel,
      };
      return h(ListRow, {
        key: a.packageName,
        marker: ">",
        primary: appLabelOf(a) + marks,
        onClick: act(function () {
          if (lp.didFire()) return;
          onLaunch(a.packageName);
        }),
        pressHandlers: pressHandlers,
      });
    }

    // ---- favorites dock (only if non-empty) ----
    var favDock = favApps.length
      ? h(
          Section,
          { title: "FAVORITES" },
          h("div", { className: "dock" }, favApps.map(appRow))
        )
      : null;

    // ---- frequent strip ----
    var freqStrip = null;
    if (access && access.usageAccess) {
      if (freqApps.length) {
        freqStrip = h(
          Section,
          { title: "FREQUENT", variant: "inset" },
          h(
            "div",
            { className: "dock" },
            freqApps.map(function (a) {
              return h(ListRow, {
                key: a.packageName,
                marker: ">",
                primary: (a.label || a.packageName).toUpperCase(),
                onClick: act(function () {
                  onLaunch(a.packageName);
                }),
              });
            })
          )
        );
      }
      // usage on but no data yet -> show nothing (don't render an empty section)
    } else {
      freqStrip = h(
        Button,
        { variant: "warning", block: true, glow: false, onClick: act(openUsageAccessSettings) },
        "ENABLE USAGE ACCESS"
      );
    }

    // ---- search results (smart actions + filtered apps) ----
    var smartActions = null;
    if (q) {
      var actions = [];
      if (isMostlyDigits(q)) {
        actions.push(
          h(ListRow, {
            key: "__dial",
            marker: ">",
            primary: "DIAL " + q,
            onClick: act(function () {
              dial(q);
            }),
          })
        );
      }
      actions.push(
        h(ListRow, {
          key: "__web",
          marker: ">",
          primary: 'WEB SEARCH "' + q + '"',
          onClick: act(function () {
            webSearch(q);
          }),
        })
      );
      smartActions = h(Section, { title: "ACTIONS", variant: "inset" }, actions);
    }

    var listTitle = q ? "RESULTS (" + allList.length + ")" : "ALL APPS (" + allList.length + ")";
    var listBody;
    if (apps.length === 0) {
      listBody = h(Text, { variant: "dim" }, "INVENTORY EMPTY — no apps reported by host.");
    } else if (allList.length === 0) {
      listBody = h(Text, { variant: "dim" }, "NO MATCHES.");
    } else {
      listBody = h("div", { className: "rows" }, allList.map(appRow));
    }

    return h(
      "div",
      { className: "stack" },
      favDock,
      freqStrip,
      h(Input, {
        label: "SEARCH",
        placeholder: "apps, dial, web…",
        value: query,
        onChange: function (e) {
          setQuery(e.target.value);
        },
      }),
      smartActions,
      h(Toggle, {
        checked: showHidden,
        label: "SHOW HIDDEN",
        onChange: function (next) {
          setShowHidden(next);
        },
      }),
      h(Section, { title: listTitle, variant: "inset" }, listBody),
      h(Text, { variant: "dim", size: "xs" }, "Tap to launch · long-press for actions.")
    );
  }

  /* ============================================================ DATA screen */
  // The ONLY comms/feeds surface: CALL LOG | SMS | CONTACTS | NOTIFS.
  function DataScreen(props) {
    var perms = props.perms;
    var callLog = props.callLog;
    var contacts = props.contacts;
    var sms = props.sms;
    var notifs = props.notifs;
    var notifAccess = props.notifAccess;
    var sub = props.dataTab;
    var setSub = props.setDataTab;
    var onDismiss = props.onDismiss;

    var subTabs = [
      { id: "calls", label: "CALL LOG" },
      { id: "sms", label: "SMS" },
      { id: "contacts", label: "CONTACTS" },
      { id: "notifs", label: "NOTIFS" },
    ];

    var content;
    if (sub === "calls") {
      content = perms.callLog
        ? h(CallLog, { entries: callLog })
        : h(PermissionGate, {
            title: "CALL LOG ACCESS REQUIRED",
            message: "Grant call-log permission to read recent calls.",
            actionLabel: "GRANT ACCESS",
            onAction: act(requestPermissions),
          });
    } else if (sub === "sms") {
      content = perms.sms
        ? h(Sms, { messages: sms })
        : h(PermissionGate, {
            title: "SMS ACCESS REQUIRED",
            message: "Grant SMS permission to read recent messages.",
            actionLabel: "GRANT ACCESS",
            onAction: act(requestPermissions),
          });
    } else if (sub === "contacts") {
      content = perms.contacts
        ? h(Contacts, { contacts: contacts })
        : h(PermissionGate, {
            title: "CONTACTS ACCESS REQUIRED",
            message: "Grant contacts permission to read your address book.",
            actionLabel: "GRANT ACCESS",
            onAction: act(requestPermissions),
          });
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

  // SMS — an in-app two-level reader: a conversation LIST (one row per thread)
  // and a read-only THREAD view (all messages of the selected thread). No
  // external messaging app is launched.
  function Sms(props) {
    var messages = props.messages || [];

    // Selected thread state: { threadId, title } or null for the LIST view.
    var openState = useState(null);
    var open = openState[0];
    var setOpen = openState[1];

    if (open) {
      return h(SmsThread, {
        threadId: open.threadId,
        title: open.title,
        onBack: function () {
          setOpen(null);
        },
      });
    }

    if (messages.length === 0) {
      return h(Section, { variant: "inset" }, h(Text, { variant: "dim" }, "NO MESSAGES."));
    }
    return h(
      "div",
      { className: "rows" },
      messages.map(function (m, i) {
        var who = (m.name && m.name.length ? m.name : m.address || "UNKNOWN").toString().toUpperCase();
        var unread = m.read === false && m.type === "INBOX";
        var marker = (unread ? "* " : "") + smsMarker(m.type);
        var tone = m.type === "FAILED" ? "danger" : "default";
        var primary = unread ? who + " *" : who;
        return h(ListRow, {
          key: m.threadId != null ? "t" + m.threadId : (m.address ? m.address + ":" + m.date + ":" + i : i),
          marker: marker,
          tone: tone,
          primary: primary,
          secondary: (m.body || "").toString().replace(/\s+/g, " "),
          meta: relativeTime(m.date),
          onClick: act(function () {
            setOpen({ threadId: m.threadId, title: who });
          }),
        });
      })
    );
  }

  // SmsThread — read-only conversation view. Loads all messages of a thread
  // (oldest first) and renders them as left/right aligned bubbles inside the
  // scrollable body. A BACK button returns to the conversation LIST.
  function SmsThread(props) {
    var threadId = props.threadId;
    var title = props.title || "UNKNOWN";
    var onBack = props.onBack;

    var listState = useState([]);
    var list = listState[0];
    var setList = listState[1];

    useEffect(
      function () {
        if (threadId == null) {
          setList([]);
          return undefined;
        }
        setList(getSmsThread(String(threadId), 500) || []);
        return undefined;
      },
      [threadId]
    );

    var header = h(
      "div",
      { className: "sms-thread__head" },
      h(Button, { variant: "ghost", glow: false, onClick: act(onBack) }, "< BACK"),
      h(Text, { as: "span", variant: "bright", size: "sm", className: "ellipsis" }, title)
    );

    var bodyChildren;
    if (!list || list.length === 0) {
      bodyChildren = h(Text, { variant: "dim" }, "NO MESSAGES.");
    } else {
      bodyChildren = list.map(function (m, i) {
        var out = m.type === "SENT" || m.type === "OUTBOX" || m.type === "QUEUED";
        var cls = "sms-msg " + (out ? "sms-msg--out" : "sms-msg--in");
        return h(
          "div",
          { className: cls, key: i },
          h(Text, { as: "div", variant: out ? "bright" : "dim", size: "sm" }, (m.body || "").toString()),
          h(Text, { as: "div", variant: "dim", size: "xs", className: "sms-msg__time" }, relativeTime(m.date))
        );
      });
    }

    return h(
      Section,
      { variant: "inset" },
      header,
      h("div", { style: { height: 10 } }),
      h("div", { className: "sms-thread" }, bodyChildren)
    );
  }

  function Notifs(props) {
    var notifs = props.notifs || [];
    var access = props.access;
    var onDismiss = props.onDismiss;

    if (!access) {
      return h(PermissionGate, {
        title: "NOTIFICATION ACCESS REQUIRED",
        message: "Grant notification access to view active notifications.",
        actionLabel: "GRANT NOTIFICATION ACCESS",
        onAction: act(openNotificationAccessSettings),
      });
    }
    if (notifs.length === 0) {
      return h(Section, { variant: "inset" }, h(Text, { variant: "dim" }, "NO ACTIVE NOTIFICATIONS."));
    }
    return h(
      "div",
      { className: "rows" },
      notifs.map(function (n, i) {
        var who = (n.appLabel || n.packageName || "").toString().toUpperCase();
        var action = n.clearable
          ? {
              label: "X",
              variant: "danger",
              onClick: act(function () {
                onDismiss(n.key);
              }),
            }
          : null;
        return h(ListRow, {
          key: n.key || i,
          marker: "*",
          primary: n.title ? who + " · " + n.title : who,
          secondary: n.text || "",
          meta: n.time ? relativeTime(n.time) : "",
          onClick: act(function () {
            openNotification(n.key);
          }),
          action: action,
        });
      })
    );
  }

  function CallLog(props) {
    var entries = props.entries || [];
    if (entries.length === 0) {
      return h(Section, { variant: "inset" }, h(Text, { variant: "dim" }, "NO RECENT CALLS."));
    }
    return h(
      "div",
      { className: "rows" },
      entries.map(function (c, i) {
        var t = byCallType(c.type);
        var named = c.name && c.name.length;
        var title = named ? c.name : c.number || "UNKNOWN";
        return h(ListRow, {
          key: i,
          marker: t.marker,
          tone: t.tone,
          primary: (title || "").toString().toUpperCase(),
          secondary: named ? c.number || "" : "",
          meta: relativeTime(c.date),
          onClick: act(function () {
            dial(c.number);
          }),
        });
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

    var body;
    if (contacts.length === 0) {
      body = h(Section, { variant: "inset" }, h(Text, { variant: "dim" }, "NO CONTACTS."));
    } else if (filtered.length === 0) {
      body = h(Text, { variant: "dim" }, "NO MATCHES.");
    } else {
      body = h(
        "div",
        { className: "rows" },
        filtered.map(function (c, i) {
          var named = c.name && c.name.length;
          return h(ListRow, {
            key: i,
            marker: ">",
            primary: (c.name || c.number || "UNKNOWN").toUpperCase(),
            secondary: named ? c.number || "" : "",
            onClick: act(function () {
              dial(c.number);
            }),
          });
        })
      );
    }

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
      body,
      h(Text, { variant: "dim", size: "xs" }, "Tap a contact to dial.")
    );
  }

  /* ============================================================ STAT screen */
  // READ-ONLY readouts. No controls/links here.
  function StatScreen(props) {
    var stats = props.stats;
    var net = props.net;
    var audio = props.audio;
    var display = props.display;

    if (!stats) {
      return h(
        Section,
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
      vitalsExtra.push("TEMP " + Math.round(Number(stats.batteryTemp)) + "C");
    if (stats.batteryHealth) vitalsExtra.push("HEALTH " + stats.batteryHealth);
    if (stats.batteryVoltage != null)
      vitalsExtra.push((Number(stats.batteryVoltage) / 1000).toFixed(2) + "V");

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
        statusItem("BLUETOOTH", net.bluetoothEnabled ? "ON" : "OFF", "default"),
      ];
      netPanel = h(Section, { title: "NETWORK", variant: "inset" }, h(StatusBar, { items: netItems }));
    }

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
        Section,
        { title: "AUDIO", variant: "inset" },
        kvRow("RINGER", audio.ringerMode || "--"),
        h("div", { style: { height: 8 } }),
        volBars
      );
    }

    var displayPanel = null;
    if (display) {
      displayPanel = h(
        Section,
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
        Section,
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
        Section,
        { title: "SYSTEM", variant: "inset" },
        kvRow("MODEL", (stats.manufacturer || "") + " " + (stats.model || "")),
        kvRow("ANDROID", stats.androidVersion + " (SDK " + stats.sdkInt + ")"),
        stats.securityPatch ? kvRow("SEC PATCH", stats.securityPatch) : null,
        kvRow("UPTIME", formatUptime(stats.uptimeMillis))
      )
    );
  }

  /* =========================================================== RADIO screen */
  // The ONLY controls + system access surface.
  function RadioScreen(props) {
    var flashOn = props.flashOn;
    var setFlashOn = props.setFlashOn;
    var access = props.access;

    var panels = [
      { id: "internet", label: "INTERNET" },
      { id: "wifi", label: "WIFI" },
      { id: "volume", label: "VOLUME" },
      { id: "nfc", label: "NFC" },
    ];

    var settingsShortcuts = [
      ["WIFI", "wifi"],
      ["BLUETOOTH", "bluetooth"],
      ["LOCATION", "location"],
      ["DISPLAY", "display"],
      ["SOUND", "sound"],
      ["DATE", "date"],
      ["BATTERY", "battery"],
      ["STORAGE", "storage"],
      ["APPS", "apps"],
    ];

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
          ? h(Text, { as: "span", variant: "body", size: "sm" }, "ON")
          : h(
              "div",
              { className: "access-row__btn" },
              h(Button, { variant: "warning", glow: false, onClick: act(onEnable) }, enableLabel)
            )
      );
    }

    return h(
      "div",
      { className: "stack" },
      h(
        Section,
        { title: "DEVICE CONTROLS" },
        h(Toggle, {
          checked: flashOn,
          label: "FLASHLIGHT",
          onChange: function (next) {
            var ok = setFlashlight(next);
            setFlashOn(ok ? next : flashOn);
            vibrate(10);
            setTimeout(function () {
              try {
                if (document.activeElement && document.activeElement.blur) {
                  document.activeElement.blur();
                }
              } catch (e) {}
            }, 0);
          },
        }),
        h("div", { style: { height: 10 } }),
        buttonGrid(
          panels.map(function (p) {
            return {
              id: p.id,
              label: p.label,
              variant: "primary",
              onClick: act(function () {
                openSettingsPanel(p.id);
              }),
            };
          })
        )
      ),
      h(
        Section,
        { title: "SETTINGS SHORTCUTS", variant: "inset" },
        buttonGrid(
          settingsShortcuts.map(function (s) {
            return {
              id: s[1],
              label: s[0],
              onClick: act(function () {
                openSettings(s[1]);
              }),
            };
          })
        ),
        h("div", { style: { height: 10 } }),
        h(
          Button,
          {
            variant: "primary",
            block: true,
            onClick: act(function () {
              openSettings("settings");
            }),
          },
          "SYSTEM SETTINGS"
        )
      ),
      h(
        Section,
        { title: "SYSTEM ACCESS" },
        accessRow(
          "DEFAULT LAUNCHER",
          access && access.defaultLauncher,
          "SET AS DEFAULT",
          requestDefaultLauncher
        ),
        accessRow("USAGE ACCESS", access && access.usageAccess, "ENABLE", openUsageAccessSettings),
        accessRow(
          "NOTIFICATION ACCESS",
          access && access.notificationAccess,
          "ENABLE",
          openNotificationAccessSettings
        )
      )
    );
  }

  /* ============================================================= TERM screen */
  // A REAL terminal: xterm.js (bundled) wired to a native PTY-backed shell over
  // AndroidBridge.term*(). The TERM body does NOT page-scroll — xterm manages
  // its own scrollback inside a flex:1 container. Quick chips just send input.
  var TERM_QUICK = ["getprop", "ps", "ls", "ip addr", "uptime"];

  // Pip-Boy palette for xterm. Colours only — sizing comes from CSS.
  var TERM_THEME = {
    background: "#0b1410",
    foreground: "#33ff66",
    cursor: "#7dff9e",
    cursorAccent: "#0b1410",
    selectionBackground: "#155f2c",
    black: "#07100c",
    red: "#ff4d4d",
    green: "#33ff66",
    yellow: "#ffb000",
    blue: "#1f9c45",
    magenta: "#7dff9e",
    cyan: "#1f9c45",
    white: "#7dff9e",
    brightBlack: "#155f2c",
    brightRed: "#ff4d4d",
    brightGreen: "#7dff9e",
    brightYellow: "#ffb000",
    brightBlue: "#33ff66",
    brightMagenta: "#7dff9e",
    brightCyan: "#33ff66",
    brightWhite: "#dfffe9",
  };

  // --- base64 <-> bytes helpers (guarded, WebView-safe) -------------------
  // Encode a JS string as UTF-8 then base64 (for termWrite input).
  function b64FromString(str) {
    try {
      var bytes;
      if (typeof window.TextEncoder !== "undefined") {
        bytes = new window.TextEncoder().encode(str);
      } else {
        // Manual UTF-8 encode fallback.
        var arr = [];
        for (var i = 0; i < str.length; i++) {
          var c = str.charCodeAt(i);
          if (c < 0x80) {
            arr.push(c);
          } else if (c < 0x800) {
            arr.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
          } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            // Surrogate pair -> astral codepoint.
            var c2 = str.charCodeAt(i + 1);
            var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
            i++;
            arr.push(
              0xf0 | (cp >> 18),
              0x80 | ((cp >> 12) & 0x3f),
              0x80 | ((cp >> 6) & 0x3f),
              0x80 | (cp & 0x3f)
            );
          } else {
            arr.push(
              0xe0 | (c >> 12),
              0x80 | ((c >> 6) & 0x3f),
              0x80 | (c & 0x3f)
            );
          }
        }
        bytes = arr;
      }
      var bin = "";
      for (var j = 0; j < bytes.length; j++) {
        bin += String.fromCharCode(bytes[j]);
      }
      return window.btoa(bin);
    } catch (e) {
      return "";
    }
  }

  // Decode a base64 string into a Uint8Array of raw bytes (for term.write).
  function bytesFromB64(b64) {
    try {
      var bin = window.atob(b64 || "");
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i) & 0xff;
      }
      return out;
    } catch (e) {
      return new Uint8Array(0);
    }
  }

  // Guarded bridge wrappers for the PTY contract.
  function termAvailable() {
    try {
      if (!hasBridge()) return false;
      var fn = bridge().termAvailable;
      if (typeof fn !== "function") return false;
      return !!fn.apply(bridge(), []);
    } catch (e) {
      return false;
    }
  }
  function termStart(cols, rows) {
    return callBool("termStart", [cols, rows]);
  }
  function termWrite(b64) {
    callBool("termWrite", [b64]);
  }
  function termResize(cols, rows) {
    callBool("termResize", [cols, rows]);
  }
  function termStop() {
    callBool("termStop", []);
  }

  function TerminalScreen(props) {
    var noBridge = props.noBridge;

    // Is the native PTY usable on this device? (false -> show a note.)
    var available = useMemo(
      function () {
        return !noBridge && termAvailable();
      },
      [noBridge]
    );

    var containerRef = useRef(null);
    // Mutable session handle held in a ref so the toolbar buttons can reach it.
    var sessRef = useRef(null);

    // Send a literal command line into the shell (quick chips).
    function sendInput(str) {
      var b64 = b64FromString(str);
      if (b64) termWrite(b64);
    }

    // --- lifecycle: create xterm on mount, dispose on unmount -------------
    useEffect(
      function () {
        if (!available) return undefined;
        if (typeof window.Terminal === "undefined") return undefined;

        var el = containerRef.current;
        if (!el) return undefined;

        var term;
        var fit;
        var exited = false;
        var fitTimer = null;
        var ro = null;
        var resizeDebounce = null;

        // Character size is user-adjustable by pinch-zoom and persisted.
        var fontSize = 14;
        try {
          var savedFs = parseInt(window.localStorage.getItem("pipboy.term.fontSize"), 10);
          if (savedFs >= 6 && savedFs <= 40) fontSize = savedFs;
        } catch (e) {}

        try {
          term = new window.Terminal({
            allowProposedApi: true,
            cursorBlink: true,
            fontFamily: "'Share Tech Mono','VT323',monospace",
            fontSize: fontSize,
            scrollback: 5000,
            convertEol: false,
            theme: TERM_THEME,
          });
          if (window.FitAddon && window.FitAddon.FitAddon) {
            fit = new window.FitAddon.FitAddon();
            term.loadAddon(fit);
          }
          term.open(el);
        } catch (e) {
          return undefined;
        }

        function doFit() {
          try {
            if (fit) fit.fit();
            termResize(term.cols, term.rows);
          } catch (e) {}
        }

        // Initial fit + start the shell. Fit again after a tick because the
        // container may not be sized on first paint.
        try {
          if (fit) fit.fit();
        } catch (e) {}
        try {
          termStart(term.cols, term.rows);
        } catch (e) {}
        fitTimer = setTimeout(function () {
          doFit();
          try {
            // Re-assert start (native just resizes if already running).
            termStart(term.cols, term.rows);
          } catch (e) {}
        }, 50);

        // Input -> shell.
        try {
          term.onData(function (d) {
            sendInput(d);
          });
        } catch (e) {}

        // Shell output -> terminal (raw bytes; xterm handles UTF-8/ANSI).
        function onOut(ev) {
          try {
            term.write(bytesFromB64(ev.detail));
          } catch (err) {}
        }
        // Process exit -> dim note + arm restart on next key.
        function onExit(ev) {
          exited = true;
          try {
            term.writeln("");
            term.writeln(
              "\x1b[2m[process exited: " +
                ev.detail +
                "] - press any key to RESTART\x1b[0m"
            );
          } catch (err) {}
        }

        try {
          window.addEventListener("pipboy:term", onOut);
          window.addEventListener("pipboy:term:exit", onExit);
        } catch (e) {}

        // Restart the shell on any keypress after exit.
        try {
          term.onKey(function () {
            if (exited) {
              exited = false;
              try {
                term.writeln("\x1b[2m[restarting...]\x1b[0m");
              } catch (err) {}
              termStart(term.cols, term.rows);
            }
          });
        } catch (e) {}

        // Resize handling: ResizeObserver if available, else window resize.
        function onResize() {
          if (resizeDebounce) clearTimeout(resizeDebounce);
          resizeDebounce = setTimeout(doFit, 80);
        }
        try {
          if (typeof window.ResizeObserver !== "undefined") {
            ro = new window.ResizeObserver(onResize);
            ro.observe(el);
          } else {
            window.addEventListener("resize", onResize);
          }
        } catch (e) {}

        // Focus so the (Pip-Boy-themed) keyboard opens. Tapping also focuses.
        try {
          term.focus();
        } catch (e) {}
        function onTap() {
          try {
            term.focus();
          } catch (err) {}
        }
        try {
          el.addEventListener("click", onTap);
        } catch (e) {}

        // --- pinch-zoom to set character size --------------------------------
        var pinchStartDist = 0;
        var pinchStartSize = fontSize;
        var pinchTimer = null;
        function touchDist(touches) {
          var dx = touches[0].clientX - touches[1].clientX;
          var dy = touches[0].clientY - touches[1].clientY;
          return Math.sqrt(dx * dx + dy * dy);
        }
        function onTouchStart(ev) {
          if (ev.touches && ev.touches.length === 2) {
            pinchStartDist = touchDist(ev.touches);
            pinchStartSize = fontSize;
            try { ev.preventDefault(); } catch (e) {}
          }
        }
        function onTouchMove(ev) {
          if (ev.touches && ev.touches.length === 2 && pinchStartDist > 0) {
            try { ev.preventDefault(); } catch (e) {}
            var ratio = touchDist(ev.touches) / pinchStartDist;
            var ns = Math.round(pinchStartSize * ratio);
            if (ns < 6) ns = 6;
            if (ns > 40) ns = 40;
            if (ns !== fontSize) {
              fontSize = ns;
              try { term.options.fontSize = ns; } catch (e) {}
              if (pinchTimer) clearTimeout(pinchTimer);
              pinchTimer = setTimeout(function () {
                doFit();
                try { window.localStorage.setItem("pipboy.term.fontSize", String(fontSize)); } catch (e) {}
              }, 30);
            }
          }
        }
        function onTouchEnd(ev) {
          if (!ev.touches || ev.touches.length < 2) pinchStartDist = 0;
        }
        try {
          el.addEventListener("touchstart", onTouchStart, { passive: false });
          el.addEventListener("touchmove", onTouchMove, { passive: false });
          el.addEventListener("touchend", onTouchEnd);
          el.addEventListener("touchcancel", onTouchEnd);
        } catch (e) {}

        // Expose for the toolbar buttons.
        sessRef.current = { term: term, fit: fit };

        return function cleanup() {
          try {
            if (fitTimer) clearTimeout(fitTimer);
          } catch (e) {}
          try {
            if (resizeDebounce) clearTimeout(resizeDebounce);
          } catch (e) {}
          try {
            window.removeEventListener("pipboy:term", onOut);
            window.removeEventListener("pipboy:term:exit", onExit);
          } catch (e) {}
          try {
            window.removeEventListener("resize", onResize);
          } catch (e) {}
          try {
            if (ro) ro.disconnect();
          } catch (e) {}
          try {
            el.removeEventListener("click", onTap);
          } catch (e) {}
          try {
            if (pinchTimer) clearTimeout(pinchTimer);
            el.removeEventListener("touchstart", onTouchStart);
            el.removeEventListener("touchmove", onTouchMove);
            el.removeEventListener("touchend", onTouchEnd);
            el.removeEventListener("touchcancel", onTouchEnd);
          } catch (e) {}
          // Keep the native shell alive across tab switches - do NOT termStop().
          try {
            term.dispose();
          } catch (e) {}
          sessRef.current = null;
        };
      },
      [available]
    );

    // --- toolbar actions ---------------------------------------------------
    function doClear() {
      var s = sessRef.current;
      if (s && s.term) {
        try {
          s.term.clear();
        } catch (e) {}
      }
    }
    function doKill() {
      termStop();
      var s = sessRef.current;
      if (s && s.term) {
        try {
          s.term.dispose();
        } catch (e) {}
      }
      sessRef.current = null;
    }

    // --- render ------------------------------------------------------------
    if (!available) {
      var note = noBridge
        ? "OFFLINE PREVIEW - shell unavailable without host bridge."
        : "PTY unavailable on this device.";
      return h(
        "div",
        { className: "term" },
        h(
          Section,
          { title: "TERMINAL", className: "term__panel" },
          h(Text, { variant: "dim" }, note)
        )
      );
    }

    // No toolbar — just the terminal surface.
    return h(
      "div",
      { className: "term" },
      h(
        Section,
        { title: "TERMINAL", className: "term__panel" },
        h("div", { className: "term__xterm", ref: containerRef })
      )
    );
  }

  /* ====================================================== notification popups */
  // A fixed top overlay that stacks transient "incoming transmission" cards.
  var NOTIF_POP_MAX = 3;
  var NOTIF_POP_TTL = 5000;

  function NotifPopups(props) {
    var onOpen = props.onOpen;

    var popsState = useState([]); // [{key, appLabel, title, text}]
    var pops = popsState[0], setPops = popsState[1];
    var timersRef = useRef({}); // key -> timeout id

    var remove = useCallback(function (key) {
      setPops(function (prev) {
        return prev.filter(function (p) {
          return p.key !== key;
        });
      });
      var t = timersRef.current[key];
      if (t) {
        clearTimeout(t);
        delete timersRef.current[key];
      }
    }, []);

    var arm = useCallback(
      function (key) {
        var existing = timersRef.current[key];
        if (existing) clearTimeout(existing);
        timersRef.current[key] = setTimeout(function () {
          remove(key);
        }, NOTIF_POP_TTL);
      },
      [remove]
    );

    useEffect(
      function () {
        function onNotify(e) {
          var detail = e.detail;
          if (typeof detail === "string") {
            detail = parseJson(detail, null);
          }
          if (!detail) return;
          var key = detail.key != null ? String(detail.key) : "n" + Date.now();
          var card = {
            key: key,
            appLabel: (detail.appLabel || detail.packageName || "TRANSMISSION").toString(),
            title: detail.title || "",
            text: detail.text || "",
          };
          setPops(function (prev) {
            var exists = false;
            var next = prev.map(function (p) {
              if (p.key === key) {
                exists = true;
                return card; // refresh contents
              }
              return p;
            });
            if (!exists) {
              next = next.concat([card]);
              if (next.length > NOTIF_POP_MAX) {
                var dropped = next.slice(0, next.length - NOTIF_POP_MAX);
                next = next.slice(next.length - NOTIF_POP_MAX);
                dropped.forEach(function (d) {
                  var dt = timersRef.current[d.key];
                  if (dt) {
                    clearTimeout(dt);
                    delete timersRef.current[d.key];
                  }
                });
              }
            }
            return next;
          });
          arm(key);
        }
        window.addEventListener("pipboy:notify", onNotify);
        return function () {
          window.removeEventListener("pipboy:notify", onNotify);
          var timers = timersRef.current;
          for (var k in timers) {
            if (timers.hasOwnProperty(k)) clearTimeout(timers[k]);
          }
          timersRef.current = {};
        };
      },
      [arm, remove]
    );

    if (!pops.length) return null;

    return h(
      "div",
      { className: "notif-pop-layer" },
      pops.map(function (p) {
        return h(
          "div",
          { key: p.key, className: "notif-pop" },
          h(
            Panel,
            { title: (p.appLabel || "").toUpperCase(), className: "notif-pop__panel" },
            h(
              "button",
              {
                type: "button",
                className: "notif-pop__card",
                onClick: act(function () {
                  onOpen(p.key);
                  remove(p.key);
                }),
              },
              h(Text, { as: "div", variant: "dim", size: "xs", className: "notif-pop__tag" }, "INCOMING TRANSMISSION"),
              p.title
                ? h(Text, { as: "div", variant: "bright", size: "sm", className: "notif-pop__title ellipsis" }, p.title)
                : null,
              p.text
                ? h(Text, { as: "div", variant: "dim", size: "xs", className: "notif-pop__text" }, p.text)
                : null
            ),
            h(
              "div",
              { className: "notif-pop__close" },
              h(
                Button,
                {
                  variant: "ghost",
                  glow: false,
                  onClick: act(function () {
                    remove(p.key);
                  }),
                },
                "X"
              )
            )
          )
        );
      })
    );
  }

  /* ============================================================= chrome bar */
  function SystemBar(props) {
    var stats = props.stats;
    var net = props.net;
    var notifCount = props.notifCount;
    var onNotif = props.onNotif;
    var noBridge = props.noBridge;
    var clock = props.clock; // { time, date } driven locally every 1s
    var speed = props.speed; // { rx, tx } bytes/sec, or null

    var battery = stats ? stats.batteryPct : null;
    var charging = stats && stats.charging;

    // BAT chip — fixed width so charging feedback doesn't reflow the bar.
    var batVal = padR((battery == null ? "--" : battery + "%"), 4) + (charging ? " CHG" : "    ");

    // SIG chip: wifi bars if connected, else mobile type, else nothing.
    var sigVal = "--";
    var sigTone = "danger";
    if (net) {
      if (net.wifiEnabled && net.wifiSignalLevel != null && net.wifiSignalLevel >= 0) {
        sigVal = signalBars(net.wifiSignalLevel);
        sigTone = "default";
      } else if (net.mobileNetworkType) {
        sigVal = net.mobileNetworkType;
        sigTone = "default";
      } else if (net.dataConnected) {
        sigVal = "LINK";
        sigTone = "default";
      } else {
        sigVal = "NONE";
        sigTone = "danger";
      }
    }
    sigVal = padR(sigVal, 5); // fixed width so SIG changes don't shift the row

    // NET chip: live up/down throughput — FIXED WIDTH so it never reflows.
    var netVal = speed
      ? "↓" + speedTokenFixed(speed.rx) + " ↑" + speedTokenFixed(speed.tx)
      : "↓" + padL("-", 6) + " ↑" + padL("-", 6);

    var items = [
      statusItem("BAT", batVal, batteryTone(battery)),
      statusItem("SIG", sigVal, sigTone),
      statusItem("NET", netVal, "default"),
      statusItem("NOTIF", String(notifCount || 0), "default"),
    ];

    var timeStr = clock && clock.time ? clock.time : (stats && stats.time ? stats.time : "--:--");
    var dateStr = clock && clock.date ? clock.date : (stats && stats.date ? stats.date : "----");

    return h(
      "div",
      { className: "sysbar" },
      h(
        "div",
        { className: "sysbar__clock" },
        h(Heading, { level: 1 }, timeStr),
        h(Text, { variant: "dim", size: "sm" }, dateStr)
      ),
      h(
        "button",
        { type: "button", className: "sysbar__vitals", onClick: act(onNotif), "aria-label": "notifications" },
        h(StatusBar, { items: items }),
        noBridge
          ? h(Text, { as: "div", variant: "dim", size: "xs" }, "OFFLINE PREVIEW")
          : null
      )
    );
  }

  /* ================================================================ App root */
  function App() {
    var tabState = useState(function () {
      var t = lsGetRaw(TAB_KEY, "apps");
      // Migrate legacy tab ids that no longer exist.
      if (t === "home" || t === "inv") t = "apps";
      return t;
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
    var smsState = useState([]);
    var permsState = useState({ callLog: false, contacts: false, phone: false, sms: false });
    var flashState = useState(false);
    var actionPkgState = useState(null);

    var usageState = useState([]);
    var notifsState = useState([]);
    var accessState = useState({ defaultLauncher: false, usageAccess: false, notificationAccess: false });
    var netState = useState(null);
    var audioState = useState(null);
    var displayState = useState(null);

    // Live local clock (1s) — independent of the 10s stats poll.
    var clockState = useState(function () {
      return clockNow();
    });
    // Live network throughput (computed from getTraffic samples on a 2s interval).
    var speedState = useState(null);
    var trafficRef = useRef(null);

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
    var sms = smsState[0], setSms = smsState[1];
    var perms = permsState[0], setPerms = permsState[1];
    var clock = clockState[0], setClock = clockState[1];
    var speed = speedState[0], setSpeed = speedState[1];
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

    // Access + usage + notifications (notif count needed by chrome on every tab).
    var refreshLazy = useCallback(function () {
      var ax = getAccessState();
      setAccess(ax);
      setUsage(ax.usageAccess ? getUsageStats(20) : []);
      setNotifs(ax.notificationAccess ? getNotifications() : []);
    }, []);

    // Network is needed by the chrome SIG chip (every tab) and STAT detail.
    var refreshNetwork = useCallback(function () {
      setNet(getNetworkInfo());
    }, []);

    // STAT-only heavier reads.
    var refreshStatDetail = useCallback(function () {
      setNet(getNetworkInfo());
      setAudio(getAudioInfo());
      setDisplay(getDisplayInfo());
    }, []);

    // Full data refresh.
    var refreshAll = useCallback(function () {
      setStats(getDeviceStats());
      setApps(getApps());
      var p = getPermissions();
      setPerms(p);
      setCallLog(p.callLog ? getCallLog(100) : []);
      setContacts(p.contacts ? getContacts() : []);
      setSms(p.sms ? getSms(80) : []);
      refreshLazy();
      refreshNetwork();
      if (tabRef.current === "stat") refreshStatDetail();
    }, [refreshLazy, refreshNetwork, refreshStatDetail]);

    // Lightweight poll for battery / signal chips.
    var refreshStats = useCallback(function () {
      var s = getDeviceStats();
      if (s) setStats(s);
      setNet(getNetworkInfo());
    }, []);

    // Sample cumulative traffic counters; derive a per-second rate vs the prior
    // sample. Skip the first tick (no baseline) and ignore counter resets.
    var tickTraffic = useCallback(function () {
      var t = getTraffic();
      if (!t || t.timestamp == null) {
        return;
      }
      var prev = trafficRef.current;
      trafficRef.current = t;
      if (!prev) {
        return; // first sample establishes the baseline
      }
      var dt = (Number(t.timestamp) - Number(prev.timestamp)) / 1000;
      if (!(dt > 0)) {
        return;
      }
      var dRx = Number(t.rxBytes) - Number(prev.rxBytes);
      var dTx = Number(t.txBytes) - Number(prev.txBytes);
      setSpeed({
        rx: Math.max(0, dRx) / dt,
        tx: Math.max(0, dTx) / dt,
      });
    }, []);

    useEffect(
      function () {
        refreshAll();
        function onRefresh() {
          refreshAll();
        }
        window.addEventListener("pipboy:refresh", onRefresh);
        var ivStats = setInterval(refreshStats, 10000);
        var ivClock = setInterval(function () {
          setClock(clockNow());
        }, 1000);
        var ivTraffic = setInterval(tickTraffic, 2000);
        return function () {
          window.removeEventListener("pipboy:refresh", onRefresh);
          clearInterval(ivStats);
          clearInterval(ivClock);
          clearInterval(ivTraffic);
        };
      },
      [refreshAll, refreshStats, tickTraffic]
    );

    // When switching into STAT, fetch the heavier network/audio/display data.
    useEffect(
      function () {
        if (tab === "stat") refreshStatDetail();
      },
      [tab, refreshStatDetail]
    );

    // ---- favorites / hidden mutators ----
    var toggleFavorite = useCallback(function (pkg) {
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
    }, []);
    var toggleHidden = useCallback(function (pkg) {
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
    }, []);

    var dismissAndRefresh = useCallback(function (key) {
      dismissNotification(key);
      setNotifs(getNotifications());
    }, []);

    var goNotifs = useCallback(function () {
      setTab("data");
      dataTabState[1]("notifs");
    }, [setTab]);

    var mainTabs = [
      { id: "apps", label: "APPS" },
      { id: "data", label: "DATA" },
      { id: "term", label: "TERM" },
      { id: "stat", label: "STAT" },
      { id: "radio", label: "RADIO" },
    ];

    var body;
    if (tab === "data") {
      body = h(DataScreen, {
        perms: perms,
        callLog: callLog,
        contacts: contacts,
        sms: sms,
        notifs: notifs,
        notifAccess: access && access.notificationAccess,
        dataTab: dataTabState[0],
        setDataTab: dataTabState[1],
        onDismiss: dismissAndRefresh,
      });
    } else if (tab === "term") {
      // TERM is rendered by a PERSISTENT host below (kept mounted so the
      // terminal preserves its state across tab switches / backgrounding).
      body = null;
    } else if (tab === "stat") {
      body = h(StatScreen, { stats: stats, net: net, audio: audio, display: display });
    } else if (tab === "radio") {
      body = h(RadioScreen, {
        flashOn: flashState[0],
        setFlashOn: flashState[1],
        access: access,
      });
    } else {
      body = h(AppsScreen, {
        apps: apps,
        favorites: favorites,
        hidden: hidden,
        usage: usage,
        access: access,
        onLaunch: launchApp,
        onLongPress: function (pkg) {
          setActionPkg(pkg);
        },
      });
    }

    // ---- app-action modal (long-pressed app in APPS) ----
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

    var notifCount = notifs ? notifs.length : 0;

    return h(
      Screen,
      null,
      h(
        "div",
        { className: "app" },
        h(
          "div",
          { className: "app__chrome" },
          h(SystemBar, {
            stats: stats,
            net: net,
            notifCount: notifCount,
            onNotif: goNotifs,
            noBridge: !hasBridge(),
            clock: clock,
            speed: speed,
          }),
          h(
            "div",
            { className: "app__tabs" },
            h(Tabs, { tabs: mainTabs, value: tab, onChange: setTab })
          )
        ),
        h(
          "div",
          { className: "app__body" },
          body,
          // Persistent terminal host: always mounted so the xterm buffer + the
          // shell session survive tab switches and the app going to background;
          // only shown on the TERM tab.
          h(
            "div",
            {
              className: "term-host",
              style: { display: tab === "term" ? "flex" : "none" },
            },
            h(TerminalScreen, { noBridge: !hasBridge() })
          )
        )
      ),
      h(NotifPopups, { onOpen: openNotification }),
      modal
    );
  }

  /* ----------------------------------------------------------------- mount */
  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
})();
