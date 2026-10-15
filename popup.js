const DEFAULT_SETTINGS = {
  cosmeticsEnabled: true,
};

const AUTOSAVE_STORAGE_PREFIX = "webworkmaxAutosave:";
const AUTOSAVE_INDEX_KEY = "webworkmaxAutosaveIndex";
const COSMETICS_KEY = "cosmeticsEnabled";
const GRADE_BACKEND_SETTINGS_KEY = "webworkmaxGradeBackendSettings";

const viewAutosaveButton = document.getElementById("viewAutosaveButton");
const clearProblemGradesButton = document.getElementById("clearProblemGradesButton");
const autosaveInfoEl = document.getElementById("autosaveInfo");
const cosmeticsToggle = document.getElementById("cosmeticsEnabled");
const statusEl = document.getElementById("status");
const backendUrlInput = document.getElementById("backendUrl");
const gradeApiKeyInput = document.getElementById("gradeApiKey");
const graderNameInput = document.getElementById("graderName");

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);

  window.clearTimeout(showStatus.timerId);
  showStatus.timerId = window.setTimeout(() => {
    statusEl.textContent = "";
    statusEl.classList.remove("error");
  }, 1400);
}

function applySettings(settings) {
  cosmeticsToggle.checked = Boolean(settings[COSMETICS_KEY]);
}

function saveSettings() {
  const nextSettings = {
    [COSMETICS_KEY]: cosmeticsToggle.checked,
  };

  chrome.storage.sync.set(nextSettings, () => {
    if (chrome.runtime.lastError) {
      showStatus("Could not save settings", true);
      return;
    }

    showStatus("Settings Saved");
  });
}

function loadGradeBackendSettings() {
  chrome.storage.local.get(GRADE_BACKEND_SETTINGS_KEY, (stored) => {
    if (chrome.runtime.lastError) {
      showStatus("Could not load backend settings", true);
      return;
    }

    const settings = stored[GRADE_BACKEND_SETTINGS_KEY] || {};
    backendUrlInput.value = settings.backendUrl || "";
    gradeApiKeyInput.value = settings.apiKey || "";
    graderNameInput.value = settings.graderName || "";
  });
}

function saveGradeBackendSettings() {
  chrome.storage.local.set(
    {
      [GRADE_BACKEND_SETTINGS_KEY]: {
        backendUrl: backendUrlInput.value.trim().replace(/\/+$/, ""),
        apiKey: gradeApiKeyInput.value.trim(),
        graderName: graderNameInput.value.trim().toLowerCase(),
      },
    },
    () => {
      if (chrome.runtime.lastError) {
        showStatus("Could not save backend settings", true);
        return;
      }

      showStatus("Backend settings saved");
    },
  );
}

function getProblemAutosaveKeyFromUrl(urlString) {
  if (!urlString) {
    return null;
  }

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  if (!/^webwork[23]\.charlotte\.edu$/i.test(url.hostname)) {
    return null;
  }

  if (!/^\/webwork2\/[^/]+\/instructor\/grader\//i.test(url.pathname)) {
    return null;
  }

  const pathname = (url.pathname || "").replace(/\/+$/, "");
  return `${AUTOSAVE_STORAGE_PREFIX}${pathname}`;
}

function getProblemContextFromUrl(urlString) {
  if (!urlString) {
    return null;
  }

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  if (!/^webwork[23]\.charlotte\.edu$/i.test(url.hostname)) {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (
    parts.length < 6 ||
    parts[0].toLowerCase() !== "webwork2" ||
    parts[2].toLowerCase() !== "instructor" ||
    parts[3].toLowerCase() !== "grader"
  ) {
    return null;
  }

  return {
    courseId: decodeURIComponent(parts[1]).toLowerCase(),
    setId: decodeURIComponent(parts[4]).toLowerCase(),
    problemId: decodeURIComponent(parts[5]),
    autosaveKey: getProblemAutosaveKeyFromUrl(urlString),
  };
}

function getBackendSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(GRADE_BACKEND_SETTINGS_KEY, (stored) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Could not load backend settings."));
        return;
      }

      const settings = stored[GRADE_BACKEND_SETTINGS_KEY] || {};
      const backendUrl = `${settings.backendUrl || ""}`.trim().replace(/\/+$/, "");
      const apiKey = `${settings.apiKey || ""}`.trim();
      if (!backendUrl || !apiKey) {
        resolve(null);
        return;
      }

      resolve({ backendUrl, apiKey });
    });
  });
}

