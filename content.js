const DEFAULT_SETTINGS = {
  autosaveInterval: "off",
  cosmeticsEnabled: true,
};

const SCORE_COLUMN_WIDTH = "4.5rem";
const AUTOSAVE_STORAGE_PREFIX = "webworkmaxAutosave:";
const AUTOSAVE_INDEX_KEY = "webworkmaxAutosaveIndex";
const UNSUBMITTED_BANNER_ID = "webworkmax-unsubmitted-banner";
const ACTIVE_BANNER_ID = "webworkmaxbanner";
const LEGACY_ACTIVE_BANNER_ID = "webworkmax-active-banner";
const GRADE_BACKEND_LOADING_ID = "webworkmax-grade-backend-loading";
const GRADE_BACKEND_STATUS_CLASS = "webworkmax-grade-backend-status";
const UNSUBMITTED_FIELD_CLASS = "webworkmax-unsubmitted-field";
const UNSUBMITTED_TOOLTIP_ID = "webworkmax-unsubmitted-tooltip";
const GRADE_BACKEND_SETTINGS_KEY = "webworkmaxGradeBackendSettings";
const LEAVE_GUARD_STYLE_ID = "webworkmax-leave-guard-style";
const LEAVE_GUARD_MODAL_ID = "webworkmax-leave-guard-modal";
const UNLOAD_WARNING_MESSAGE = "Changes are saved locally but are not submitted.";

let commentEnhancerInitialized = false;
let localAutosaveInitialized = false;
let localAutosaveApplying = false;
let localAutosaveTimer = null;
let hasUnsubmittedLocalChanges = false;
let isSubmittingGraderForm = false;
let pendingLeaveAction = null;
let baselineFormValuesSignature = null;
let baselineAutosaveValues = null;
let gradeSyncInProgress = false;
let allowGraderFormSubmit = false;
let initialScoreValues = new Map();
let gradeBackendStatusEnabled = DEFAULT_SETTINGS.cosmeticsEnabled;
const textareaHomes = new WeakMap();
const expandedRows = new WeakMap();
const originalButtonLabels = new WeakMap();
const previewButtonHandlers = new WeakMap();
let commentEnhancerObserver = null;

class GradeSyncCancelledError extends Error {
  constructor() {
    super("Submission cancelled.");
    this.name = "GradeSyncCancelledError";
  }
}

function getProblemAutosaveKey(url = window.location) {
  const pathname = (url.pathname || "").replace(/\/+$/, "");
  return `${AUTOSAVE_STORAGE_PREFIX}${pathname}`;
}

