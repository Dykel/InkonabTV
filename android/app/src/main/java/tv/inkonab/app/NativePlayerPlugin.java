package tv.inkonab.app;

import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import tv.inkonab.app.update.Updater;
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

    /**
     * Hand the (possibly multi-megabyte) live payload to the player first, in a call that
     * resolves at once. play() is then called with { staged: true }: Capacitor saves the data of
     * a call waiting for an activity result into the activity's saved state, and a full channel
     * list there crashes the app (TransactionTooLargeException) as soon as the player opens.
     */
    @PluginMethod
    public void stage(PluginCall call) {
        PlayerActivity.pending = call.getString("payload");
        call.resolve();
    }

    @PluginMethod
    public void play(PluginCall call) {
        if (!call.getBoolean("staged", false)) PlayerActivity.pending = call.getData().toString();
        if (PlayerActivity.pending == null) { call.reject("Nothing to play"); return; }
        Intent intent = new Intent(getContext(), PlayerActivity.class);
        startActivityForResult(call, intent, "onClosed");
    }

    /** Open the on-screen keyboard for the focused text field (TV remotes can't tap a field). */
    @PluginMethod
    public void showKeyboard(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WebView w = getBridge().getWebView();
            // Re-focusing a focused WebView makes it jump back to the last field it knew.
            if (!w.hasFocus()) w.requestFocus();
            InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            //noinspection deprecation — SHOW_FORCED is what makes the TV keyboard appear for a WebView field
            if (imm != null) imm.showSoftInput(w, InputMethodManager.SHOW_FORCED);
            call.resolve();
        });
    }

    /** { tv: true } on Android TV / Google TV, so the web UI can use its TV-sized layout. */
    @PluginMethod
    public void info(PluginCall call) {
        UiModeManager ui = (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        JSObject out = new JSObject();
        out.put("tv", ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION);
        call.resolve(out);
    }

    // ---------- self-update (sideload version; the Play version answers updater: false) ----------

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void appVersion(PluginCall call) {
        JSObject out = new JSObject();
        try {
            android.content.pm.PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            out.put("code", android.os.Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
            out.put("name", p.versionName);
        } catch (Exception ignored) { }
        out.put("updater", Updater.AVAILABLE);
        out.put("canInstall", Updater.canInstall(getContext()));
        call.resolve(out);
    }

    /** { url } → { ok, text }: reads version.json natively (the update site sends no CORS headers). */
    @PluginMethod
    public void updateInfo(PluginCall call) {
        Updater.fetchText(call.getString("url"), (ok, text) -> {
            JSObject out = new JSObject();
            out.put("ok", ok);
            out.put("text", text);
            call.resolve(out);
        });
    }

    /** Download { url, sha256 }, check it, then open Android's installer. Progress: "update" events. */
    @PluginMethod
    public void updateDownload(PluginCall call) {
        Updater.download(getContext(), call.getString("url"), call.getString("sha256", ""),
            (done, total) -> { JSObject e = new JSObject(); e.put("done", done); e.put("total", total); notifyListeners("update", e); },
            (ok, detail) -> getActivity().runOnUiThread(() -> {
                JSObject out = new JSObject();
                out.put("ok", ok);
                out.put("detail", detail);
                if (ok) Updater.install(getActivity());
                call.resolve(out);
            }));
    }

    /** Open the installer again for the APK already downloaded (after allowing installs). */
    @PluginMethod
    public void updateInstall(PluginCall call) {
        getActivity().runOnUiThread(() -> { JSObject o = new JSObject(); o.put("ok", Updater.install(getActivity())); call.resolve(o); });
    }

    /** The "Install unknown apps" switch for InkonabTV+. */
    @PluginMethod
    public void updateSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> { Updater.openInstallSettings(getActivity()); call.resolve(); });
    }

    // ---------- free VPN (VPN Gate) ----------

    private JSObject vpnJson() {
        VpnManager v = VpnManager.get();
        JSObject o = new JSObject();
        o.put("available", VpnManager.AVAILABLE);
        o.put("state", v.state().name().toLowerCase());
        o.put("detail", v.detail());
        o.put("server", v.serverLabel());
        o.put("mode", v.mode());
        o.put("country", v.country());
        o.put("remembered", v.rememberedLabel());
        o.put("need", v.needVpn());
        o.put("speed", v.speedKbps());
        return o;
    }

    @PluginMethod
    public void vpnStatus(PluginCall call) { call.resolve(vpnJson()); }

    @PluginMethod
    public void vpnSettings(PluginCall call) {
        VpnManager v = VpnManager.get();
        if (call.hasOption("mode")) v.setMode(call.getString("mode", "auto"));
        if (call.hasOption("country")) v.setCountry(call.getString("country", ""));
        if (call.getBoolean("forget", false)) v.forget();
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

    /** Leave the current server for the next one (it connects but can't reach the provider). */
    @PluginMethod
    public void vpnSwitch(PluginCall call) {
        VpnManager.get().switchServer((ok, detail) -> {
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
