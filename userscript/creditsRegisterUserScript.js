// ==UserScript==
// @name         Ha"better"UI
// @namespace    https://sv.haui.edu.vn/
// @version      1.0.0
// @description  Captcha‑free module browser, class scanner, and auto‑sniper with beautiful UI
// @author       LiLQD
// @match        https://sv.haui.edu.vn/register/*
// @match        https://sv.haui.edu.vn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // CORE API
  const BASE = "https://sv.haui.edu.vn";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const DAY_ORDER = [2, 3, 4, 5, 6, 7, 1];
  const DAY_LABELS = {
    2: "Thứ 2",
    3: "Thứ 3",
    4: "Thứ 4",
    5: "Thứ 5",
    6: "Thứ 6",
    7: "Thứ 7",
    1: "Chủ nhật",
  };

  const state =
    window.__haui ||
    (window.__haui = {
      modules: [],
      lastClasses: [],
      scannedClasses: [],
      monitors: {},
    });
  state.modules = Array.isArray(state.modules) ? state.modules : [];
  state.lastClasses = Array.isArray(state.lastClasses) ? state.lastClasses : [];
  state.scannedClasses = Array.isArray(state.scannedClasses)
    ? state.scannedClasses
    : [];
  state.monitors = state.monitors || {};

  Object.defineProperties(window, {
    __haui_modules: {
      configurable: true,
      get: () => state.modules,
      set: (value) => {
        state.modules = Array.isArray(value) ? value : [];
      },
    },
    __haui_last_classes: {
      configurable: true,
      get: () => state.lastClasses,
      set: (value) => {
        state.lastClasses = Array.isArray(value) ? value : [];
      },
    },
    __haui_scanned_classes: {
      configurable: true,
      get: () => state.scannedClasses,
      set: (value) => {
        state.scannedClasses = Array.isArray(value) ? value : [];
      },
    },
  });

  function toID(value) {
    return value == null ? "" : String(value).trim();
  }

  function safeJSONParse(value, fallback) {
    if (value == null || value === "") return fallback;
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[char];
    });
  }

  function escapeAttribute(value) {
    return escapeHTML(value).replace(/`/g, "&#96;");
  }

  async function fetchAPI(cmd, body = "", options = {}) {
    if (!window.kverify) {
      throw new Error(
        "Missing or expired window.kverify. Refresh the HaUI page and log in again if needed.",
      );
    }
    const url = `${BASE}/ajax/register/action.htm?cmd=${cmd}&v=${window.kverify}`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
        },
        body,
        credentials: "include",
        signal: options.signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      throw new Error(`Network error while calling ${cmd}: ${err.message}`);
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} ${res.statusText || ""} while calling ${cmd}`.trim(),
      );
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response while calling ${cmd}`);
    }

    if (data.err !== 0) {
      throw new Error(
        `API error while calling ${cmd}: ${data.msg || data.err}`,
      );
    }
    return data;
  }

  // MODULE LIST
  function extractModules(raw) {
    const result = [];
    const add = (arr, group) => {
      if (Array.isArray(arr))
        result.push(
          ...arr.map((m) => ({ id: m.ModulesID, name: m.ModulesName, group })),
        );
    };
    add(raw.BatBuoc, "Bắt buộc");
    raw.TuChon?.forEach((g) => add(g.ListModulesTC, "Tự chọn"));
    add(raw.TuongDuong, "Tương đương");
    return result;
  }

  async function getAllModules() {
    const data = await fetchAPI("tranning");
    const modules = extractModules(data.data[0].ChuongTrinh1);
    state.modules = modules;
    return modules;
  }

  async function getClassesForModule(fid, options = {}) {
    const data = await fetchAPI("classbymodulesid", `fid=${fid}`, options);
    return data.data;
  }

  // REGISTRATION
  async function regist(independentClassID) {
    const data = await fetchAPI("addclass", `class=${independentClassID}`);
    return data;
  }

  async function removeClass(independentClassID) {
    const data = await fetchAPI("removeclass", `class=${independentClassID}`);
    return data;
  }

  // FORMATTING
  function parseListDate(listDate) {
    const parsed = safeJSONParse(listDate, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function parseTeachers(giaoVien) {
    const parsed = safeJSONParse(giaoVien, []);
    if (Array.isArray(parsed)) {
      const names = parsed.map((t) => t?.Fullname).filter(Boolean);
      return names.length ? names.join(", ") : "";
    }
    return typeof parsed === "string" ? parsed : "";
  }

  function parseSchedule(listDate) {
    const list = parseListDate(listDate);
    const grouped = {};
    list.forEach(({ DayStudy, StudyTime }) => {
      if (!StudyTime) return;
      const dayKey = Number(DayStudy);
      const key = Number.isNaN(dayKey) ? String(DayStudy || "Khác") : dayKey;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(StudyTime);
    });
    const orderedKeys = Object.keys(grouped).sort((a, b) => {
      const ai = DAY_ORDER.indexOf(Number(a));
      const bi = DAY_ORDER.indexOf(Number(b));
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return String(a).localeCompare(String(b), "vi");
    });
    return orderedKeys
      .map(
        (day) =>
          `${DAY_LABELS[day] || `Ngày ${day}`}: ${grouped[day].join(", ")}`,
      )
      .join("; ");
  }

  function parseLocation(listDate, branch) {
    const list = parseListDate(listDate);
    const rooms = [...new Set(list.map((e) => e.RoomName).filter(Boolean))];
    const roomPart = rooms.length ? "Phòng học: " + rooms.join(", ") : "";
    return [roomPart, branch].filter(Boolean).join(" - ");
  }

  function formatMoney(amount) {
    if (amount == null) return "";
    return Number(amount).toLocaleString("vi-VN");
  }

  function normalizeClass(c, moduleMeta = {}) {
    const scheduleData = parseListDate(c.ListDate);
    const fid = moduleMeta.id ?? c.__fid ?? c.ModulesID ?? c.fid ?? "";
    return {
      raw: c,
      fid,
      classID: c.IndependentClassID,
      moduleName: c.ModulesName || moduleMeta.name || "",
      classCode: c.ClassCode || "",
      className: c.ClassName || "",
      countS: Number(c.CountS ?? 0),
      maxStudent: Number(c.MaxStudent ?? 0),
      teacher: parseTeachers(c.GiaoVien),
      startDate: c.StartDate || "",
      branch: c.BranchName || "",
      location: parseLocation(scheduleData, c.BranchName),
      schedule: parseSchedule(scheduleData),
      costs: c.Costs,
      isLock: c.IsLock,
    };
  }

  function formatClassForDisplay(c, moduleMeta = {}) {
    const n = normalizeClass(c, moduleMeta);
    return {
      FID: n.fid,
      "Class ID": n.classID,
      "Mã lớp": n.classCode,
      "Tên lớp": n.className,
      "Học phần": n.moduleName,
      "Sĩ số": `${n.countS}/${n.maxStudent}`,
      "Còn chỗ": n.countS < n.maxStudent ? "Có" : "Không",
      "Giáo viên": n.teacher,
      "Bắt đầu": n.startDate,
      "Địa điểm": n.location,
      "Lịch học": n.schedule,
      "Học phí": n.costs == null ? "" : `${formatMoney(n.costs)} VNĐ`,
      Khóa: n.isLock ? "Có" : "Không",
    };
  }

  function printDetailedClasses(classes, moduleMeta = {}) {
    const rows = (classes || []).map((c) =>
      formatClassForDisplay(c, moduleMeta),
    );
    console.table(rows);
    return rows;
  }

  async function ensureModulesLoaded() {
    if (state.modules.length) {
      modules = state.modules;
      return state.modules;
    }
    modules = await getAllModules();
    return modules;
  }

  async function showModules(options = {}) {
    const { clear = true } = options;
    const loaded = await ensureModulesLoaded();
    if (clear && typeof console.clear === "function") console.clear();
    console.table(
      loaded.map((m) => ({
        FID: m.id,
        "Học phần": m.name,
        Nhóm: m.group,
      })),
    );
    return loaded;
  }

  async function showClasses(keyword = "") {
    const loaded = await ensureModulesLoaded();
    const query = toID(keyword).toLowerCase();
    const matched = loaded.filter(
      (m) =>
        !query ||
        toID(m.id) === query ||
        (m.name || "").toLowerCase().includes(query),
    );

    if (!matched.length) {
      console.warn(`No modules matched "${keyword}".`);
      return [];
    }

    const allClasses = [];
    for (const mod of matched) {
      console.group(`${mod.name} (FID: ${mod.id})`);
      try {
        const classes = (await getClassesForModule(mod.id)).map((c) => ({
          ...c,
          __fid: mod.id,
        }));
        allClasses.push(...classes);
        printDetailedClasses(classes, mod);
      } catch (err) {
        console.error(
          `Failed to load ${mod.name} (FID: ${mod.id}): ${err.message}`,
        );
      } finally {
        console.groupEnd();
      }
    }

    state.lastClasses = allClasses;
    return allClasses;
  }

  async function getClassByID(idOrKeyword) {
    const id = toID(idOrKeyword);
    const loaded = await ensureModulesLoaded();
    const moduleMatch = loaded.find((m) => toID(m.id) === id);
    if (moduleMatch) {
      return showClasses(moduleMatch.id);
    }

    const cachedClasses = [...state.lastClasses, ...state.scannedClasses];
    const classMatches = cachedClasses.filter(
      (c) => toID(c.IndependentClassID) === id,
    );
    if (classMatches.length) {
      printDetailedClasses(classMatches);
      return classMatches;
    }

    const nameMatches = loaded.filter((m) =>
      (m.name || "").toLowerCase().includes(id.toLowerCase()),
    );
    if (nameMatches.length) return showClasses(idOrKeyword);

    console.warn(
      `No loaded module or cached class matched "${idOrKeyword}". Run showModules(), showClasses(keyword), or scanAllModules() first.`,
    );
    return [];
  }

  async function scanAllModules(options = {}) {
    const {
      onlyOpen = false,
      delay = 300,
      jitter = 200,
      clear = false,
      logEvery = 20,
    } = options;
    const loaded = await ensureModulesLoaded();
    if (clear && typeof console.clear === "function") console.clear();

    const allClasses = [];
    for (let i = 0; i < loaded.length; i++) {
      const mod = loaded[i];
      try {
        const classes = (await getClassesForModule(mod.id)).map((c) => ({
          ...c,
          __fid: mod.id,
        }));
        const filtered = onlyOpen
          ? classes.filter((c) => Number(c.CountS) < Number(c.MaxStudent))
          : classes;
        allClasses.push(...filtered);
      } catch (err) {
        console.error(
          `Scan error ${mod.name} (FID: ${mod.id}): ${err.message}`,
        );
      }

      if (logEvery && (i + 1) % logEvery === 0) {
        console.info(`Scanned ${i + 1}/${loaded.length} modules...`);
      }
      if (i < loaded.length - 1) await sleep(delay + Math.random() * jitter);
    }

    state.scannedClasses = allClasses;
    console.info(
      `Scan complete: ${allClasses.length} class(es). Each row includes FID and Class ID.`,
    );
    printDetailedClasses(allClasses);
    return allClasses;
  }

  function startMonitoring(fid, options = {}) {
    const {
      classID,
      classCode,
      filterFn,
      interval = 6700,
      jitter = 2000,
      maxErrors = 5,
      maxAttempts = 0,
    } = options;
    if (!validateMonitorTiming(interval, jitter)) {
      return null;
    }

    const targetKey = getMonitorTargetKey(fid, options);
    const existingMonitor = Object.values(state.monitors).find(
      (monitor) =>
        monitor?.targetKey === targetKey &&
        typeof monitor.getStatus === "function" &&
        !monitor.getStatus().stopped,
    );
    if (existingMonitor) {
      console.warn(
        "A monitor is already running for this target. Duplicate monitor blocked.",
      );
      return existingMonitor;
    }

    const monitorId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let attempts = 0;
    let consecutiveErrors = 0;
    let stopped = false;
    let timeoutId = null;
    let controller = null;
    let lastCheckAt = null;
    let lastError = null;
    let lastTarget = null;
    let lastSeats = null;

    const status = () => ({
      fid,
      attempts,
      consecutiveErrors,
      stopped,
      lastSeats,
      lastCheckAt,
      lastError,
      lastTarget,
      maxAttempts,
      maxErrors,
    });

    const stop = (reason = "Stopped") => {
      if (stopped) return;
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (controller) controller.abort();
      delete state.monitors[monitorId];
      console.info(`Monitor stopped: ${reason}`);
    };

    const findTarget = (classes) => {
      if (classID != null) {
        return classes.find(
          (c) => toID(c.IndependentClassID) === toID(classID),
        );
      }
      if (classCode != null) {
        return classes.find((c) => toID(c.ClassCode) === toID(classCode));
      }
      if (typeof filterFn === "function") return classes.find(filterFn);
      return classes.find((c) => Number(c.CountS) < Number(c.MaxStudent));
    };

    const scheduleNext = () => {
      if (stopped) return;
      if (maxAttempts > 0 && attempts >= maxAttempts) {
        stop(`Reached maxAttempts (${maxAttempts})`);
        return;
      }
      const nextDelay = Math.max(
        1000,
        interval + (Math.random() * 2 - 1) * jitter,
      );
      timeoutId = setTimeout(check, nextDelay);
    };

    const check = async () => {
      if (stopped) return;
      if (maxAttempts > 0 && attempts >= maxAttempts) {
        stop(`Reached maxAttempts (${maxAttempts})`);
        return;
      }

      attempts++;
      lastCheckAt = new Date().toISOString();
      controller = new AbortController();
      try {
        const classes = (
          await getClassesForModule(fid, {
            signal: controller.signal,
          })
        ).map((c) => ({ ...c, __fid: fid }));
        state.lastClasses = classes;
        consecutiveErrors = 0;
        lastError = null;
        const target = findTarget(classes);
        lastTarget = target
          ? {
              fid,
              classID: target.IndependentClassID,
              classCode: target.ClassCode,
              className: target.ClassName,
            }
          : null;
        lastSeats = target ? `${target.CountS}/${target.MaxStudent}` : null;

        if (target && Number(target.CountS) < Number(target.MaxStudent)) {
          console.info(
            `Slot open for ${target.ClassName} (FID: ${fid}, Class ID: ${target.IndependentClassID}). Registering...`,
          );
          await regist(target.IndependentClassID);
          stop("Registration attempted");
          return;
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        consecutiveErrors++;
        lastError = err.message;
        console.error(
          `Monitor error (${consecutiveErrors}/${maxErrors}): ${err.message}`,
        );
        if (consecutiveErrors >= maxErrors) {
          stop(`Too many errors (${maxErrors})`);
          return;
        }
      } finally {
        controller = null;
      }
      scheduleNext();
    };

    state.monitors[monitorId] = { stop, getStatus: status, targetKey };
    timeoutId = setTimeout(check, Math.random() * 2000);
    return {
      stop,
      getStatus: status,
    };
  }

  // UI COMPONENTS
  const styles = `
    #haui-assistant * { box-sizing: border-box; margin: 0; padding: 0; }
    #haui-assistant {
      position: fixed; top: 0; right: 0; width: 100%; height: 100%; z-index: 999999;
      pointer-events: none; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    #haui-assistant .toggle-btn {
      position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; border: none; border-radius: 50%; font-size: 24px; cursor: pointer;
      pointer-events: all; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 1000000;
      transition: transform 0.3s, box-shadow 0.3s; display: flex; align-items: center; justify-content: center;
    }
    #haui-assistant .toggle-btn:hover { transform: scale(1.1); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
    #haui-assistant .panel {
      position: fixed; top: 0; right: -450px; width: 450px; height: 100vh;
      background: #1a1a2e; color: #eee; pointer-events: all; transition: right 0.3s ease;
      display: flex; flex-direction: column; box-shadow: -5px 0 25px rgba(0,0,0,0.5);
      z-index: 1000001;
    }
    #haui-assistant .panel.open { right: 0; }
    #haui-assistant .panel-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
    }
    #haui-assistant .panel-header h2 { font-size: 18px; font-weight: 700; }
    #haui-assistant .panel-header .close-btn {
      background: rgba(255,255,255,0.2); border: none; color: white; font-size: 20px;
      cursor: pointer; width: 32px; height: 32px; border-radius: 50%; display: flex;
      align-items: center; justify-content: center; transition: background 0.2s;
    }
    #haui-assistant .panel-header .close-btn:hover { background: rgba(255,255,255,0.4); }

    #haui-assistant .tabs {
      display: flex; background: #16213e; flex-shrink: 0; border-bottom: 2px solid #0f3460;
    }
    #haui-assistant .tab {
      flex: 1; padding: 12px; text-align: center; cursor: pointer; font-size: 13px;
      font-weight: 600; color: #aaa; transition: all 0.2s; border-bottom: 2px solid transparent;
    }
    #haui-assistant .tab:hover { color: #fff; background: rgba(255,255,255,0.05); }
    #haui-assistant .tab.active { color: #667eea; border-bottom-color: #667eea; background: rgba(102,126,234,0.1); }

    #haui-assistant .tab-content { flex: 1; overflow-y: auto; padding: 15px; display: none; }
    #haui-assistant .tab-content.active { display: flex; flex-direction: column; }

    #haui-assistant .search-box {
      width: 100%; padding: 10px 14px; background: #0f3460; border: 1px solid #16213e;
      color: white; border-radius: 8px; font-size: 14px; margin-bottom: 12px;
      outline: none; transition: border 0.2s;
    }
    #haui-assistant .search-box:focus { border-color: #667eea; }

    #haui-assistant .btn {
      padding: 10px 16px; border: none; border-radius: 8px; cursor: pointer;
      font-weight: 600; font-size: 13px; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;
    }
    #haui-assistant .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    #haui-assistant .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(102,126,234,0.4); }
    #haui-assistant .btn-success { background: #27ae60; color: white; }
    #haui-assistant .btn-danger { background: #e74c3c; color: white; }
    #haui-assistant .btn-warning { background: #f39c12; color: white; }
    #haui-assistant .btn-sm { padding: 6px 12px; font-size: 12px; }

    #haui-assistant .module-list { flex: 1; overflow-y: auto; }
    #haui-assistant .module-item {
      padding: 12px; background: #16213e; border-radius: 8px; margin-bottom: 8px;
      cursor: pointer; transition: background 0.2s; border-left: 3px solid transparent;
    }
    #haui-assistant .module-item:hover { background: #1a1a3e; border-left-color: #667eea; }
    #haui-assistant .module-item.selected { border-left-color: #667eea; background: #1a1a3e; }
    #haui-assistant .module-item .mod-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
    #haui-assistant .module-item .mod-info { font-size: 12px; color: #aaa; }
    #haui-assistant .module-item .mod-id { color: #667eea; }

    #haui-assistant .class-card {
      background: #16213e; border-radius: 10px; padding: 14px; margin-bottom: 10px;
      border: 1px solid #0f3460; transition: border 0.2s;
    }
    #haui-assistant .class-card:hover { border-color: #667eea; }
    #haui-assistant .class-card .class-header {
      display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;
    }
    #haui-assistant .class-card .class-name { font-weight: 700; font-size: 15px; color: #fff; }
    #haui-assistant .class-card .class-code { font-size: 12px; color: #aaa; }
    #haui-assistant .class-card .detail-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; color: #ccc; }
    #haui-assistant .class-card .detail-row span:first-child { color: #aaa; }
    #haui-assistant .class-card .seats {
      padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 12px;
    }
    #haui-assistant .seats-open { background: rgba(39,174,96,0.2); color: #27ae60; }
    #haui-assistant .seats-full { background: rgba(231,76,60,0.2); color: #e74c3c; }

    #haui-assistant .monitor-item {
      background: #16213e; border-radius: 10px; padding: 14px; margin-bottom: 10px;
      border: 1px solid #0f3460;
    }
    #haui-assistant .monitor-status { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    #haui-assistant .status-dot {
      width: 10px; height: 10px; border-radius: 50%; display: inline-block;
    }
    #haui-assistant .dot-running { background: #f39c12; animation: pulse 1.5s infinite; }
    #haui-assistant .dot-stopped { background: #e74c3c; }
    #haui-assistant .dot-success { background: #27ae60; }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

    #haui-assistant .log-area {
      background: #0d1117; border-radius: 8px; padding: 10px; max-height: 200px;
      overflow-y: auto; font-size: 11px; font-family: 'Consolas', monospace;
      color: #8b949e; margin-top: 10px;
    }
    #haui-assistant .log-entry { margin-bottom: 3px; }
    #haui-assistant .log-success { color: #27ae60; }
    #haui-assistant .log-error { color: #e74c3c; }
    #haui-assistant .log-info { color: #58a6ff; }

    #haui-assistant .flex-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    #haui-assistant .form-group { margin-bottom: 10px; }
    #haui-assistant .form-group label { display: block; font-size: 12px; color: #aaa; margin-bottom: 4px; }
    #haui-assistant .form-group input, #haui-assistant .form-group select {
      width: 100%; padding: 8px 12px; background: #0f3460; border: 1px solid #16213e;
      color: white; border-radius: 6px; font-size: 13px; outline: none;
    }
    #haui-assistant .form-group input:focus, #haui-assistant .form-group select:focus { border-color: #667eea; }

    @media (max-width: 500px) {
      #haui-assistant .panel { width: 100%; right: -100%; }
    }
  `;

  const panelHTML = `
    <button class="toggle-btn" title="HaUI Assistant">🥷🏿</button>
    <div class="panel">
      <div class="panel-header">
        <h2>Ha"better"UI 🤣🥁😬🤦‍♀️</h2>
        <button class="close-btn">✕</button>
      </div>
      <div class="tabs">
        <div class="tab active" data-tab="browse">Browse</div>
        <div class="tab" data-tab="monitor">Auto</div>
        <div class="tab" data-tab="log">Log</div>
      </div>
      <div class="tab-content active" id="tab-browse">
        <input type="text" class="search-box" placeholder="Search modules (e.g., IT, Lý thuyết, English)..." id="module-search">
        <div class="flex-row">
          <button class="btn btn-primary btn-sm" id="btn-load-modules">Load All Modules</button>
          <button class="btn btn-success btn-sm" id="btn-scan-open">Scan Open Slots</button>
          <button class="btn btn-warning btn-sm" id="btn-scan-all">Scan All Classes</button>
        </div>
        <div class="module-list" id="module-list">
          <div style="text-align:center;padding:40px;color:#aaa;">Click "Load All Modules" or search to get started</div>
        </div>
        <div id="class-detail" style="margin-top:10px;display:none;"></div>
      </div>
      <div class="tab-content" id="tab-monitor">
        <div class="form-group">
          <label>Module ID (fid)</label>
          <input type="number" id="mon-fid" placeholder="e.g., 4794">
        </div>
        <div class="form-group">
          <label>Independent Class ID (optional)</label>
          <input type="number" id="mon-classid" placeholder="e.g., 246023">
        </div>
        <div class="form-group">
          <label>Or ClassCode</label>
          <input type="text" id="mon-classcode" placeholder="e.g., 20261IT6085001">
        </div>
        <div class="form-group">
          <label>Or filter (e.g., "Online", "IT")</label>
          <input type="text" id="mon-filter" placeholder="Online">
        </div>
        <div class="flex-row">
          <div class="form-group" style="flex:1;">
            <label>Interval (ms)</label>
            <input type="number" id="mon-interval" value="6700">
          </div>
          <div class="form-group" style="flex:1;">
            <label>Jitter (ms)</label>
            <input type="number" id="mon-jitter" value="2000">
          </div>
        </div>
        <div class="flex-row">
          <button class="btn btn-success" id="btn-start-monitor">▶ Start Monitoring</button>
          <button class="btn btn-danger" id="btn-stop-monitor">⏹ Stop All</button>
        </div>
        <div id="active-monitors" style="margin-top:15px;"></div>
      </div>
      <div class="tab-content" id="tab-log">
        <button class="btn btn-sm btn-warning" id="btn-clear-log" style="margin-bottom:10px;">🗑 Clear Log</button>
        <div class="log-area" id="log-area"></div>
      </div>
    </div>
  `;

  // STATE
  let modules = state.modules;
  let activeMonitors = {};
  let monitorCounter = 0;
  const MIN_MONITOR_DELAY = 2000;
  const MONITOR_DELAY_WARNING =
    "Unsafe monitor timing blocked: interval and jitter must be at least 2000ms. " +
    "Polling too fast may get your account noticed, rate-limited, or banned. " +
    "You are responsible for any consequences if you bypass this protection.";

  function getMonitorTargetKey(fid, options = {}) {
    const base = `fid:${toID(fid)}`;
    if (options.classID != null) {
      return `${base}|classID:${toID(options.classID)}`;
    }
    if (options.classCode) {
      return `${base}|classCode:${toID(options.classCode)}`;
    }
    if (options.filterText) {
      return `${base}|filter:${toID(options.filterText).toLowerCase()}`;
    }
    return `${base}|target:any`;
  }

  function getActiveMonitorCount() {
    return Object.values(activeMonitors).filter((m) => !m.stopped).length;
  }

  function removeUIMonitor(id) {
    delete activeMonitors[id];
    if (getActiveMonitorCount() === 0) monitorCounter = 0;
    renderMonitors();
  }

  function validateMonitorTiming(interval, jitter, notify = console.warn) {
    if (
      Number(interval) < MIN_MONITOR_DELAY ||
      Number(jitter) < MIN_MONITOR_DELAY
    ) {
      notify(MONITOR_DELAY_WARNING);
      return false;
    }
    return true;
  }

  // LOGGING
  function addLog(msg, type = "info") {
    const logArea = document.getElementById("log-area");
    if (!logArea) return;
    const entry = document.createElement("div");
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight;
    // Keep max 200 entries
    while (logArea.children.length > 200)
      logArea.removeChild(logArea.firstChild);
  }

  // UI LOGIC
  function createPanel() {
    const container = document.createElement("div");
    container.id = "haui-assistant";
    container.innerHTML = panelHTML;
    document.body.appendChild(container);

    // Inject styles
    const styleEl = document.createElement("style");
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    // Bind events
    const toggleBtn = container.querySelector(".toggle-btn");
    const closeBtn = container.querySelector(".close-btn");
    const panel = container.querySelector(".panel");
    const tabs = container.querySelectorAll(".tab");
    const tabContents = container.querySelectorAll(".tab-content");

    toggleBtn.addEventListener("click", () => panel.classList.add("open"));
    closeBtn.addEventListener("click", () => panel.classList.remove("open"));

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tabContents.forEach((tc) => tc.classList.remove("active"));
        tab.classList.add("active");
        const target = document.getElementById(`tab-${tab.dataset.tab}`);
        if (target) target.classList.add("active");
      });
    });

    // Browse tab
    document.getElementById("module-search").addEventListener("input", (e) => {
      renderModuleList(e.target.value);
    });

    document
      .getElementById("btn-load-modules")
      .addEventListener("click", async () => {
        document.getElementById("btn-load-modules").disabled = true;
        document.getElementById("btn-load-modules").textContent =
          "⏳ Loading...";
        try {
          modules = await getAllModules();
          state.modules = modules;
          renderModuleList();
          addLog(`Loaded ${modules.length} modules`, "success");
        } catch (err) {
          addLog(`Error loading modules: ${err.message}`, "error");
        }
        document.getElementById("btn-load-modules").disabled = false;
        document.getElementById("btn-load-modules").textContent =
          "📥 Load All Modules";
      });

    document
      .getElementById("btn-scan-open")
      .addEventListener("click", async () => {
        await scanModules({ onlyOpen: true });
      });

    document
      .getElementById("btn-scan-all")
      .addEventListener("click", async () => {
        await scanModules({});
      });

    // Monitor tab
    document
      .getElementById("btn-start-monitor")
      .addEventListener("click", () => {
        const fid = parseInt(document.getElementById("mon-fid").value);
        const classID =
          parseInt(document.getElementById("mon-classid").value) || null;
        const classCode =
          document.getElementById("mon-classcode").value || null;
        const filterStr = document.getElementById("mon-filter").value || null;
        const interval =
          parseInt(document.getElementById("mon-interval").value) || 6700;
        const jitter =
          parseInt(document.getElementById("mon-jitter").value) || 2000;

        if (!fid) {
          addLog("Please enter a Module ID (fid)", "error");
          return;
        }

        if (
          !validateMonitorTiming(interval, jitter, (message) =>
            addLog(message, "error"),
          )
        ) {
          return;
        }

        const options = { interval, jitter, maxErrors: 5 };
        if (classID) options.classID = classID;
        else if (classCode) options.classCode = classCode;
        else if (filterStr)
          Object.assign(options, {
            filterText: filterStr,
            filterFn: (c) =>
              c.ClassName?.includes(filterStr) ||
              c.BranchName?.includes(filterStr),
          });
        else {
          addLog("Provide classID, classCode, or filter", "error");
          return;
        }

        startUIMonitor(fid, options);
      });

    document
      .getElementById("btn-stop-monitor")
      .addEventListener("click", () => {
        Object.values(activeMonitors).forEach((m) => m.stop());
        monitorCounter = 0;
        addLog("All monitors stopped", "info");
      });

    document.getElementById("btn-clear-log").addEventListener("click", () => {
      document.getElementById("log-area").innerHTML = "";
    });

    // Auto-load modules
    setTimeout(async () => {
      try {
        modules = await getAllModules();
        state.modules = modules;
        renderModuleList();
        addLog(`Auto-loaded ${modules.length} modules`, "success");
      } catch (e) {
        /* silent */
      }
    }, 1000);
  }

  function renderModuleList(filter = "") {
    const container = document.getElementById("module-list");
    if (!container) return;
    const filtered = modules.filter((m) =>
      String(m.name || "")
        .toLowerCase()
        .includes(String(filter || "").toLowerCase()),
    );
    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:#aaa;">No modules found</div>`;
      return;
    }
    container.innerHTML = filtered
      .map(
        (m) => `
      <div class="module-item" data-fid="${escapeAttribute(m.id)}">
        <div class="mod-name">${highlightMatch(m.name, filter)} <span class="mod-id">#${escapeHTML(m.id)}</span></div>
        <div class="mod-info">${escapeHTML(m.group)} | Click to view classes</div>
      </div>
    `,
      )
      .join("");

    container.querySelectorAll(".module-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const fid = item.dataset.fid;
        const selectedModule = modules.find((m) => toID(m.id) === toID(fid));
        const name = selectedModule?.name || fid;
        // Highlight selected
        container
          .querySelectorAll(".module-item")
          .forEach((i) => i.classList.remove("selected"));
        item.classList.add("selected");
        await showClassDetail(fid, name);
      });
    });
  }

  function highlightMatch(text, query) {
    const source = String(text ?? "");
    if (!query) return escapeHTML(source);
    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
    const parts = source.split(regex);
    return parts
      .map((part) =>
        part.toLowerCase() === query.toLowerCase()
          ? `<span style="color:#667eea;font-weight:700;">${escapeHTML(part)}</span>`
          : escapeHTML(part),
      )
      .join("");
  }

  async function showClassDetail(fid, name) {
    const detailDiv = document.getElementById("class-detail");
    if (!detailDiv) return;
    detailDiv.style.display = "block";
    detailDiv.innerHTML = `<div style="text-align:center;padding:20px;">⏳ Loading classes for <b>${escapeHTML(name)}</b>...</div>`;
    try {
      const classes = (await getClassesForModule(fid)).map((c) => ({
        ...c,
        __fid: fid,
      }));
      state.lastClasses = classes;
      if (!classes || classes.length === 0) {
        detailDiv.innerHTML = `<div style="padding:15px;background:#16213e;border-radius:8px;text-align:center;color:#aaa;">No classes available for this module.</div>`;
        return;
      }
      detailDiv.innerHTML = `
        <h3 style="margin-bottom:10px;font-size:16px;">${escapeHTML(name)} <span style="color:#667eea;">(${classes.length} classes)</span></h3>
        ${classes.map((c) => renderClassCard(c)).join("")}
      `;
      // Bind register buttons
      detailDiv.querySelectorAll(".btn-register").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const id = parseInt(e.target.dataset.classid);
          e.target.disabled = true;
          e.target.textContent = "⏳...";
          try {
            const result = await regist(id);
            addLog(`Registered ${id}: ${JSON.stringify(result)}`, "success");
            e.target.textContent = "✅ Done";
          } catch (err) {
            addLog(`Register ${id} failed: ${err.message}`, "error");
            e.target.textContent = "❌ Failed";
            e.target.disabled = false;
          }
        });
      });
    } catch (err) {
      detailDiv.innerHTML = `<div style="padding:15px;background:#e74c3c20;border-radius:8px;color:#e74c3c;">Error: ${escapeHTML(err.message)}</div>`;
      addLog(`Error loading classes for ${name}: ${err.message}`, "error");
    }
  }

  function renderClassCard(c) {
    const normalized = normalizeClass(c);
    const available = normalized.countS < normalized.maxStudent;
    const seatClass = available ? "seats-open" : "seats-full";
    return `
      <div class="class-card">
        <div class="class-header">
          <div>
            <div class="class-name">${escapeHTML(c.ClassName)} – ${escapeHTML(c.ModulesName)}</div>
            <div class="class-code">${escapeHTML(c.ClassCode || "")} | FID: ${escapeHTML(normalized.fid || "N/A")} | ID: ${escapeHTML(c.IndependentClassID)}</div>
          </div>
          <span class="seats ${seatClass}">${normalized.countS}/${normalized.maxStudent}</span>
        </div>
        <div class="detail-row"><span>👨‍🏫 Giáo viên:</span><span>${escapeHTML(normalized.teacher)}</span></div>
        <div class="detail-row"><span>📅 Bắt đầu:</span><span>${escapeHTML(c.StartDate)}</span></div>
        <div class="detail-row"><span>📍 Địa điểm:</span><span>${escapeHTML(normalized.location)}</span></div>
        <div class="detail-row"><span>🕒 Thời gian:</span><span>${escapeHTML(normalized.schedule)}</span></div>
        <div class="detail-row"><span>💰 Học phí:</span><span>${formatMoney(c.Costs)} VNĐ</span></div>
        <div style="margin-top:10px;display:flex;gap:8px;">
          <button class="btn btn-success btn-sm btn-register" data-classid="${escapeAttribute(c.IndependentClassID)}" ${!available ? "disabled" : ""}>
            ${available ? "📝 Register" : "🔒 Full"}
          </button>
        </div>
      </div>
    `;
  }

  async function scanModules(options = {}) {
    const { onlyOpen = false } = options;
    if (modules.length === 0) {
      addLog("Load modules first!", "error");
      return;
    }
    const btn = document.getElementById(
      onlyOpen ? "btn-scan-open" : "btn-scan-all",
    );
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⏳ Scanning...";
    const detailDiv = document.getElementById("class-detail");
    let allClasses = [];
    let processed = 0;
    for (const mod of modules) {
      processed++;
      try {
        const classes = (await getClassesForModule(mod.id)).map((c) => ({
          ...c,
          __fid: mod.id,
        }));
        let filtered = classes;
        if (onlyOpen)
          filtered = filtered.filter((c) => c.CountS < c.MaxStudent);
        if (filtered.length > 0) allClasses.push(...filtered);
        await sleep(300 + Math.random() * 200);
      } catch (e) {
        addLog(`Scan error ${mod.name}: ${e.message}`, "error");
      }
      if (processed % 20 === 0) {
        addLog(`Scanned ${processed}/${modules.length} modules...`, "info");
      }
    }
    if (allClasses.length === 0) {
      detailDiv.innerHTML = `<div style="padding:15px;background:#16213e;border-radius:8px;text-align:center;color:#aaa;">No matching classes found.</div>`;
    } else {
      detailDiv.style.display = "block";
      detailDiv.innerHTML = `
        <h3 style="margin-bottom:10px;">Found ${allClasses.length} class(es)</h3>
        ${allClasses.map((c) => renderClassCard(c)).join("")}
      `;
      detailDiv.querySelectorAll(".btn-register").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const id = parseInt(e.target.dataset.classid);
          e.target.disabled = true;
          e.target.textContent = "⏳...";
          try {
            await regist(id);
            addLog(`Registered ${id}`, "success");
            e.target.textContent = "✅ Done";
          } catch (err) {
            addLog(`Register ${id} failed: ${err.message}`, "error");
            e.target.textContent = "❌ Failed";
            e.target.disabled = false;
          }
        });
      });
    }
    btn.disabled = false;
    btn.textContent = originalText;
    state.scannedClasses = allClasses;
    addLog(`Scan complete: ${allClasses.length} classes found`, "success");
  }

  // UI MONITORING
  function startUIMonitor(fid, options) {
    const { interval = 6700, jitter = 2000, maxErrors = 5 } = options;
    if (
      !validateMonitorTiming(interval, jitter, (message) =>
        addLog(message, "error"),
      )
    ) {
      return null;
    }

    const targetKey = getMonitorTargetKey(fid, options);
    const existing = Object.entries(activeMonitors).find(
      ([, monitor]) => !monitor.stopped && monitor.targetKey === targetKey,
    );
    if (existing) {
      addLog(
        `Monitor #${existing[0]} is already running for this target. Duplicate monitor blocked.`,
        "error",
      );
      renderMonitors();
      return Number(existing[0]);
    }

    const id = ++monitorCounter;
    let attempts = 0;
    let consecutiveErrors = 0;
    let stopped = false;
    let timeoutId = null;
    let controller = null;

    const scheduleNext = (ms) => {
      if (stopped) return;
      timeoutId = setTimeout(check, ms);
    };

    const stop = (reason) => {
      if (stopped) return;
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (controller) controller.abort();
      if (activeMonitors[id]) {
        activeMonitors[id].stopped = true;
        activeMonitors[id].status =
          activeMonitors[id].status === "success" ? "success" : "stopped";
      }
      addLog(`Monitor #${id} stopped: ${reason}`, "info");
      removeUIMonitor(id);
    };

    const check = async () => {
      if (stopped) return;
      attempts++;
      controller = new AbortController();
      try {
        const classes = await getClassesForModule(fid, {
          signal: controller.signal,
        });
        consecutiveErrors = 0;
        let target = null;
        if (options.classID)
          target = classes.find(
            (c) => toID(c.IndependentClassID) === toID(options.classID),
          );
        else if (options.classCode)
          target = classes.find(
            (c) => toID(c.ClassCode) === toID(options.classCode),
          );
        else if (options.filterFn) target = classes.find(options.filterFn);

        Object.assign(activeMonitors[id], {
          attempts,
          stopped: false,
          lastSeats: target ? `${target.CountS}/${target.MaxStudent}` : "N/A",
          className: target ? target.ClassName : "N/A",
        });
        renderMonitors();

        if (target && target.CountS < target.MaxStudent) {
          addLog(
            `Monitor #${id}: SLOT OPEN! Registering ${target.ClassName}...`,
            "success",
          );
          try {
            const result = await regist(target.IndependentClassID);
            addLog(
              `Monitor #${id}: Registered! ${JSON.stringify(result)}`,
              "success",
            );
            activeMonitors[id].stopped = true;
            activeMonitors[id].status = "success";
          } catch (err) {
            addLog(`Monitor #${id}: Register failed: ${err.message}`, "error");
          }
          stop("Registration attempted");
        }
      } catch (err) {
        if (err?.name === "AbortError") {
          addLog(`Monitor #${id}: Fetch cancelled`, "info");
          renderMonitors();
          return;
        }
        consecutiveErrors++;
        addLog(
          `Monitor #${id}: Error (${consecutiveErrors}/${maxErrors}): ${err.message}`,
          "error",
        );
        if (consecutiveErrors >= maxErrors) {
          stop(`Too many errors (${maxErrors})`);
        }
      }
      if (!stopped) {
        const nextDelay = interval + (Math.random() * 2 - 1) * jitter;
        scheduleNext(Math.max(1000, nextDelay));
      }
      renderMonitors();
    };

    activeMonitors[id] = {
      fid,
      options,
      targetKey,
      attempts: 0,
      stopped: false,
      stop: () => stop("User stopped"),
      lastSeats: "Checking...",
      className: "N/A",
    };

    const initialDelay = Math.random() * 2000;
    addLog(
      `Monitor #${id} starting in ${(initialDelay / 1000).toFixed(1)}s (fid=${fid})`,
      "info",
    );
    timeoutId = setTimeout(check, initialDelay);
    renderMonitors();
    return id;
  }

  function renderMonitors() {
    const container = document.getElementById("active-monitors");
    if (!container) return;
    const entries = Object.entries(activeMonitors);
    if (entries.length === 0) {
      container.innerHTML = `<div style="color:#aaa;text-align:center;padding:10px;">No active monitors</div>`;
      return;
    }
    container.innerHTML = entries
      .map(
        ([id, m]) => `
      <div class="monitor-item">
        <div class="monitor-status">
          <span class="status-dot ${m.stopped ? (m.status === "success" ? "dot-success" : "dot-stopped") : "dot-running"}"></span>
          <strong>Monitor #${escapeHTML(id)}</strong> – ${escapeHTML(m.className)}
        </div>
        <div style="font-size:12px;color:#aaa;">
          fid: ${escapeHTML(m.fid)} | Attempts: ${escapeHTML(m.attempts)} | Seats: ${escapeHTML(m.lastSeats)}
        </div>
        <div style="font-size:12px;color:#aaa;">
          Status: ${m.stopped ? (m.status === "success" ? "✅ Success" : "⏹ Stopped") : "🔄 Running"}
        </div>
        ${!m.stopped ? `<button class="btn btn-danger btn-sm btn-stop-one-monitor" style="margin-top:8px;" data-monitor-id="${id}">⏹ Stop</button>` : ""}
      </div>
    `,
      )
      .join("");

    container.querySelectorAll(".btn-stop-one-monitor").forEach((btn) => {
      btn.addEventListener("click", function () {
        const id = Number(this.dataset.monitorId);
        const monitor = activeMonitors[id];
        if (!monitor) return;
        monitor.stop();
        delete activeMonitors[id];
        renderMonitors();
      });
    });
  }

  Object.assign(window, {
    fetchAPI,
    extractModules,
    getAllModules,
    getClassesForModule,
    safeJSONParse,
    parseSchedule,
    parseLocation,
    formatMoney,
    normalizeClass,
    formatClassForDisplay,
    printDetailedClasses,
    showModules,
    showClasses,
    getClassByID,
    regist,
    removeClass,
    startMonitoring,
    scanAllModules,
    sleep,
  });

  console.info(
    [
      "HaUI Credit Registration Assistant loaded.",
      "Console commands:",
      "  showModules()",
      '  showClasses("python")',
      "  getClassByID(8472) or getClassByID(246023)",
      "  regist(246023)",
      "  removeClass(246023)",
      "  scanAllModules()",
      "  startMonitoring(8472, { classID: 246023, interval: 6700, jitter: 2000, maxErrors: 5, maxAttempts: 0 })",
      "Scanned class rows and window.__haui.scannedClasses include both FID and Class ID.",
    ].join("\n"),
  );

  // INIT
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createPanel);
  } else {
    createPanel();
  }
})();