function ensureLeaveGuardStyles() {
  if (document.getElementById(LEAVE_GUARD_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = LEAVE_GUARD_STYLE_ID;
  style.textContent = `
    #${ACTIVE_BANNER_ID} {
      display: block !important;
      position: relative !important;
      visibility: visible !important;
      opacity: 1 !important;
      z-index: 2147483647 !important;
      width: 100% !important;
      height: auto !important;
      margin: 0;
      padding: 6px 12px;
      background: #f8f9fa !important;
      border: 1px solid #dee2e6 !important;
      border-radius: 0.25rem !important;
      color: #212529 !important;
      font-size: 0.9rem !important;
      font-weight: 700 !important;
      line-height: 1.4 !important;
      text-align: center;
    }

    #${ACTIVE_BANNER_ID} p {
      display: block !important;
      margin: 0 !important;
      color: #212529 !important;
      font-size: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }

    #${GRADE_BACKEND_LOADING_ID} {
      display: none;
      width: 100%;
      margin: 0 0 0.75rem;
      padding: 0.5rem 0.75rem;
      background: #f8f9fa !important;
      border: 1px solid #dee2e6 !important;
      border-radius: 0.25rem;
      color: #495057 !important;
      font-size: 0.9rem;
      line-height: 1.4;
    }

    #${GRADE_BACKEND_LOADING_ID}.${GRADE_BACKEND_STATUS_CLASS} {
      display: block;
    }

    #${UNSUBMITTED_BANNER_ID} {
      display: inline-block;
      margin-left: 10px;
      padding: 4px 8px;
      border-radius: 4px;
      background: #c62828;
      color: #ffffff;
      font-size: 0.85rem;
      font-weight: 700;
      vertical-align: middle;
    }

    .${UNSUBMITTED_FIELD_CLASS} {
      outline: 3px solid #f0ad00 !important;
      outline-offset: 1px;
      background-color: #fff3b0 !important;
      box-shadow: 0 0 0 2px rgb(255 255 255 / 90%), 0 0 0 4px #f0ad00 !important;
    }

    #${UNSUBMITTED_TOOLTIP_ID} {
      position: fixed;
      z-index: 2147483647;
      max-width: min(320px, calc(100vw - 24px));
      padding: 6px 9px;
      border: 1px solid #856404;
      border-radius: 4px;
      background: #fff3cd;
      color: #664d03;
      box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
      font-size: 0.82rem;
      line-height: 1.3;
      pointer-events: none;
    }

    #${UNSUBMITTED_TOOLTIP_ID}::after {
      position: absolute;
      bottom: -7px;
      left: 50%;
      width: 12px;
      height: 12px;
      border-right: 1px solid #856404;
      border-bottom: 1px solid #856404;
      background: #fff3cd;
      content: "";
      transform: translateX(-50%) rotate(45deg);
    }

    #${LEAVE_GUARD_MODAL_ID} {
      position: fixed;
      inset: 0;
      background: rgb(0 0 0 / 45%);
      z-index: 2147483646;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    #${LEAVE_GUARD_MODAL_ID}.webworkmax-open {
      display: flex;
    }

    #${LEAVE_GUARD_MODAL_ID} .webworkmax-leave-dialog {
      width: min(520px, 100%);
      background: #ffffff;
      border-radius: 8px;
      border: 1px solid #d0d7de;
      box-shadow: 0 12px 30px rgb(0 0 0 / 28%);
      padding: 16px;
    }

    #${LEAVE_GUARD_MODAL_ID} .webworkmax-leave-title {
      margin: 0 0 10px;
      font-size: 1.05rem;
      font-weight: 700;
      color: #111827;
    }

    #${LEAVE_GUARD_MODAL_ID} .webworkmax-leave-message {
      margin: 0 0 14px;
      color: #111827;
      line-height: 1.4;
    }

    #${LEAVE_GUARD_MODAL_ID} .webworkmax-leave-warning {
      margin: 0 0 16px;
      font-weight: 700;
      color: #b91c1c;
    }

    #${LEAVE_GUARD_MODAL_ID} .webworkmax-leave-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    #${LEAVE_GUARD_MODAL_ID} button {
      border: 1px solid #d0d7de;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 0.9rem;
      cursor: pointer;
    }

    #${LEAVE_GUARD_MODAL_ID} .webworkmax-stay-btn {
      background: #ffffff;
      color: #111827;
    }

    #${LEAVE_GUARD_MODAL_ID} .webworkmax-leave-btn {
      background: #b91c1c;
      border-color: #b91c1c;
      color: #ffffff;
      font-weight: 700;
    }
  `;

  document.head.appendChild(style);
}

function ensureActiveBanner() {
  document.getElementById(LEGACY_ACTIVE_BANNER_ID)?.remove();

  let banner = document.getElementById(ACTIVE_BANNER_ID);
  if (!banner) {
    banner = document.createElement("div");
    banner.id = ACTIVE_BANNER_ID;
    banner.setAttribute("aria-label", "breadcrumb navigation");
    banner.className = "w-100 bg-light";
    banner.innerHTML = "<p>WebWorKMAX is active</p>";
    banner.style.setProperty("display", "block", "important");
    banner.style.setProperty("visibility", "visible", "important");
    banner.style.setProperty("opacity", "1", "important");
    banner.style.setProperty("position", "relative", "important");
    banner.style.setProperty("z-index", "2147483647", "important");
  }

  const breadcrumb = document.getElementById("breadcrumb-navigation");
  const breadcrumbRow = breadcrumb?.parentElement?.parentElement;
  if (breadcrumbRow) {
    let bannerColumn = banner.parentElement;
    if (!bannerColumn?.classList.contains("webworkmax-banner-column")) {
      bannerColumn = document.createElement("div");
      bannerColumn.className = "col-12 d-flex align-items-center webworkmax-banner-column";
      bannerColumn.appendChild(banner);
    }
    breadcrumbRow.insertBefore(bannerColumn, breadcrumb.parentElement);
  } else if (!banner.parentElement) {
    document.body.prepend(banner);
  }

  return banner;
}

function ensureGradeBackendLoadingBanner(form) {
  let banner = document.getElementById(GRADE_BACKEND_LOADING_ID);
  if (!banner) {
    banner = document.createElement("div");
    banner.id = GRADE_BACKEND_LOADING_ID;
    banner.textContent = "Loading backup grades backend (can take about 60 seconds)";
  }

  const tableContainer = form.querySelector(".table-responsive") || form.querySelector("table");
  if (tableContainer?.parentElement && banner.parentElement !== tableContainer.parentElement) {
    tableContainer.parentElement.insertBefore(banner, tableContainer);
  }

  return banner;
}

function setGradeBackendStatus(form, status) {
  const banner = ensureGradeBackendLoadingBanner(form);
  if (!gradeBackendStatusEnabled || !status) {
    banner.classList.remove(GRADE_BACKEND_STATUS_CLASS);
    banner.style.display = "none";
    return;
  }

  const messages = {
    loading: "Loading backup grades backend (can take about 60 seconds)",
    available: "Backup Grades Available",
    unavailable: "Backup Grades Unavailable",
    notSetup: "Backend Not Yet Setup",
  };
  banner.textContent = messages[status];
  banner.classList.add(GRADE_BACKEND_STATUS_CLASS);
}

function setGradeBackendLoading(form, isLoading) {
  setGradeBackendStatus(form, isLoading ? "loading" : null);
}

function ensureUnsubmittedBanner() {
  const title = document.getElementById("page-title");
  if (!title) {
    return null;
  }

  let banner = document.getElementById(UNSUBMITTED_BANNER_ID);
  if (banner) {
    return banner;
  }

  banner = document.createElement("span");
  banner.id = UNSUBMITTED_BANNER_ID;
  banner.textContent = "Work Not Submitted";
  banner.style.display = "none";
  title.appendChild(banner);
  return banner;
}

function updateUnsubmittedUi() {
  const banner = ensureUnsubmittedBanner();
  if (!banner) {
    return;
  }

  banner.style.display = hasUnsubmittedLocalChanges ? "inline-block" : "none";
}

function setUnsubmittedLocalChanges(value) {
  hasUnsubmittedLocalChanges = Boolean(value);
  updateUnsubmittedUi();
}

function serializeAutosaveValues(values) {
  if (!values) {
    return null;
  }

  const ordered = {};
  const keys = Object.keys(values).sort();
  for (const key of keys) {
    ordered[key] = values[key];
  }

  return JSON.stringify(ordered);
}

function refreshUnsubmittedState() {
  if (!baselineFormValuesSignature) {
    setUnsubmittedLocalChanges(false);
    return;
  }

  const currentValues = collectAutosaveValues();
  const currentSignature = serializeAutosaveValues(currentValues);
  updateUnsubmittedFieldHighlights(currentValues);
  setUnsubmittedLocalChanges(currentSignature !== baselineFormValuesSignature);
}

function updateUnsubmittedFieldHighlights(currentValues) {
  const form = document.getElementById("problem-grader-form");
  if (!form || !currentValues || !baselineAutosaveValues) {
    return;
  }

  for (const field of form.querySelectorAll("textarea, select, input")) {
    if (!isAutosaveField(field)) {
      continue;
    }

    const key = getAutosaveFieldKey(field);
    if (!key) {
      continue;
    }

    const isChanged =
      !Object.hasOwn(baselineAutosaveValues, key) ||
      JSON.stringify(currentValues[key]) !== JSON.stringify(baselineAutosaveValues[key]);
    field.classList.toggle(UNSUBMITTED_FIELD_CLASS, isChanged);
  }

  const tooltip = document.getElementById(UNSUBMITTED_TOOLTIP_ID);
  if (tooltip && !tooltip.dataset.fieldName) {
    return;
  }

  if (tooltip?.dataset.fieldName) {
    const field = Array.from(form.querySelectorAll("textarea, select, input")).find(
      (candidate) => getAutosaveFieldKey(candidate) === tooltip.dataset.fieldName,
    );
    if (!field?.classList.contains(UNSUBMITTED_FIELD_CLASS)) {
      hideUnsubmittedTooltip();
    }
  }
}

function formatSubmittedValue(value) {
  if (value === undefined || value === null || value === "") {
    return "(empty)";
  }

  if (typeof value === "boolean") {
    return value ? "checked" : "unchecked";
  }

  return `${value}`;
}

function hideUnsubmittedTooltip() {
  const tooltip = document.getElementById(UNSUBMITTED_TOOLTIP_ID);
  if (tooltip) {
    tooltip.remove();
  }
}

function showUnsubmittedTooltip(field) {
  if (!field?.classList.contains(UNSUBMITTED_FIELD_CLASS) || !baselineAutosaveValues) {
    hideUnsubmittedTooltip();
    return;
  }

  const key = getAutosaveFieldKey(field);
  if (!key) {
    return;
  }

  hideUnsubmittedTooltip();
  const tooltip = document.createElement("div");
  tooltip.id = UNSUBMITTED_TOOLTIP_ID;
  tooltip.dataset.fieldName = key;
  tooltip.textContent = `Submitted WebWorK Value: ${formatSubmittedValue(baselineAutosaveValues[key])}`;
  document.body.appendChild(tooltip);

  const fieldRect = field.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.min(
    Math.max(12, fieldRect.left + (fieldRect.width - tooltipRect.width) / 2),
    window.innerWidth - tooltipRect.width - 12,
  );
  const top = Math.max(8, fieldRect.top - tooltipRect.height - 10);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function handleUnsubmittedFieldMouseOver(event) {
  const field = event.target?.closest?.("textarea, select, input");
  if (field?.classList.contains(UNSUBMITTED_FIELD_CLASS)) {
    showUnsubmittedTooltip(field);
  }
}

function handleUnsubmittedFieldMouseOut(event) {
  const field = event.target?.closest?.("textarea, select, input");
  if (!field || field.contains(event.relatedTarget)) {
    return;
  }

  hideUnsubmittedTooltip();
}

function initUnsubmittedFieldTooltipHandlers(form) {
  if (form.dataset.webworkmaxTooltipBound === "true") {
    return;
  }

  form.dataset.webworkmaxTooltipBound = "true";
  form.addEventListener("mouseover", handleUnsubmittedFieldMouseOver, true);
  form.addEventListener("mouseout", handleUnsubmittedFieldMouseOut, true);
}

function ensureLeaveGuardModal() {
  let modal = document.getElementById(LEAVE_GUARD_MODAL_ID);
  if (modal) {
    return modal;
  }

  modal = document.createElement("div");
  modal.id = LEAVE_GUARD_MODAL_ID;
  modal.innerHTML = `
    <div class="webworkmax-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="webworkmax-leave-title">
      <h2 id="webworkmax-leave-title" class="webworkmax-leave-title">Unsubmitted Work Detected</h2>
      <p class="webworkmax-leave-message">You are about to leave this page.</p>
      <p class="webworkmax-leave-warning">Your changes are saved locally but NOT SUBMITTED.</p>
      <div class="webworkmax-leave-actions">
        <button type="button" class="webworkmax-stay-btn">Stay on page</button>
        <button type="button" class="webworkmax-leave-btn">Leave anyway</button>
      </div>
    </div>
  `;

  const stayButton = modal.querySelector(".webworkmax-stay-btn");
  const leaveButton = modal.querySelector(".webworkmax-leave-btn");

  stayButton?.addEventListener("click", () => {
    pendingLeaveAction = null;
    modal.classList.remove("webworkmax-open");
  });

  leaveButton?.addEventListener("click", () => {
    const action = pendingLeaveAction;
    pendingLeaveAction = null;
    modal.classList.remove("webworkmax-open");
    if (action) {
      action();
    }
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      pendingLeaveAction = null;
      modal.classList.remove("webworkmax-open");
    }
  });

  document.body.appendChild(modal);
  return modal;
}

function openLeaveGuardModal(onLeave) {
  const modal = ensureLeaveGuardModal();
  pendingLeaveAction = onLeave;
  modal.classList.add("webworkmax-open");
}

function clearLocalAutosaveForCurrentProblem() {
  const autosaveKey = getProblemAutosaveKey();
  chrome.storage.local.get(AUTOSAVE_INDEX_KEY, (stored) => {
    const index = stored[AUTOSAVE_INDEX_KEY] || {};
    delete index[autosaveKey];
    chrome.storage.local.remove(autosaveKey, () => {
      chrome.storage.local.set({ [AUTOSAVE_INDEX_KEY]: index });
    });
  });
}

function shouldBlockPageLeave() {
  return hasUnsubmittedLocalChanges && !isSubmittingGraderForm;
}

function handlePageLeaveAttempt(event) {
  if (!shouldBlockPageLeave()) {
    return;
  }

  persistAutosaveSnapshot();
  event.preventDefault();
  event.returnValue = UNLOAD_WARNING_MESSAGE;
}

function handleDocumentNavigationClick(event) {
  if (!shouldBlockPageLeave()) {
    return;
  }

  if (event.defaultPrevented || event.button !== 0) {
    return;
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const link = event.target?.closest?.("a[href]");
  if (!link) {
    return;
  }

  const href = link.getAttribute("href") || "";
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
    return;
  }

  if (link.target && link.target !== "_self") {
    return;
  }

  event.preventDefault();
  persistAutosaveSnapshot();
  openLeaveGuardModal(() => {
    isSubmittingGraderForm = true;
    window.location.href = link.href;
  });
}

function handleDocumentFormSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (form.id === "problem-grader-form") {
    if (allowGraderFormSubmit) {
      allowGraderFormSubmit = false;
      return;
    }

    const submitter = event.submitter;
    event.preventDefault();
    if (gradeSyncInProgress) {
      return;
    }

    gradeSyncInProgress = true;
    synchronizeGradesBeforeSubmit(form)
      .then(() => {
        isSubmittingGraderForm = true;
        window.clearTimeout(localAutosaveTimer);
        const submitValues = collectAutosaveValues();
        baselineAutosaveValues = submitValues;
        baselineFormValuesSignature = serializeAutosaveValues(submitValues);
        updateUnsubmittedFieldHighlights(submitValues);
        setUnsubmittedLocalChanges(false);
        clearLocalAutosaveForCurrentProblem();
        allowGraderFormSubmit = true;
        if (submitter && submitter.form === form) {
          form.requestSubmit(submitter);
        } else {
          form.requestSubmit();
        }
        allowGraderFormSubmit = false;
      })
      .catch((error) => {
        console.error("WeBWorKMAX grade synchronization failed", error);
        window.alert(`Grades were not submitted: ${error.message}`);
      })
      .finally(() => {
        gradeSyncInProgress = false;
      });
    return;
  }

  if (!shouldBlockPageLeave()) {
    return;
  }

  event.preventDefault();
  persistAutosaveSnapshot();
  openLeaveGuardModal(() => {
    isSubmittingGraderForm = true;
    form.submit();
  });
}

function getGradeBackendSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(GRADE_BACKEND_SETTINGS_KEY, (stored) => {
        if (chrome.runtime.lastError) {
          reject(new Error("Could not read grade backend settings."));
          return;
        }

        const settings = stored[GRADE_BACKEND_SETTINGS_KEY] || {};
        const backendUrl = `${settings.backendUrl || ""}`.trim().replace(/\/+$/, "");
        const apiKey = `${settings.apiKey || ""}`.trim();
        const graderName = `${settings.graderName || ""}`.trim();

        if (!backendUrl && !apiKey && !graderName) {
          resolve(null);
          return;
        }

        if (!backendUrl || !apiKey || !graderName) {
          resolve(null);
          return;
        }

        resolve({ backendUrl, apiKey, graderName });
      });
    });
  }

