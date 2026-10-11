import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // WXT defaults Firefox and Safari to MV2; we want MV3 everywhere.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Read Aloud (Sarvam)',
    description: 'Read web articles aloud with natural Indian-English voices from Sarvam AI.',
    action: { default_title: 'Read Aloud' },
    // activeTab + scripting: the extension only touches a page when the user invokes it
    // (toolbar button, context menu, shortcut). Site-wide article detection is opt-in.
    permissions: ['storage', 'contextMenus', 'activeTab', 'scripting'],
    host_permissions: ['https://api.sarvam.ai/*'],
    optional_host_permissions: ['<all_urls>'],
    commands: {
      'toggle-reading': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Read this page aloud, or play/pause',
      },
      'next-sentence': {
        suggested_key: { default: 'Alt+Shift+Period' },
        description: 'Next sentence',
      },
      'prev-sentence': {
        suggested_key: { default: 'Alt+Shift+Comma' },
        description: 'Previous sentence',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'readaloud-sarvam@local',
          // 140 ESR: data_collection_permissions consent UI and the CSS Highlight API.
          strict_min_version: '140.0',
          // Article text is sent to Sarvam AI for speech synthesis (required for AMO since Nov 2025).
          data_collection_permissions: { required: ['websiteContent'] },
        },
      },
    }),
  }),
  zip: {
    artifactTemplate: 'read-aloud-sarvam-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'read-aloud-sarvam-{{version}}-sources.zip',
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      // The content script is injected on demand (registration: 'runtime'), so WXT adds its
      // `<all_urls>` match to host_permissions; it belongs in optional_host_permissions only.
      manifest.host_permissions = manifest.host_permissions?.filter((p: string) => p !== '<all_urls>');
      // Safari 26 can't open a debugger for a service-worker background, and
      // non-persistent background scripts are its default anyway.
      if (wxt.config.browser === 'safari' && manifest.background && 'service_worker' in manifest.background) {
        manifest.background = { scripts: [manifest.background.service_worker], persistent: false };
      }
    },
  },
});
