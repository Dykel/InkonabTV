package tv.inkonab.app.update;

import android.app.Activity;
import android.content.Context;

/**
 * Google Play version: Play updates the app, so there's no self-update. Same API as the
 * sideload version's Updater (src/full).
 */
public final class Updater {
    public static final boolean AVAILABLE = false;

    public interface Progress { void on(long done, long total); }
    public interface Done { void done(boolean ok, String detail); }

    private Updater() {}

    public static boolean canInstall(Context c) { return false; }
    public static void openInstallSettings(Activity a) {}
    public static void fetchText(String link, Done done) { done.done(false, "Updates come from Google Play"); }
    public static void download(Context c, String link, String sha256, Progress progress, Done done) { done.done(false, "Updates come from Google Play"); }
    public static boolean install(Activity a) { return false; }
}