function getCurrentGradeContext() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length < 6) {
      throw new Error("Could not determine the current course, assignment, and problem.");
    }

    return {
      courseId: decodeURIComponent(parts[1]),
      setId: decodeURIComponent(parts[4]),
      problemId: decodeURIComponent(parts[5]),
    };
  }

function getScoreInputs(form) {
    return Array.from(form.querySelectorAll("input.score-selector, select.score-selector")).filter((input) => {
      return /^.+\.\d+\.score$/.test(input.name);
    });
  }

function getStudentIdFromScoreInput(input) {
    return input.name.replace(/\.\d+\.score$/, "");
  }

  async function encodeStudentId(studentId, apiKey) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(apiKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      keyMaterial,
      new TextEncoder().encode(studentId),
    );
    return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function getNumericScore(input) {
    const score = Number(input.value);
    return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
  }

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function fetchLatestGrades(settings, context) {
    const query = new URLSearchParams(context);
    const response = await fetchWithTimeout(`${settings.backendUrl}/api/grades/latest?${query}`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`The grade backend returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    return new Map((payload.grades || []).map((grade) => [grade.studentIdHash, grade]));
  }

async function recordGradeEvents(settings, events) {
    if (events.length === 0) {
      return;
    }

    const response = await fetchWithTimeout(`${settings.backendUrl}/api/grades/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events }),
    });

    if (!response.ok) {
      throw new Error(`The grade backend returned HTTP ${response.status}.`);
    }
  }

