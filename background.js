const AUTOSAVE_STORAGE_PREFIX = "webworkmaxAutosave:";
const AUTOSAVE_INDEX_KEY = "webworkmaxAutosaveIndex";
const AUTOSAVE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GRADING_TAB_REGISTRY_KEY = "webworkmaxGradingTabRegistry";
const gradingTabs = new Map();
const gradingTabsLoaded = new Promise((resolve) => {
  chrome.storage.session.get(GRADING_TAB_REGISTRY_KEY, (stored) => {
    const registry = stored[GRADING_TAB_REGISTRY_KEY] || {};
    for (const [tabId, context] of Object.entries(registry)) {
      gradingTabs.set(Number(tabId), context);
    }
    resolve();
  });
});

function sameAssignment(left, right) {
  return left.courseId === right.courseId && left.setId === right.setId;
}

function getRegisteredTabs(context) {
  return Array.from(gradingTabs.entries())
    .filter(([, tabContext]) => sameAssignment(tabContext, context))
    .map(([tabId, tabContext]) => ({ tabId, ...tabContext }))
    .sort((left, right) => left.problemId.localeCompare(right.problemId, undefined, { numeric: true }));
}

function persistGradingTabs() {
  const registry = Object.fromEntries(gradingTabs.entries());
  chrome.storage.session.set({ [GRADING_TAB_REGISTRY_KEY]: registry });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve({ ok: true, response });
    });
  });
}

function forwardTabResponse(sendResponse, result) {
  if (!result.ok) {
    sendResponse({ ok: false, error: result.error });
    return;
  }

  sendResponse(result.response || { ok: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab?.id || !message?.type) {
    return false;
  }

  if (message.type === "webworkmax-register-grading-tab") {
    gradingTabs.set(sender.tab.id, {
      courseId: message.courseId,
      setId: message.setId,
      problemId: message.problemId,
    });
    persistGradingTabs();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "webworkmax-get-grades-for-student") {
    gradingTabsLoaded.then(() => {
      const tabs = getRegisteredTabs(message);
      Promise.all(
        tabs.map(async (tab) => {
          const result = await sendMessageToTab(tab.tabId, {
            type: "webworkmax-read-student-grade",
            studentId: message.studentId,
          });
          return {
            ...tab,
            grade: result.ok ? result.response?.grade ?? null : null,
            available: result.ok && result.response?.available === true,
          };
        }),
      ).then((grades) => sendResponse({ ok: true, grades }));
    });
    return true;
  }

  if (message.type === "webworkmax-set-grade") {
    sendMessageToTab(message.tabId, {
      type: "webworkmax-set-student-grade",
      studentId: message.studentId,
      grade: message.grade,
      confirmedZeroOverwrite: message.confirmedZeroOverwrite,
      expectedPreviousGrade: message.expectedPreviousGrade,
    }).then((result) => forwardTabResponse(sendResponse, result));
    return true;
  }

  if (message.type === "webworkmax-prepare-grade") {
    sendMessageToTab(message.tabId, {
      type: "webworkmax-prepare-student-grade",
      studentId: message.studentId,
      grade: message.grade,
    }).then((result) => forwardTabResponse(sendResponse, result));
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  gradingTabs.delete(tabId);
  persistGradingTabs();
});

function cleanupOldAutosaves() {
  chrome.storage.local.get(AUTOSAVE_INDEX_KEY, (stored) => {
    if (chrome.runtime.lastError) {
      return;
    }

    const index = stored[AUTOSAVE_INDEX_KEY] || {};
    const now = Date.now();
    const keysToRemove = [];
    const updatedIndex = { ...index };

    for (const [autosaveKey, savedAtString] of Object.entries(index)) {
      const savedAt = new Date(savedAtString).getTime();
      if (Number.isNaN(savedAt)) {
        keysToRemove.push(autosaveKey);
        delete updatedIndex[autosaveKey];
        continue;
      }

      if (now - savedAt > AUTOSAVE_MAX_AGE_MS) {
        keysToRemove.push(autosaveKey);
        delete updatedIndex[autosaveKey];
      }
    }

    if (keysToRemove.length === 0) {
      return;
    }

    chrome.storage.local.remove(keysToRemove, () => {
      if (chrome.runtime.lastError) {
        return;
      }

      chrome.storage.local.set({ [AUTOSAVE_INDEX_KEY]: updatedIndex });
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  cleanupOldAutosaves();
});

chrome.alarms.create("cleanupAutosaves", { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cleanupAutosaves") {
    cleanupOldAutosaves();
  }
});
