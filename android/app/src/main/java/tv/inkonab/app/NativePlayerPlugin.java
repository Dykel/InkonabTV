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

import tv.inkonab.app.vpn.VpnManager;

/** JS: Capacitor.Plugins.NativePlayer.play(payload) → resolves when the player closes. */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    @Override
    public void load() {
        VpnManager.get().init(getContext());
        // Live VPN status for the Settings screen.
        VpnManager.get().addListener((state, detail) -> notifyListeners("vpn", vpnJson()));
    }

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

    // ---------- free VPN (VPN Gate) ----------

    private JSObject vpnJson() {
        VpnManager v = VpnManager.get();
        JSObject o = new JSObject();
        o.put("state", v.state().name().toLowerCase());
        o.put("detail", v.detail());
        o.put("server", v.serverLabel());
        o.put("mode", v.mode());
        o.put("country", v.country());
        return o;
    }

    @PluginMethod
    public void vpnStatus(PluginCall call) { call.resolve(vpnJson()); }

    @PluginMethod
    public void vpnSettings(PluginCall call) {
        VpnManager v = VpnManager.get();
        if (call.hasOption("mode")) v.setMode(call.getString("mode", "auto"));
        if (call.hasOption("country")) v.setCountry(call.getString("country", ""));
        call.resolve(vpnJson());
    }

    @PluginMethod
    public void vpnConnect(PluginCall call) {
        Intent consent = VpnManager.get().consentIntent(getContext());
        if (consent != null) { startActivityForResult(call, consent, "onVpnConsent"); return; }
        doConnect(call);
    }

    @ActivityCallback
    private void onVpnConsent(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (VpnManager.get().consentIntent(getContext()) != null) { call.reject("VPN permission was not granted"); return; }
        doConnect(call);
    }

    private void doConnect(PluginCall call) {
        VpnManager.get().connect((ok, detail) -> {
            JSObject o = vpnJson();
            o.put("ok", ok);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void vpnDisconnect(PluginCall call) {
        VpnManager.get().disconnect();
        call.resolve(vpnJson());
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
