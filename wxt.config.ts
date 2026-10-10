import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // WXT defaults Firefox and Safari to MV2; we want MV3 everywhere.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Read Aloud (Sarvam)',
    description: 'Read web articles aloud with natural Indian-English voices from Sarvam AI.',
    action: { default_title: 'Read Aloud: toggle spike panel' },
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['https://api.sarvam.ai/*'],
    commands: {
      'spike-speak': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Speak the current selection (spike: autoplay test)',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: { id: 'readaloud-sarvam@local', strict_min_version: '128.0' },
      },
    }),
  }),
  hooks: {
    // Safari 26 can't open a debugger for a service-worker background, and
    // non-persistent background scripts are its default anyway.
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser === 'safari' && manifest.background && 'service_worker' in manifest.background) {
        manifest.background = { scripts: [manifest.background.service_worker], persistent: false };
      }
    },
  },
});