function removeLocalProblemAutosave(autosaveKey) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (stored) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Could not load local autosaves."));
        return;
      }

      const index = { ...(stored[AUTOSAVE_INDEX_KEY] || {}) };
      const normalizedTarget = autosaveKey.toLowerCase().replace(/\/+$/, "");
      const matchingKeys = Object.keys(stored).filter((key) => {
        return key.startsWith(AUTOSAVE_STORAGE_PREFIX)
          && key.toLowerCase().replace(/\/+$/, "") === normalizedTarget;
      });
      if (!matchingKeys.includes(autosaveKey)) {
        matchingKeys.push(autosaveKey);
      }
      for (const key of matchingKeys) {
        delete index[key];
      }

      chrome.storage.local.remove(matchingKeys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error("Could not clear local autosaves."));
          return;
        }

        chrome.storage.local.get(matchingKeys, (remaining) => {
          if (chrome.runtime.lastError) {
            reject(new Error("Could not verify local autosave cleanup."));
            return;
          }

          const remainingKeys = Object.keys(remaining);
          if (remainingKeys.length > 0) {
            reject(new Error(`Could not clear local autosave key: ${remainingKeys[0]}`));
            return;
          }

          chrome.storage.local.set({ [AUTOSAVE_INDEX_KEY]: index }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error("Could not update local autosave index."));
              return;
            }
            resolve();
          });
        });
      });
    });
  });
}

function prepareActiveTabForAutosaveClear(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "webworkmax-prepare-autosave-clear" }, () => {
      resolve();
    });
  });
}

async function clearProblemGradesForActiveTab() {
  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, resolve);
  });
  const activeTab = tabs?.[0];
  const context = getProblemContextFromUrl(activeTab?.url);
  if (!context) {
    throw new Error("Open a supported WeBWorK Manual Grader problem first.");
  }

  const settings = await getBackendSettings();
  if (!settings) {
    throw new Error("Configure the grade backend before clearing shared grades.");
  }

  const confirmed = window.confirm(
    `Clear all local and shared backup grades for ${context.courseId}/${context.setId}/problem ${context.problemId}? This cannot be undone.`,
  );
  if (!confirmed) {
    return false;
  }

  const query = new URLSearchParams({
    courseId: context.courseId,
    setId: context.setId,
    problemId: context.problemId,
  });
  const response = await fetch(`${settings.backendUrl}/api/grades/events?${query}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${settings.apiKey}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `The grade backend returned HTTP ${response.status}.`);
  }

  if (activeTab?.id !== undefined) {
    await prepareActiveTabForAutosaveClear(activeTab.id);
  }
  await removeLocalProblemAutosave(context.autosaveKey);
  if (activeTab?.id !== undefined) {
    await new Promise((resolve, reject) => {
      chrome.tabs.reload(activeTab.id, () => {
        if (chrome.runtime.lastError) {
          reject(new Error("Grades were cleared, but the problem page could not be reloaded."));
          return;
        }
        resolve();
      });
    });
  }
  showStatus(`Cleared ${payload.deleted ?? 0} shared grade events`);
  return true;
}

function showAutosaveInfoForActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs?.[0];
    const autosaveKey = getProblemAutosaveKeyFromUrl(activeTab?.url);

    if (!autosaveKey) {
      autosaveInfoEl.classList.remove("autosave-details");
      autosaveInfoEl.textContent = "Open a WeBWorK grader page to view autosave time";
      return;
    }

    chrome.storage.local.get(autosaveKey, (stored) => {
      const snapshot = stored[autosaveKey];
      if (!snapshot?.savedAt) {
        autosaveInfoEl.classList.remove("autosave-details");
        autosaveInfoEl.textContent = "Last autosave for this problem: None yet";
        return;
      }

      const date = new Date(snapshot.savedAt);
      const formatted = Number.isNaN(date.getTime()) ? snapshot.savedAt : date.toLocaleString();
      const values = Object.entries(snapshot.values || {});
      const valueLines = values.length === 0
        ? ["No saved fields."]
        : values.map(([field, value]) => `${field}: ${typeof value === "boolean" ? (value ? "checked" : "unchecked") : value}`);
      autosaveInfoEl.textContent = [
        `Last autosave for this problem: ${formatted}`,
        "",
        "Saved values:",
        ...valueLines,
      ].join("\n");
      autosaveInfoEl.classList.add("autosave-details");
    });
  });
}

function initPopup() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    if (chrome.runtime.lastError) {
      showStatus("Could not load settings", true);
      return;
    }

    applySettings(settings);
  });

  viewAutosaveButton.addEventListener("click", showAutosaveInfoForActiveTab);
  clearProblemGradesButton.addEventListener("click", async () => {
    clearProblemGradesButton.disabled = true;
    try {
      await clearProblemGradesForActiveTab();
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      clearProblemGradesButton.disabled = false;
    }
  });

  cosmeticsToggle.addEventListener("change", saveSettings);
  backendUrlInput.addEventListener("change", saveGradeBackendSettings);
  gradeApiKeyInput.addEventListener("change", saveGradeBackendSettings);
  graderNameInput.addEventListener("change", saveGradeBackendSettings);
  loadGradeBackendSettings();
}

if (!chrome?.storage?.sync) {
  showStatus("Storage is unavailable", true);
} else {
  initPopup();
}