async function synchronizeGradesBeforeSubmit(form) {
  const settings = await getGradeBackendSettings();
  if (!settings) {
    isSubmittingGraderForm = true;
    return;
  }

  setGradeBackendLoading(form, true);
  let backendAvailable = false;
  try {
    const context = getCurrentGradeContext();
    const latestGrades = await fetchLatestGrades(settings, context);
    backendAvailable = true;
    const events = [];

    for (const input of getScoreInputs(form)) {
      const studentId = getStudentIdFromScoreInput(input);
      const studentIdHash = await encodeStudentId(studentId, settings.apiKey);
      const currentGrade = getNumericScore(input);
      if (currentGrade === null) {
        continue;
      }

      const initialGrade = initialScoreValues.get(input.name);
      const locallyEdited = `${currentGrade}` !== `${initialGrade ?? ""}`;
      const latest = latestGrades.get(studentIdHash);
      const latestGrade = latest ? Number(latest.newGrade) : null;
      const previousGrade = latestGrade ?? (initialGrade === undefined ? null : Number(initialGrade));

      const initialNumericGrade = initialGrade === undefined ? null : Number(initialGrade);
      const nonZeroPreviousGrade =
        latestGrade !== null && latestGrade > 0
          ? latestGrade
          : initialNumericGrade !== null && initialNumericGrade > 0
            ? initialNumericGrade
            : null;

      if (currentGrade === 0 && nonZeroPreviousGrade !== null) {
        const confirmed = window.confirm(
          `${studentId} has a previous grade of ${nonZeroPreviousGrade}. Are you sure you want to overwrite it with 0?`,
        );
        if (!confirmed) {
          throw new GradeSyncCancelledError();
        }

        events.push({
          ...context,
          studentIdHash,
          graderName: settings.graderName,
          previousGrade: nonZeroPreviousGrade,
          newGrade: 0,
        });
        continue;
      }

      if (!locallyEdited || currentGrade === latestGrade) {
        continue;
      }

      events.push({
        ...context,
        studentIdHash,
        graderName: settings.graderName,
        previousGrade,
        newGrade: currentGrade,
      });
    }

    await recordGradeEvents(settings, events);
    isSubmittingGraderForm = true;
  } catch (error) {
    if (error instanceof GradeSyncCancelledError) {
      throw error;
    }

    console.error("WeBWorKMAX backup grade synchronization failed", error);
    isSubmittingGraderForm = true;
  } finally {
    setGradeBackendStatus(form, backendAvailable ? "available" : "unavailable");
  }
}

