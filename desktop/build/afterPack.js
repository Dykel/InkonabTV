// Puts the InkonabTV icon and version details into InkonabTV.exe after packing.
// electron-builder normally does this with rcedit, which needs Windows (or Wine); resedit
// is plain JavaScript, so the Windows app can be built on a Mac.
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const pngToIco = (await import('png-to-ico')).default;
  const app = require('../package.json');

  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icoBuf = await pngToIco(path.join(__dirname, 'icon.png'));

  const data = fs.readFileSync(exe);
  const exeFile = ResEdit.NtExecutable.from(data, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exeFile);

  // Icon: replace Electron's main icon group (id 1) with ours.
  const ico = ResEdit.Data.IconFile.from(icoBuf);
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, 1, 1033, ico.icons.map(i => i.data));

  // Version details shown in Properties and Task Manager.
  const v = app.version.split('.').map(Number);
  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  vi.setFileVersion(v[0], v[1], v[2], 0, 1033);
  vi.setProductVersion(v[0], v[1], v[2], 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    ProductName: 'InkonabTV',
    FileDescription: 'InkonabTV',
    CompanyName: 'InkonabTV',
    LegalCopyright: '© 2026 InkonabTV',
    OriginalFilename: 'InkonabTV.exe',
    InternalName: 'InkonabTV',
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exeFile);
  fs.writeFileSync(exe, Buffer.from(exeFile.generate()));
  console.log('  • InkonabTV icon and version written to', path.basename(exe));
};
