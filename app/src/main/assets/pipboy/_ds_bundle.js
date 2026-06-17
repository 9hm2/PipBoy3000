/* @ds-bundle: {"namespace":"PipBoy","components":[{"name":"Button","sourcePath":"components/general/Button/Button.jsx"},{"name":"Heading","sourcePath":"components/general/Heading/Heading.jsx"},{"name":"Input","sourcePath":"components/general/Input/Input.jsx"},{"name":"Menu","sourcePath":"components/general/Menu/Menu.jsx"},{"name":"Modal","sourcePath":"components/general/Modal/Modal.jsx"},{"name":"Panel","sourcePath":"components/general/Panel/Panel.jsx"},{"name":"ProgressBar","sourcePath":"components/general/ProgressBar/ProgressBar.jsx"},{"name":"Screen","sourcePath":"components/general/Screen/Screen.jsx"},{"name":"StatusBar","sourcePath":"components/general/StatusBar/StatusBar.jsx"},{"name":"Tabs","sourcePath":"components/general/Tabs/Tabs.jsx"},{"name":"Text","sourcePath":"components/general/Text/Text.jsx"},{"name":"Toggle","sourcePath":"components/general/Toggle/Toggle.jsx"},{"name":"Tooltip","sourcePath":"components/general/Tooltip/Tooltip.jsx"}],"sourceHashes":{"components/general/Button/Button.jsx":"d5c48c220be3","components/general/Button/Button.d.ts":"6e0adc3c6af3","components/general/Button/Button.prompt.md":"182b4c283b94","components/general/Heading/Heading.jsx":"f9315966fbe5","components/general/Heading/Heading.d.ts":"93b5768069a2","components/general/Heading/Heading.prompt.md":"6dab456418bf","components/general/Input/Input.jsx":"b55e63b767a4","components/general/Input/Input.d.ts":"8f522cccc874","components/general/Input/Input.prompt.md":"698b0b6533d5","components/general/Menu/Menu.jsx":"e9253bf514c3","components/general/Menu/Menu.d.ts":"39d2ef310402","components/general/Menu/Menu.prompt.md":"e911f3e6e1ea","components/general/Modal/Modal.jsx":"370abc4da33a","components/general/Modal/Modal.d.ts":"3022898497d5","components/general/Modal/Modal.prompt.md":"6fb9454c8322","components/general/Panel/Panel.jsx":"30b2b99355ee","components/general/Panel/Panel.d.ts":"5be815768ef3","components/general/Panel/Panel.prompt.md":"916f8b5a7adf","components/general/ProgressBar/ProgressBar.jsx":"1d7bd33d00d9","components/general/ProgressBar/ProgressBar.d.ts":"410473cdc008","components/general/ProgressBar/ProgressBar.prompt.md":"c3ca10e3231a","components/general/Screen/Screen.jsx":"978f23efec0f","components/general/Screen/Screen.d.ts":"1768dddacb1c","components/general/Screen/Screen.prompt.md":"900d8818d088","components/general/StatusBar/StatusBar.jsx":"2f1d4efe9b9e","components/general/StatusBar/StatusBar.d.ts":"ef8e5db3aec4","components/general/StatusBar/StatusBar.prompt.md":"1beda98c6c88","components/general/Tabs/Tabs.jsx":"9da64a524f0d","components/general/Tabs/Tabs.d.ts":"3ec859f96b17","components/general/Tabs/Tabs.prompt.md":"83450203309a","components/general/Text/Text.jsx":"14e898a5e518","components/general/Text/Text.d.ts":"8cadcd08fc4b","components/general/Text/Text.prompt.md":"e00f4cb0588a","components/general/Toggle/Toggle.jsx":"7936e003cfe7","components/general/Toggle/Toggle.d.ts":"14d74ca14d57","components/general/Toggle/Toggle.prompt.md":"3b7e7436e910","components/general/Tooltip/Tooltip.jsx":"96079a72352a","components/general/Tooltip/Tooltip.d.ts":"3f0c03d0b7d5","components/general/Tooltip/Tooltip.prompt.md":"132c8075913d"},"inlinedExternals":[],"builtBy":"cc-design-sync"} */
"use strict";
var PipBoy = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function jsx2(t, p, k) {
        return R.createElement(t, k === void 0 ? p : Object.assign({ key: k }, p));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsx2;
      module.exports.jsxDEV = jsx2;
      module.exports.Fragment = R.Fragment;
    }
  });

  // dist/index.js
  var index_exports = {};
  __export(index_exports, {
    Button: () => Button,
    Heading: () => Heading,
    Input: () => Input,
    Menu: () => Menu,
    Modal: () => Modal,
    Panel: () => Panel,
    ProgressBar: () => ProgressBar,
    Screen: () => Screen,
    StatusBar: () => StatusBar,
    Tabs: () => Tabs,
    Text: () => Text,
    Toggle: () => Toggle,
    Tooltip: () => Tooltip,
    cx: () => cx
  });
  init_define_import_meta_env();
  var React3 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  function cx(...parts) {
    return parts.filter(Boolean).join(" ");
  }
  var Screen = React3.forwardRef(
    ({ flat, className, children, ...rest }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        ref,
        className: cx("pip-root", "pip-screen", flat && "pip-screen--flat", className),
        ...rest,
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pip-screen__inner", children })
      }
    )
  );
  Screen.displayName = "Screen";
  var Button = React3.forwardRef(
    ({ variant = "primary", block, glow = true, className, children, type, ...rest }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        ref,
        type: type ?? "button",
        className: cx(
          "pip-btn",
          "pip-focusable",
          `pip-btn--${variant}`,
          block && "pip-btn--block",
          glow && "pip-btn--glow",
          className
        ),
        ...rest,
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-btn__label", children })
      }
    )
  );
  Button.displayName = "Button";
  var Input = React3.forwardRef(
    ({ label, hint, invalid, className, id, ...rest }, ref) => {
      const reactId = React3.useId();
      const fieldId = id ?? reactId;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cx("pip-field", invalid && "pip-field--invalid", className), children: [
        label && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "pip-field__label", htmlFor: fieldId, children: label }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pip-field__control", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-field__caret", "aria-hidden": "true", children: ">" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              ref,
              id: fieldId,
              className: "pip-field__input pip-focusable",
              "aria-invalid": invalid || void 0,
              ...rest
            }
          )
        ] }),
        hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "pip-field__hint", children: hint })
      ] });
    }
  );
  Input.displayName = "Input";
  var Panel = React3.forwardRef(
    ({ title, variant = "default", className, children, ...rest }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        ref,
        className: cx("pip-panel", `pip-panel--${variant}`, className),
        ...rest,
        children: [
          title != null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pip-panel__title", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-panel__title-text", children: title }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pip-panel__body", children })
        ]
      }
    )
  );
  Panel.displayName = "Panel";
  var Text = React3.forwardRef(
    ({ as = "p", variant = "body", size = "base", className, ...rest }, ref) => {
      const Tag = as;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Tag,
        {
          ref,
          className: cx("pip-text", `pip-text--${variant}`, `pip-text--${size}`, className),
          ...rest
        }
      );
    }
  );
  Text.displayName = "Text";
  var Heading = React3.forwardRef(
    ({ level = 1, className, children, ...rest }, ref) => {
      const Tag = `h${level}`;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Tag,
        {
          ref,
          className: cx("pip-heading", `pip-heading--${level}`, className),
          ...rest,
          children
        }
      );
    }
  );
  Heading.displayName = "Heading";
  var ProgressBar = React3.forwardRef(
    ({ value, max = 100, variant = "primary", label, showValue, className, ...rest }, ref) => {
      const clamped = Math.min(Math.max(value, 0), max);
      const pct = max > 0 ? clamped / max * 100 : 0;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          ref,
          className: cx("pip-progress", `pip-progress--${variant}`, className),
          ...rest,
          children: [
            (label != null || showValue) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pip-progress__meta", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-progress__label", children: label }),
              showValue && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pip-progress__value", children: [
                Math.round(clamped),
                " / ",
                max
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "div",
              {
                className: "pip-progress__track",
                role: "progressbar",
                "aria-valuenow": clamped,
                "aria-valuemin": 0,
                "aria-valuemax": max,
                children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pip-progress__fill", style: { width: `${pct}%` } })
              }
            )
          ]
        }
      );
    }
  );
  ProgressBar.displayName = "ProgressBar";
  var StatusBar = React3.forwardRef(
    ({ items, className, ...rest }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref, className: cx("pip-statusbar", className), ...rest, children: items.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pip-statusbar__item", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-statusbar__label", children: item.label }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "span",
        {
          className: cx(
            "pip-statusbar__value",
            item.tone && item.tone !== "default" && `pip-statusbar__value--${item.tone}`
          ),
          children: item.value
        }
      )
    ] }, `${item.label}-${i}`)) })
  );
  StatusBar.displayName = "StatusBar";
  var Menu = React3.forwardRef(
    ({ items, value, onSelect, className, ...rest }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { ref, className: cx("pip-menu", className), role: "menu", ...rest, children: items.map((item) => {
      const selected = item.id === value;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { role: "none", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          role: "menuitemradio",
          "aria-checked": selected,
          disabled: item.disabled,
          className: cx(
            "pip-menu__item",
            "pip-focusable",
            selected && "pip-menu__item--selected"
          ),
          onClick: () => !item.disabled && onSelect?.(item.id),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-menu__marker", "aria-hidden": "true", children: selected ? "\u25B6" : "\xA0" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-menu__label", children: item.label })
          ]
        }
      ) }, item.id);
    }) })
  );
  Menu.displayName = "Menu";
  var Tabs = React3.forwardRef(
    ({ tabs, value, onChange, className, ...rest }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        ref,
        className: cx("pip-tabs", className),
        role: "tablist",
        ...rest,
        children: tabs.map((tab) => {
          const active = tab.id === value;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": active,
              disabled: tab.disabled,
              className: cx(
                "pip-tabs__tab",
                "pip-focusable",
                active && "pip-tabs__tab--active"
              ),
              onClick: () => !tab.disabled && onChange(tab.id),
              children: tab.label
            },
            tab.id
          );
        })
      }
    )
  );
  Tabs.displayName = "Tabs";
  var Toggle = React3.forwardRef(
    ({ checked, onChange, label, className, disabled, ...rest }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        ref,
        type: "button",
        role: "switch",
        "aria-checked": checked,
        disabled,
        className: cx(
          "pip-toggle",
          "pip-focusable",
          checked && "pip-toggle--on",
          className
        ),
        onClick: () => !disabled && onChange(!checked),
        ...rest,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-toggle__track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-toggle__thumb" }) }),
          label != null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-toggle__label", children: label })
        ]
      }
    )
  );
  Toggle.displayName = "Toggle";
  function Modal({
    open,
    onClose,
    title,
    children,
    footer,
    className
  }) {
    React3.useEffect(() => {
      if (!open) return;
      const onKey = (e) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);
    if (!open) return null;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pip-modal", role: "presentation", onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        className: cx("pip-modal__dialog", className),
        role: "dialog",
        "aria-modal": "true",
        onClick: (e) => e.stopPropagation(),
        children: [
          title != null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pip-modal__title", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-modal__title-text", children: title }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "pip-modal__close pip-focusable",
                "aria-label": "Close",
                onClick: onClose,
                children: "\u2715"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pip-modal__body", children }),
          footer != null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pip-modal__footer", children: footer })
        ]
      }
    ) });
  }
  Modal.displayName = "Modal";
  var Tooltip = React3.forwardRef(
    ({ label, side = "top", className, children, ...rest }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "span",
      {
        ref,
        className: cx("pip-tooltip", `pip-tooltip--${side}`, className),
        tabIndex: 0,
        ...rest,
        children: [
          children,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pip-tooltip__bubble", role: "tooltip", children: label })
        ]
      }
    )
  );
  Tooltip.displayName = "Tooltip";
  return __toCommonJS(index_exports);
})();
window.PipBoy=PipBoy.__dsMainNs?Object.assign({},PipBoy,PipBoy.__dsMainNs,{__dsMainNs:undefined}):PipBoy;
