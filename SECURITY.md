# Security policy

## Reporting a vulnerability

Please report security problems **privately**, not in a public issue:

1. Go to the [Security tab](https://github.com/SiddharthChillale/bak-bak/security) and choose
   **Report a vulnerability**. Only the maintainer can see the report.
2. Include what you found, the steps to reproduce it, the browser and extension version, and what an attacker
   could do with it.

You should hear back within a week. Once a fix is released you'll be credited in the release notes, unless
you'd rather not be.

## What's in scope

Things that matter most for this extension:

- A web page reading, stealing or misusing the user's Sarvam API key, settings or cached audio
- A page getting script to run in the extension's context, or in the player it injects
- The extension sending page text or other data anywhere other than Sarvam AI, or before the user invokes it
- Permission escalation beyond what the extension asks for

Problems in Sarvam AI's own service should go to Sarvam AI.

## Supported versions

Only the latest release gets security fixes.
