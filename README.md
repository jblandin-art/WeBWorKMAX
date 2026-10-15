# WeBWorKMAX (v1.0.5)

Small browser extension for WeBWorK Manual Grader pages.

## What it does

- Improves grading-page layout (score column sizing, comment workflow, cleaner controls).
- Adds local autosave for grading form edits.
- Local autosave stores only fields personally changed by the grader or
  restored from that grader's prior autosave; untouched WebWorK and
  backend-applied values are not copied into autosave.
- Warns when leaving with local changes not yet submitted in WeBWorK.
- Highlights fields that differ from the last WebWorK-loaded/submitted values.
- Shows the submitted WebWorK value when hovering over a highlighted field.
- Sends valid score changes to the shared backup grade history as they are
  entered, and refreshes other graders' pages every 15 seconds.
- Adds a per-student cross-problem grading row. Hover over a student row and
  click **Grade other problems** to enter grades for all matching problem tabs
  without searching for the student repeatedly.
- Cross-problem zero overwrites are preflighted and confirmed in the active tab,
  then rechecked against the backend by the target problem tab before commit.
- Uses the latest backup grade as the displayed value when the optional backend
  is available. A yellow highlight indicates that the displayed backup grade
  differs from the value WebWorK originally rendered.
- When local and backend backup values conflict, the latest backend backup
  value is displayed and the field is highlighted yellow against the original
  WebWorK-rendered value. Local autosave does not override the backend value.
- Preserves native WebWorK grading when the optional backup backend is
  unavailable.

## Supported pages

The extension operates on Manual Grader pages hosted at:

- `https://webwork2.charlotte.edu`
- `https://webwork3.charlotte.edu`

It does not modify unrelated websites or non-grader pages.

Host and Manual Grader path recognition is case-insensitive. Course IDs,
assignment IDs, and grader names are normalized to lowercase before they are
sent to the backup backend.

## Install from a browser store

Install the unlisted WeBWorKMAX listing using the private store link provided
by the project owner. Store-installed extensions receive future updates
automatically.

For local development, use an unpacked installation:

1. Open your browser extension page:
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository folder.

## Use

- Open a WeBWorK Manual Grader page.
- The page displays a **WebWorKMAX is active** banner when the extension is running.
- Click the extension icon to access settings.
- The **Cosmetics** setting is enabled by default and controls visual
  enhancements, including the backup-grade status.
- To share grades between graders, configure the Render backend URL, shared API
  key, and your grader name in the extension popup. Backend deployment details
  are in [`backend/README.md`](./backend/README.md).
- When the backup backend is configured, score changes are recorded after a
  short input debounce rather than waiting for the WebWorK submit button.
  Existing backup grades are displayed on the page and are refreshed
  periodically while the page remains open.

If the backup backend is not configured or cannot be reached, the extension
shows the appropriate backup status and allows the normal WebWorK submission
to continue. Local autosave remains available in the current browser.

Student identifiers sent to the backup backend are HMAC-SHA-256 values; raw
student names and email addresses are not sent to or stored by the backend.

## Update to a new release

Store installations update automatically.

For unpacked development installations, reload the extension from the browser
extensions page after changing the source files.

## Publishing package

The publishable ZIP contains only the extension runtime files:

- `manifest.json`
- `background.js`
- `content.js`
- `popup.html`
- `popup.css`
- `popup.js`
- `icon16.png`
- `icon48.png`
- `icon128.png`

It must not contain `.env.local`, backend credentials, the `backend/`
directory, `node_modules/`, Neon configuration, or development tools.

## Privacy

See the [WeBWorKMAX privacy policy](./PRIVACY.md).