async function checkGradeBackendAvailability(form) {
  let settings;
  try {
    settings = await getGradeBackendSettings();
  } catch {
    setGradeBackendStatus(form, "unavailable");
    return;
  }

  if (!settings) {
    setGradeBackendStatus(form, "notSetup");
    return;
  }

  setGradeBackendLoading(form, true);
  try {
    await fetchLatestGrades(settings, getCurrentGradeContext());
    setGradeBackendStatus(form, "available");
  } catch {
    setGradeBackendStatus(form, "unavailable");
  }
}

function isAutosaveField(element) {
  if (!element || element.disabled) {
    return false;
  }

  if (element.tagName === "TEXTAREA" || element.tagName === "SELECT") {
    return true;
  }

  if (element.tagName !== "INPUT") {
    return false;
  }

  const type = (element.type || "").toLowerCase();
  return ["checkbox", "radio", "text", "number", "email", "search", "tel", "url"].includes(type);
}

function getAutosaveFieldKey(element) {
  const fieldName = element.name || element.id;
  if (!fieldName) {
    return null;
  }

  return `${element.tagName.toLowerCase()}:${fieldName}`;
}

function collectAutosaveSnapshot() {
  const values = collectAutosaveValues();
  if (!values) {
    return null;
  }

  return {
    savedAt: new Date().toISOString(),
    values,
  };
}

function collectAutosaveValues() {
  const form = document.getElementById("problem-grader-form");
  if (!form) {
    return null;
  }

  const fields = form.querySelectorAll("textarea, select, input");
  const values = {};

  for (const field of fields) {
    if (!isAutosaveField(field)) {
      continue;
    }

    const key = getAutosaveFieldKey(field);
    if (!key) {
      continue;
    }

    if (field.tagName === "INPUT") {
      const type = (field.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        values[key] = Boolean(field.checked);
        continue;
      }
    }

    values[key] = field.value;
  }

  if (Object.keys(values).length === 0) {
    return null;
  }

  return values;
}

function applyAutosaveSnapshot(snapshot) {
  if (!snapshot?.values) {
    return;
  }

  const form = document.getElementById("problem-grader-form");
  if (!form) {
    return;
  }

  const fields = form.querySelectorAll("textarea, select, input");
  localAutosaveApplying = true;

  try {
    for (const field of fields) {
      if (!isAutosaveField(field)) {
        continue;
      }

      const key = getAutosaveFieldKey(field);
      if (!key || !Object.hasOwn(snapshot.values, key)) {
        continue;
      }

      const nextValue = snapshot.values[key];
      if (field.tagName === "INPUT") {
        const type = (field.type || "").toLowerCase();
        if (type === "checkbox" || type === "radio") {
          field.checked = Boolean(nextValue);
          continue;
        }
      }

      field.value = `${nextValue ?? ""}`;
    }
  } finally {
    localAutosaveApplying = false;
  }
}

function persistAutosaveSnapshot() {
  if (localAutosaveApplying || isSubmittingGraderForm) {
    return;
  }

  const snapshot = collectAutosaveSnapshot();
  if (!snapshot) {
    return;
  }

  const autosaveKey = getProblemAutosaveKey();
  chrome.storage.local.get(AUTOSAVE_INDEX_KEY, (stored) => {
    const index = stored[AUTOSAVE_INDEX_KEY] || {};
    index[autosaveKey] = snapshot.savedAt;

    chrome.storage.local.set({
      [autosaveKey]: snapshot,
      [AUTOSAVE_INDEX_KEY]: index,
    });
  });

  refreshUnsubmittedState();
}

function scheduleAutosaveSnapshot() {
  if (localAutosaveApplying || isSubmittingGraderForm) {
    return;
  }

  refreshUnsubmittedState();

  window.clearTimeout(localAutosaveTimer);
  localAutosaveTimer = window.setTimeout(() => {
    persistAutosaveSnapshot();
  }, 250);
}

