# WeBWorKMAX Privacy Policy

**Last updated: October 5, 2026**

WeBWorKMAX is a browser extension for WeBWorK Manual Grader pages.

## Information processed

The extension may process:

- Grade values, comments, and other grading-form fields for local autosave.
- A grader name or nickname entered in the extension settings.
- A shared backend URL and API key entered in the extension settings.
- HMAC-SHA-256 identifiers derived locally from student identifiers.

Raw student names, email addresses, and usernames are not sent to the shared
grade backend. The backend receives only the derived student identifier hash,
course/set/problem identifiers, grade values, grader name, and timestamps.

## Where information is stored

Local autosave data and backend settings are stored in the browser's extension
storage on the user's device.

If collaborative backup grades are configured, grade events are sent to the
backend service selected by the user. The backend stores grade history and
derived student identifier hashes. The backend does not receive the raw
student identifier.

## How information is used

Information is used only to provide local autosave, unsaved-change warnings,
field mismatch indicators, and optional collaborative grade synchronization.
WeBWorKMAX does not sell personal information or use it for advertising.

## Data sharing

The extension does not send data to the extension developer unless the user
configures a collaborative grade backend. When configured, data is sent to the
backend URL supplied by the user.

## Data control

Users can remove local extension data through their browser's extension
storage controls and can stop collaborative synchronization by clearing the
backend settings in the extension popup. Backend-retained grade history must
be managed through the configured backend provider.

## Contact

For questions about this policy or the extension, contact the WeBWorKMAX
project owner through the project's GitHub repository.
