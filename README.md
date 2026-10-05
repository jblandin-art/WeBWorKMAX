# WeBWorKMAX (v1.0.1)

Small browser extension for WeBWorK Manual Grader pages.

## What it does

- Improves grading-page layout (score column sizing, comment workflow, cleaner controls).
- Adds local autosave for grading form edits.
- Warns when leaving with local changes not yet submitted in WeBWorK.
- Highlights fields that differ from the last WebWorK-loaded/submitted values.
- Shows the submitted WebWorK value when hovering over a highlighted field.
- Synchronizes shared backup grade history between graders through the optional
  Render API and Neon database.
- Preserves native WebWorK grading when the optional backup backend is
  unavailable.

## Supported pages

The extension operates on Manual Grader pages hosted at:

- `https://webwork2.charlotte.edu`
- `https://webwork3.charlotte.edu`

It does not modify unrelated websites or non-grader pages.

## Install (from release ZIP)

1. Download release [`v1.0.0`](https://github.com/jblandin-art/WeBWorKMAX/releases/download/v1.0.0/WeBWorKMAX.zip) ZIP.
2. Unzip it to a folder.
3. Open your browser extension page:
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped extension folder.

Done.

## Use

- Open a WeBWorK Manual Grader page.
- The page displays a **WebWorKMAX is active** banner when the extension is running.
- Click the extension icon to access settings.
- The **Cosmetics** setting is enabled by default and controls visual
  enhancements, including the backup-grade status.
- To share grades between graders, configure the Render backend URL, shared API
  key, and your grader name in the extension popup. Backend deployment details
  are in [`backend/README.md`](./backend/README.md).

If the backup backend is not configured or cannot be reached, the extension
shows the appropriate backup status and allows the normal WebWorK submission
to continue. Local autosave remains available in the current browser.

Student identifiers sent to the backup backend are HMAC-SHA-256 values; raw
student names and email addresses are not sent to or stored by the backend.

## Update to a new release

1. Remove old unzipped folder.
2. Unzip the new release.
3. Reload the extension on the extensions page (or load the new folder).
