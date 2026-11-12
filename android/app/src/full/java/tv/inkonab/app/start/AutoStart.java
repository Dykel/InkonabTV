package tv.inkonab.app.start;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import tv.inkonab.app.MainActivity;

/**
 * InkonabTV+ only: "Open InkonabTV when the TV turns on" (Settings, off by default). The app
 * opens on the channel watched last. Android 10+ lets an app open itself at start only with
 * "Display over other apps"; the app asks for it when the setting is turned on.
 */
public class AutoStart extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (!c.getSharedPreferences("player", Context.MODE_PRIVATE).getBoolean("autostart", false)) return;
        if (Build.VERSION.SDK_INT >= 29 && !Settings.canDrawOverlays(c)) {
            Log.w("InkonabStart", "Can't open at start: \"Display over other apps\" is not allowed");
            return;
        }
        Intent open = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("inkonabtv://open?resume=1"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try { c.startActivity(open); } catch (Exception e) { Log.w("InkonabStart", "Open failed", e); }
    }
}
