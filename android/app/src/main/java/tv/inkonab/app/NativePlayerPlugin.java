package tv.inkonab.app;

import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS: Capacitor.Plugins.NativePlayer.play(payload) → resolves when the player closes. */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    @PluginMethod
    public void play(PluginCall call) {
        // Live payloads carry every channel and can exceed the Intent size limit, so hand them over directly.
        PlayerActivity.pending = call.getData().toString();
        Intent intent = new Intent(getContext(), PlayerActivity.class);
        startActivityForResult(call, intent, "onClosed");
    }

    /** { tv: true } on Android TV / Google TV, so the web UI can use its TV-sized layout. */
    @PluginMethod
    public void info(PluginCall call) {
        UiModeManager ui = (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        JSObject out = new JSObject();
        out.put("tv", ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION);
        call.resolve(out);
    }

    @ActivityCallback
    private void onClosed(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject out = new JSObject();
        Intent d = result.getData();
        if (d != null) {
            out.put("position", d.getDoubleExtra("position", 0));
            out.put("duration", d.getDoubleExtra("duration", 0));
            out.put("ended", d.getBooleanExtra("ended", false));
            out.put("group", d.getIntExtra("group", 0));
            out.put("index", d.getIntExtra("index", 0));
            out.put("version", d.getIntExtra("version", 0));
            try {
                out.put("history", new JSArray(d.getStringExtra("history")));
                out.put("fav", new JSObject(d.getStringExtra("fav")));
            } catch (Exception ignored) {
            }
        }
        call.resolve(out);
    }
}
