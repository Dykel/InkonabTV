package tv.inkonab.app.hotel;

import android.app.Activity;
import android.app.Application;
import android.content.BroadcastReceiver;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;

/**
 * Most TVs go to standby instead of switching off, so there is no new start when the guest turns
 * the TV back on. While the app's process lives, this listens for the screen coming back on and
 * opens the welcome screen again if another app (or the TV's home screen) is in front.
 * A content provider is created when the process starts, before any screen, with no other code.
 */
public class WakeWatcher extends ContentProvider {
    private static boolean watching;
    private static int started; // our activities on screen

    static synchronized void watch(Context c) {
        if (watching) return;
        watching = true;
        Context app = c.getApplicationContext();
        app.registerReceiver(new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent i) { openSoon(ctx, "wake"); }
        }, new IntentFilter(Intent.ACTION_SCREEN_ON));
        if (app instanceof Application) ((Application) app).registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            @Override public void onActivityStarted(Activity a) { started++; }
            @Override public void onActivityStopped(Activity a) { started = Math.max(0, started - 1); }
            @Override public void onActivityCreated(Activity a, Bundle b) {}
            @Override public void onActivityResumed(Activity a) {}
            @Override public void onActivityPaused(Activity a) {}
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
            @Override public void onActivityDestroyed(Activity a) {}
        });
    }

    /**
     * Opens the welcome screen now and checks again a few seconds later: many TVs show their own
     * home screen just after switching on, on top of the app.
     */
    static void openSoon(Context c, String why) {
        Context app = c.getApplicationContext();
        android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
        for (long at : new long[] { 0, 3000, 8000, 15000 })
            h.postDelayed(() -> { if (started == 0) BootReceiver.open(app, why); }, at);
    }

    @Override public boolean onCreate() { if (getContext() != null) watch(getContext()); return true; }
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
