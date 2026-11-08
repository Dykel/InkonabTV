package tv.inkonab.app.update;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * Sideload version only: downloads a new InkonabTV+ APK and opens Android's installer.
 * Before installing, the file must match the published SHA-256, be this same app signed with the
 * same key, and have a higher version code; otherwise it's deleted and nothing is installed.
 */
public final class Updater {
    public static final boolean AVAILABLE = true;

    public interface Progress { void on(long done, long total); }
    public interface Done { void done(boolean ok, String detail); }

    private Updater() {}

    private static File apk(Context c) { return new File(c.getCacheDir(), "update.apk"); }

    /** Android 8+ asks once per app before it may install other APKs. */
    public static boolean canInstall(Context c) {
        // A build without REQUEST_INSTALL_PACKAGES (hotel version) gets a SecurityException here.
        try { return Build.VERSION.SDK_INT < 26 || c.getPackageManager().canRequestPackageInstalls(); }
        catch (Exception e) { return false; }
    }

    /** The "Install unknown apps" switch for this app. */
    public static void openInstallSettings(Activity a) {
        if (Build.VERSION.SDK_INT < 26) { a.startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS)); return; }
        try {
            a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
        } catch (ActivityNotFoundException e) {
            a.startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    /** version.json from the update site (read natively: the site sends no CORS headers). */
    public static void fetchText(String link, Done done) {
        new Thread(() -> {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(link).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setUseCaches(false);
                if (conn.getResponseCode() != 200) throw new Exception("Server answered " + conn.getResponseCode());
                StringBuilder b = new StringBuilder();
                try (InputStream in = conn.getInputStream()) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0 && b.length() < 65536) b.append(new String(buf, 0, n, "UTF-8"));
                }
                done.done(true, b.toString());
            } catch (Exception e) {
                done.done(false, e.getMessage() == null ? e.toString() : e.getMessage());
            }
        }).start();
    }

    /** Runs on a background thread; `done` is called from it too. */
    public static void download(Context c, String link, String sha256, Progress progress, Done done) {
        new Thread(() -> {
            File out = apk(c);
            try {
                HttpURLConnection conn = null;
                String at = link;
                for (int hops = 0; hops < 5; hops++) {
                    conn = (HttpURLConnection) new URL(at).openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setInstanceFollowRedirects(false);
                    int code = conn.getResponseCode();
                    if (code < 300 || code >= 400) break;
                    at = new URL(new URL(at), conn.getHeaderField("Location")).toString();
                }
                if (conn.getResponseCode() != 200) throw new Exception("Server answered " + conn.getResponseCode());
                long total = conn.getContentLengthLong(), got = 0, shown = 0;
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                try (InputStream in = conn.getInputStream(); FileOutputStream f = new FileOutputStream(out)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        f.write(buf, 0, n);
                        md.update(buf, 0, n);
                        got += n;
                        if (got - shown > 256 * 1024 || got == total) { shown = got; progress.on(got, total); }
                    }
                }
                StringBuilder hex = new StringBuilder();
                for (byte b : md.digest()) hex.append(String.format("%02x", b));
                if (sha256 != null && !sha256.isEmpty() && !hex.toString().equalsIgnoreCase(sha256)) throw new Exception("The download is damaged (checksum)");
                check(c, out);
                done.done(true, "");
            } catch (Exception e) {
                out.delete();
                done.done(false, e.getMessage() == null ? e.toString() : e.getMessage());
            }
        }).start();
    }

    /** Same app, same signing key, newer version. */
    @SuppressWarnings("deprecation")
    private static void check(Context c, File f) throws Exception {
        PackageManager pm = c.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES | PackageManager.GET_SIGNATURES : PackageManager.GET_SIGNATURES;
        PackageInfo neu = pm.getPackageArchiveInfo(f.getPath(), flags);
        PackageInfo mine = pm.getPackageInfo(c.getPackageName(), flags);
        if (neu == null) throw new Exception("The download isn't an app");
        if (!c.getPackageName().equals(neu.packageName)) throw new Exception("The download is a different app");
        if (code(neu) <= code(mine)) throw new Exception("The download isn't newer than this version");
        // Some Android versions can't read the signature of a file that isn't installed yet. Only
        // refuse a real difference: Android's installer itself rejects an update with another key.
        Signature[] theirs = signatures(neu), ours = signatures(mine);
        boolean readable = theirs != null && theirs.length > 0 && ours != null && ours.length > 0;
        android.util.Log.i("InkonabUpdate", "Signatures: app " + fingerprint(ours) + ", update " + fingerprint(theirs) + ", Android " + Build.VERSION.SDK_INT);
        if (readable && !Arrays.equals(theirs, ours)) {
            throw new Exception("The download has a different signature (app " + fingerprint(ours) + ", update " + fingerprint(theirs) + ")");
        }
    }

    @SuppressWarnings("deprecation")
    private static long code(PackageInfo p) { return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode; }

    @SuppressWarnings("deprecation")
    private static Signature[] signatures(PackageInfo p) {
        if (Build.VERSION.SDK_INT >= 28 && p.signingInfo != null) return p.signingInfo.getApkContentsSigners();
        return p.signatures;
    }

    /** First 8 hex digits of the certificate's SHA-256, or "none". */
    private static String fingerprint(Signature[] s) {
        if (s == null || s.length == 0) return "none";
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s[0].toByteArray());
            return String.format("%02x%02x%02x%02x", d[0], d[1], d[2], d[3]);
        } catch (Exception e) {
            return "unknown";
        }
    }

    /** Open Android's installer for the downloaded APK. */
    @SuppressWarnings("deprecation")
    public static boolean install(Activity a) {
        File f = apk(a);
        if (!f.exists()) return false;
        Uri uri = FileProvider.getUriForFile(a, a.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            a.startActivity(i);
        } catch (ActivityNotFoundException e) {
            a.startActivity(new Intent(Intent.ACTION_INSTALL_PACKAGE).setData(uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        return true;
    }
}