function restoreAutosaveSnapshot() {
  const autosaveKey = getProblemAutosaveKey();
  chrome.storage.local.get(autosaveKey, (stored) => {
    const snapshot = stored[autosaveKey];
    if (!snapshot?.values) {
      refreshUnsubmittedState();
      return;
    }

    applyAutosaveSnapshot(snapshot);
    refreshUnsubmittedState();
  });
}

function initLocalAutosave() {
  if (localAutosaveInitialized || !chrome?.storage?.local) {
    return;
  }

  const form = document.getElementById("problem-grader-form");
  if (!form) {
    return;
  }

  localAutosaveInitialized = true;
  initialScoreValues = new Map(
    getScoreInputs(form).map((input) => [input.name, input.value]),
  );
  ensureLeaveGuardStyles();
  ensureUnsubmittedBanner();
  ensureLeaveGuardModal();
  baselineFormValuesSignature = serializeAutosaveValues(collectAutosaveValues());
  baselineAutosaveValues = collectAutosaveValues();
  restoreAutosaveSnapshot();

  form.addEventListener("input", scheduleAutosaveSnapshot, true);
  form.addEventListener("change", scheduleAutosaveSnapshot, true);
  initUnsubmittedFieldTooltipHandlers(form);
  document.addEventListener("click", handleDocumentNavigationClick, true);
  document.addEventListener("submit", handleDocumentFormSubmit, true);
  window.addEventListener("beforeunload", handlePageLeaveAttempt);
}

function isTargetGradingPage(url = window.location) {
  if (!/^webwork[23]\.charlotte\.edu$/.test(url.hostname)) {
    return false;
  }

  return /^\/webwork2\/[^/]+\/instructor\/grader\//.test(url.pathname);
}

