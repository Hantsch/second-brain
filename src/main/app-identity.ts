/* Single source for the app's Windows identity. `build.appId` in package.json,
   `setAppUserModelId`, and `setAppDetails` must all agree — a mismatch breaks
   taskbar grouping silently, and nothing else would catch it. */

export const APP_ID = 'app.hantsch.gaston';
export const APP_NAME = 'Gaston';
