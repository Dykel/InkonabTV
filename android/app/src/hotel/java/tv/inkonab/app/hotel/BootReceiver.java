package tv.inkonab.app.hotel;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import tv.inkonab.app.MainActivity;

/** TV switched on: open the hotel welcome screen. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        WakeWatcher.watch(c);
        WakeWatcher.openSoon(c, "boot");
    }

    /** Brings the welcome screen to the front. Android 10+ allows it only with "Display over other apps". */
    static void open(Context c, String why) {
        // Staff switch in the app's Settings: "Open the app when the TV starts".
        if (!c.getSharedPreferences("hotel", Context.MODE_PRIVATE).getBoolean("autostart", true)) return;
        if (Build.VERSION.SDK_INT >= 29 && !Settings.canDrawOverlays(c)) {
            Log.w("InkonabHotel", "Can't open on " + why + ": \"Display over other apps\" is not allowed");
            return;
        }
        Intent launch = new Intent(c, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            .putExtra("hotelStart", why);
        try { c.startActivity(launch); } catch (Exception e) { Log.w("InkonabHotel", "Open failed", e); }
    }
}
