// Microsoft Store version (MSIX/AppX), a pure player like the Google Play and Samsung versions:
// no free VPN (a Store app can't install the network driver OpenVPN needs) and no self-updates
// (the Store updates it). The Dolby sound converter (FFmpeg) stays.
// Built on Windows by .github/workflows/windows-store.yml (or `npm run dist:store` on a PC);
// output in ../release/store. The package identity must match the app reserved in Partner
// Center (Product management → Product identity), given as MS_IDENTITY_NAME, MS_PUBLISHER and
// MS_PUBLISHER_NAME; without them the package is only good for a test build.
const base = require('./package.json').build;

module.exports = {
  ...base,
  extraMetadata: { description: 'InkonabTV: live TV with a TV guide, movies and series from your own IPTV playlist' },
  directories: { output: '../release/store' },
  win: {
    ...base.win,
    target: [{ target: 'appx', arch: ['x64'] }],
    extraResources: base.win.extraResources.filter(r => !r.from.includes('openvpn')),
  },
  appx: {
    identityName: process.env.MS_IDENTITY_NAME || 'InkonabTV.Test',
    publisher: process.env.MS_PUBLISHER || 'CN=00000000-0000-0000-0000-000000000000',
    publisherDisplayName: process.env.MS_PUBLISHER_NAME || 'InkonabTV',
    applicationId: 'InkonabTV',
    displayName: 'InkonabTV',
    backgroundColor: '#05090b',
    showNameOnTiles: true,
    languages: ['en-US'],
    minVersion: '10.0.17763.0',       // Windows 10 1809, the oldest Electron supports
    maxVersionTested: '10.0.26100.0', // Windows 11 24H2
    artifactName: 'InkonabTV-store-${version}.${ext}',
  },
};
