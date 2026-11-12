// Runs on EAS Build (npm hook "eas-build-post-install") and can be run locally:
//   EAS_BUILD_PROFILE=preview node scripts/check-build-env.mjs
// Fails the build early if a factory (preview/production) build would start without a real backend,
// instead of producing an APK that cannot register anything or silently runs on mock data.
const profile = process.env.EAS_BUILD_PROFILE;
if (!profile) {
  console.log('check-build-env: not an EAS profile build, skipping.');
  process.exit(0);
}

const APPS_SCRIPT_URL = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]+\/exec$/;
const mode = (process.env.EXPO_PUBLIC_DATA_MODE || '').trim();
const url = (process.env.EXPO_PUBLIC_API_URL || '').trim();
const problems = [];

if (mode !== 'live') {
  problems.push(`EXPO_PUBLIC_DATA_MODE must be "live" for the "${profile}" profile (found "${mode || 'unset'}").`);
}
if (!APPS_SCRIPT_URL.test(url)) {
  problems.push(
    'EXPO_PUBLIC_API_URL must be the deployed Apps Script web app URL (https://script.google.com/macros/s/<id>/exec). ' +
      `Found "${url || 'unset'}". Update the "env" section of this profile in eas.json.`,
  );
}

if (problems.length > 0) {
  console.error(`\ncheck-build-env FAILED for profile "${profile}":\n  - ${problems.join('\n  - ')}\n`);
  process.exit(1);
}
console.log(`check-build-env: profile "${profile}" uses live mode with a valid Apps Script URL.`);