function ensureCommentEnhancerStyles() {
  if (document.getElementById("webworkmax-comment-enhancer-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "webworkmax-comment-enhancer-style";
  style.textContent = `
    .webworkmax-comment-expand-row > td {
      padding: 8px 12px 14px;
      background: #f7faf7;
      border-top: none;
    }

    .webworkmax-comment-expand-spacer {
      background: transparent;
      border-top: none;
      padding: 0;
    }

    .webworkmax-comment-expand-panel {
      width: 100%;
      max-width: 100%;
    }

    .webworkmax-comment-expand-panel textarea {
      display: block;
      min-height: 84px;
      resize: vertical;
    }

    .webworkmax-grade-comment-cell {
      text-align: center;
    }
  `;

  document.head.appendChild(style);
}

function getMarkCorrectColumnIndex(table) {
  if (!table) {
    return -1;
  }

  const rows = table.rows;
  for (const row of rows) {
    const cells = row.querySelectorAll("th, td");
    for (const cell of cells) {
      if (/Mark\s+Correct/i.test(cell.textContent || "")) {
        return cell.cellIndex;
      }
    }
  }

  return -1;
}

function getScoreColumnIndex(table) {
  if (!table) {
    return -1;
  }

  const rows = table.rows;
  for (const row of rows) {
    const scoreControl = row.querySelector("select.score-selector, input.score-selector");
    if (scoreControl) {
      const scoreCell = scoreControl.closest("td");
      if (scoreCell) {
        return scoreCell.cellIndex;
      }
    }
  }

  return -1;
}

function setScoreColumnWidth(table, columnIndex) {
  if (!table || columnIndex < 0) {
    return;
  }

  const rows = table.rows;
  for (const row of rows) {
    if (columnIndex >= row.cells.length) {
      continue;
    }

    row.cells[columnIndex].style.width = SCORE_COLUMN_WIDTH;
    row.cells[columnIndex].style.minWidth = SCORE_COLUMN_WIDTH;
  }
}

function clearScoreColumnWidth(table, columnIndex) {
  if (!table || columnIndex < 0) {
    return;
  }

  const rows = table.rows;
  for (const row of rows) {
    if (columnIndex >= row.cells.length) {
      continue;
    }

    row.cells[columnIndex].style.width = "";
    row.cells[columnIndex].style.minWidth = "";
  }
}

function setColumnDisplay(table, columnIndex, displayValue) {
  if (!table || columnIndex < 0) {
    return;
  }

  const rows = table.rows;
  for (const row of rows) {
    if (columnIndex >= row.cells.length) {
      continue;
    }

    row.cells[columnIndex].style.display = displayValue;
  }
}

function restoreGradingCells(row) {
  if (!row) {
    return;
  }

  const table = row.closest("table");
  const markCorrectColumnIndex = getMarkCorrectColumnIndex(table);
  setColumnDisplay(table, markCorrectColumnIndex, "");

  const scoreColumnIndex = getScoreColumnIndex(table);
  clearScoreColumnWidth(table, scoreColumnIndex);

  const scoreControl = row.querySelector("select.score-selector, input.score-selector");
  const checkboxControl = row.querySelector('input.mark_correct[type="checkbox"]');
  const commentTextarea = row.querySelector('textarea[name$=".comment"]');

  const checkboxCell = checkboxControl?.closest("td");
  const commentCell = commentTextarea?.closest("td");

  if (checkboxCell) {
    checkboxCell.style.display = "";
    checkboxCell.style.width = "";
    checkboxCell.style.minWidth = "";
  }

  if (checkboxControl) {
    checkboxControl.style.transform = "";
    checkboxControl.style.transformOrigin = "";
  }

  if (commentCell) {
    commentCell.classList.remove("webworkmax-grade-comment-cell");
    commentCell.style.textAlign = "";
  }
}

function applyGradingCells(row) {
  if (!row) {
    return;
  }

  const table = row.closest("table");
  const markCorrectColumnIndex = getMarkCorrectColumnIndex(table);
  setColumnDisplay(table, markCorrectColumnIndex, "none");

  const scoreColumnIndex = getScoreColumnIndex(table);
  setScoreColumnWidth(table, scoreColumnIndex);

  const scoreControl = row.querySelector("select.score-selector, input.score-selector");
  const checkboxControl = row.querySelector('input.mark_correct[type="checkbox"]');
  const commentTextarea = row.querySelector('textarea[name$=".comment"]');

  const checkboxCell = checkboxControl?.closest("td");
  const commentCell = commentTextarea?.closest("td");

  if (checkboxCell) {
    checkboxCell.style.display = "none";
    checkboxCell.style.width = "";
    checkboxCell.style.minWidth = "";
  }

  if (checkboxControl) {
    checkboxControl.style.transform = "";
    checkboxControl.style.transformOrigin = "";
  }

  if (commentCell) {
    commentCell.classList.add("webworkmax-grade-comment-cell");
    commentCell.style.textAlign = "center";
  }
}

function toggleMarkAllButton(row, enabled) {
  if (!row) {
    return;
  }

  const cells = row.querySelectorAll("th, td");
  for (const cell of cells) {
    if (!/Mark\s+Correct/i.test(cell.textContent || "")) {
      continue;
    }

    const button = Array.from(cell.querySelectorAll('input[type="button"], button')).find((element) => {
      const text = `${element.value || ""} ${element.textContent || ""} ${element.title || ""}`;
      return /Mark\s+All/i.test(text);
    });

    if (!button) {
      continue;
    }

    if (enabled) {
      if (!button.dataset.webworkmaxOriginalDisplay) {
        button.dataset.webworkmaxOriginalDisplay = button.style.display || "";
      }

      button.style.display = "none";
    } else {
      button.style.display = button.dataset.webworkmaxOriginalDisplay || "";
      delete button.dataset.webworkmaxOriginalDisplay;
    }
  }
}

function showExpandedCommentTextarea(row, textarea, shouldSelect = false) {
  if (!row || !textarea || expandedRows.has(textarea)) {
    return;
  }

  const table = row.closest("table");
  if (!table) {
    return;
  }

  const colCount = Math.max(row.cells.length, 1);
  const leadColumns = Math.min(2, Math.max(colCount - 1, 0));
  const editorColumns = Math.max(colCount - leadColumns, 1);
  const expandRow = document.createElement("tr");
  expandRow.className = "webworkmax-comment-expand-row";

  if (leadColumns > 0) {
    const spacerCell = document.createElement("td");
    spacerCell.className = "webworkmax-comment-expand-spacer";
    spacerCell.colSpan = leadColumns;
    expandRow.appendChild(spacerCell);
  }

  const expandCell = document.createElement("td");
  expandCell.colSpan = editorColumns;

  const panel = document.createElement("div");
  panel.className = "webworkmax-comment-expand-panel";

  const essayAnswer = row.querySelector(".essay-answer");
  if (essayAnswer && essayAnswer.clientWidth > 0) {
    panel.style.width = `${essayAnswer.clientWidth}px`;
  }

  textarea.rows = 3;
  textarea.style.resize = "vertical";
  textarea.style.width = "100%";
  textarea.style.maxWidth = "100%";
  textarea.style.display = "block";
  textarea.removeAttribute("aria-hidden");

  panel.appendChild(textarea);
  expandCell.appendChild(panel);
  expandRow.appendChild(expandCell);

  row.insertAdjacentElement("afterend", expandRow);
  expandedRows.set(textarea, expandRow);

  if (shouldSelect) {
    textarea.focus();
    textarea.select();
  }
}

function hideExpandedCommentTextarea(textarea) {
  if (!textarea) {
    return;
  }

  const expandRow = expandedRows.get(textarea);
  if (!expandRow) {
    return;
  }

  const home = textareaHomes.get(textarea);
  if (home?.container) {
    home.container.insertBefore(textarea, home.beforeNode || null);
  }

  textarea.style.display = "none";
  textarea.setAttribute("aria-hidden", "true");

  expandRow.remove();
  expandedRows.delete(textarea);
}

function restoreCommentRow(row) {
  if (!row) {
    return;
  }

  const textarea = row.querySelector('textarea[name$=".comment"]');
  if (!textarea) {
    return;
  }

  const expandRow = expandedRows.get(textarea);
  if (expandRow) {
    hideExpandedCommentTextarea(textarea);
  }

  const home = textareaHomes.get(textarea);
  if (home?.container && textarea.parentElement !== home.container) {
    home.container.insertBefore(textarea, home.beforeNode || null);
  }

  textarea.style.display = "";
  textarea.removeAttribute("aria-hidden");

  const nextElement = textarea.nextElementSibling;
  if (nextElement && nextElement.tagName === "BR") {
    nextElement.style.display = "";
  }

  const button =
    row.querySelector('input[type="button"][name$=".preview"]') ||
    row.querySelector("button.latexentry-preview") ||
    row.querySelector('input[type="button"]');

  if (button) {
    const buttonHandler = previewButtonHandlers.get(button);
    if (buttonHandler) {
      button.removeEventListener("click", buttonHandler, true);
      previewButtonHandlers.delete(button);
    }

    const originalLabel = originalButtonLabels.get(button) || "Preview";
    if (button.tagName === "BUTTON") {
      button.textContent = originalLabel;
    } else {
      button.value = originalLabel;
    }
    button.classList.add("preview");
    delete button.dataset.webworkmaxEnlargeBound;
  }

  toggleMarkAllButton(row, false);
}

function enhanceCommentRow(row) {
  if (!row || row.dataset.webworkmaxCommentEnhanced === "true") {
    return;
  }

  restoreGradingCells(row);
  applyGradingCells(row);
  toggleMarkAllButton(row, true);

  const textarea = row.querySelector('textarea[name$=".comment"]');
  if (!textarea) {
    return;
  }

  const previewButton =
    row.querySelector('input.preview[type="button"]') ||
    row.querySelector('input[type="button"][name$=".preview"]') ||
    row.querySelector("button.latexentry-preview");

  if (!previewButton) {
    return;
  }

  if (!originalButtonLabels.has(previewButton)) {
    originalButtonLabels.set(
      previewButton,
      previewButton.tagName === "BUTTON"
        ? previewButton.textContent.trim() || "Preview"
        : previewButton.value || "Preview",
    );
  }

  if (!textareaHomes.has(textarea)) {
    textareaHomes.set(textarea, {
      container: textarea.parentElement,
      beforeNode: textarea.nextSibling,
    });
  }

  textarea.style.display = "none";
  textarea.setAttribute("aria-hidden", "true");

  const commentCell = textarea.closest("td");
  if (commentCell) {
    commentCell.classList.add("webworkmax-grade-comment-cell");
    commentCell.style.textAlign = "center";
  }

  const nextElement = textarea.nextElementSibling;
  if (nextElement && nextElement.tagName === "BR") {
    nextElement.style.display = "none";
  }

  if (previewButton.tagName === "BUTTON") {
    previewButton.textContent = "Comment";
  } else {
    previewButton.value = "Comment";
  }
  previewButton.classList.remove("preview");
  previewButton.dataset.webworkmaxEnlargeBound = "true";

  const existingHandler = previewButtonHandlers.get(previewButton);
  if (existingHandler) {
    previewButton.removeEventListener("click", existingHandler, true);
    previewButtonHandlers.delete(previewButton);
  }

  const toggleCommentHandler = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (expandedRows.has(textarea)) {
      hideExpandedCommentTextarea(textarea);
      if (previewButton.tagName === "BUTTON") {
        previewButton.textContent = "Comment";
      } else {
        previewButton.value = "Comment";
      }
      return;
    }

      showExpandedCommentTextarea(row, textarea, true);
    if (previewButton.tagName === "BUTTON") {
      previewButton.textContent = "Hide";
    } else {
      previewButton.value = "Hide";
    }
  };

  previewButtonHandlers.set(previewButton, toggleCommentHandler);

  previewButton.addEventListener("click", toggleCommentHandler, true);

  if (textarea.value.trim().length > 0) {
    showExpandedCommentTextarea(row, textarea, false);
    if (previewButton.tagName === "BUTTON") {
      previewButton.textContent = "Hide";
    } else {
      previewButton.value = "Hide";
    }
  }

  row.dataset.webworkmaxCommentEnhanced = "true";
}

function enhanceGradingCommentEditors() {
  ensureCommentEnhancerStyles();

  const rows = document.querySelectorAll("tr");
  for (const row of rows) {
    toggleMarkAllButton(row, true);
    enhanceCommentRow(row);
  }
}

function initCommentEnhancer() {
  if (commentEnhancerInitialized) {
    return;
  }

  commentEnhancerInitialized = true;
  enhanceGradingCommentEditors();

  commentEnhancerObserver = new MutationObserver(() => {
    enhanceGradingCommentEditors();
  });

  commentEnhancerObserver.observe(document.body, { childList: true, subtree: true });
}

function teardownCommentEnhancer() {
  if (commentEnhancerObserver) {
    commentEnhancerObserver.disconnect();
    commentEnhancerObserver = null;
  }

  commentEnhancerInitialized = false;

  const rows = document.querySelectorAll("tr");
  for (const row of rows) {
    toggleMarkAllButton(row, false);
    restoreCommentRow(row);
    restoreGradingCells(row);
    row.dataset.webworkmaxCommentEnhanced = "";
  }

  const style = document.getElementById("webworkmax-comment-enhancer-style");
  if (style) {
    style.remove();
  }
}

function applyCosmetics(enabled) {
  gradeBackendStatusEnabled = Boolean(enabled);
  document.documentElement.classList.toggle("webworkmax-cosmetics-enabled", Boolean(enabled));

  if (enabled) {
    initCommentEnhancer();
  } else {
    const statusBanner = document.getElementById(GRADE_BACKEND_LOADING_ID);
    if (statusBanner) {
      statusBanner.classList.remove(GRADE_BACKEND_STATUS_CLASS);
      statusBanner.style.display = "none";
    }
    teardownCommentEnhancer();
  }
}

function syncFromSettings(settings) {
  if (!isTargetGradingPage()) {
    return;
  }

  applyCosmetics(settings.cosmeticsEnabled);
  const form = document.getElementById("problem-grader-form");
  if (form) {
    void checkGradeBackendAvailability(form);
  }
}

function init() {
  if (!isTargetGradingPage()) {
    return;
  }

  ensureLeaveGuardStyles();
  ensureActiveBanner();

  if (!chrome?.storage?.sync) {
    return;
  }

  initLocalAutosave();

  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    if (chrome.runtime.lastError) {
      return;
    }

    syncFromSettings(settings);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    if (!Object.hasOwn(changes, "cosmeticsEnabled")) {
      return;
    }

    const enabled = Boolean(changes.cosmeticsEnabled.newValue);
    applyCosmetics(enabled);
    if (enabled) {
      const form = document.getElementById("problem-grader-form");
      if (form) {
        void checkGradeBackendAvailability(form);
      }
    }
  });
}

init();