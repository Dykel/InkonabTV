package tv.inkonab.app;

import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
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
    /**
     * TV home screen rows (Android TV channels and Play Next), written off the main thread.
     * Live TV, Movies and Series rows: Android adds the first by itself and asks once for each other.
     */
    /**
     * "Open InkonabTV when the TV turns on" (InkonabTV+ only). { on? } sets it; returns
     * { available, on, allowed } (allowed: Android lets the app open itself at start).
     */
    @PluginMethod
    public void autostart(PluginCall call) {
        android.content.Context c = getContext();
        android.content.SharedPreferences p = c.getSharedPreferences("player", android.content.Context.MODE_PRIVATE);
        if (call.getData().has("on")) p.edit().putBoolean("autostart", Boolean.TRUE.equals(call.getBoolean("on"))).apply();
        JSObject r = new JSObject();
        r.put("available", c.getPackageName().endsWith(".full"));
        r.put("on", p.getBoolean("autostart", false));
        r.put("allowed", android.os.Build.VERSION.SDK_INT < 29 || android.provider.Settings.canDrawOverlays(c));
        call.resolve(r);
    }

    /** Opens Android's "Display over other apps" page for this app; { opened: false } if the TV has none. */
    @PluginMethod
    public void autostartPermission(PluginCall call) {
        JSObject r = new JSObject();
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:" + getContext().getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            r.put("opened", true);
        } catch (Exception e) {
            r.put("opened", false);
        }
        call.resolve(r);
    }

    // ---------- recordings (InkonabTV+ only; on a USB drive) ----------
    /** → { available, usb, list } */
    @PluginMethod
    public void recordings(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", tv.inkonab.app.rec.Recorder.AVAILABLE);
        r.put("usb", tv.inkonab.app.rec.Recorder.usb(getContext()));
        try { r.put("list", new JSArray(tv.inkonab.app.rec.Recorder.list(getContext()).toString())); } catch (Exception e) { r.put("list", new JSArray()); }
        call.resolve(r);
    }

    /** { title, ch, url, start, end } → { ok, why } */
    @PluginMethod
    public void record(PluginCall call) {
        JSObject r = new JSObject();
        try {
            org.json.JSONObject job = new org.json.JSONObject()
                    .put("title", call.getString("title", "")).put("ch", call.getString("ch", ""))
                    .put("url", call.getString("url", "")).put("start", call.getData().optLong("start"))
                    .put("end", call.getData().optLong("end"));
            String why = tv.inkonab.app.rec.Recorder.add(getContext(), job);
            r.put("ok", why.isEmpty());
            r.put("why", why);
        } catch (Exception e) { r.put("ok", false); r.put("why", "Can't record this channel"); }
        call.resolve(r);
    }

    /** { id, delete? } stops (or cancels) a recording; delete also removes its file. */
    @PluginMethod
    public void recordStop(PluginCall call) {
        String id = call.getString("id", "");
        if (Boolean.TRUE.equals(call.getBoolean("delete", false))) tv.inkonab.app.rec.Recorder.remove(getContext(), id);
        else tv.inkonab.app.rec.Recorder.stop(getContext(), id);
        call.resolve();
    }

    // ---------- programme reminders (shared with PlayerActivity) ----------
    /** { json? } stores the list when given; returns { json, fired }. */
    @PluginMethod
    public void reminders(PluginCall call) {
        android.content.SharedPreferences p = getContext().getSharedPreferences("player", android.content.Context.MODE_PRIVATE);
        String json = call.getString("json");
        if (json != null) p.edit().putString("reminders", json).apply();
        String fired = call.getString("fired");
        if (fired != null) p.edit().putString("remFired", fired).apply();
        JSObject r = new JSObject();
        r.put("json", p.getString("reminders", "[]"));
        r.put("fired", p.getString("remFired", "[]"));
        call.resolve(r);
    }

    // ---------- backups ----------
    // In the app's own folder on each storage: a USB drive or memory stick first, else the TV's
    // own storage (no permission needed). On a USB drive it's Android/data/<app>/files/Backups,
    // so the stick carries it to another TV box with InkonabTV.

    private java.util.List<java.io.File> backupDirs() {
        java.util.List<java.io.File> usb = new java.util.ArrayList<>(), own = new java.util.ArrayList<>();
        for (java.io.File d : getContext().getExternalFilesDirs(null)) {
            if (d == null) continue;
            boolean removable = false;
            try { removable = android.os.Environment.isExternalStorageRemovable(d); } catch (Exception ignored) {}
            (removable ? usb : own).add(new java.io.File(d, "Backups"));
        }
        usb.addAll(own);
        if (usb.isEmpty()) usb.add(new java.io.File(getContext().getFilesDir(), "Backups"));
        return usb;
    }

    /** { json, name } → { path, usb } */
    @PluginMethod
    public void backupSave(PluginCall call) {
        String json = call.getString("json", "");
        String name = call.getString("name", "inkonabtv-backup.json").replaceAll("[^A-Za-z0-9._-]", "_");
        for (java.io.File dir : backupDirs()) {
            try {
                if (!dir.isDirectory() && !dir.mkdirs()) continue;
                java.io.File f = new java.io.File(dir, name);
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) { out.write(json.getBytes("UTF-8")); }
                JSObject r = new JSObject();
                r.put("path", f.getAbsolutePath());
                boolean usb = false;
                try { usb = android.os.Environment.isExternalStorageRemovable(dir.getParentFile()); } catch (Exception ignored) {}
                r.put("usb", usb);
                call.resolve(r);
                return;
            } catch (Exception ignored) {}
        }
        call.reject("Can't save the backup on this device");
    }

    /** → { list: [{ path, name, size, time, usb }] }, newest first. */
    @PluginMethod
    public void backupList(PluginCall call) {
        JSArray list = new JSArray();
        java.util.List<java.io.File> all = new java.util.ArrayList<>();
        java.util.Map<java.io.File, Boolean> onUsb = new java.util.HashMap<>();
        for (java.io.File dir : backupDirs()) {
            java.io.File[] fs = dir.listFiles((d, n) -> n.endsWith(".json"));
            if (fs == null) continue;
            boolean usb = false;
            try { usb = android.os.Environment.isExternalStorageRemovable(dir.getParentFile()); } catch (Exception ignored) {}
            for (java.io.File f : fs) { all.add(f); onUsb.put(f, usb); }
        }
        all.sort((a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        for (java.io.File f : all) {
            JSObject o = new JSObject();
            o.put("path", f.getAbsolutePath());
            o.put("name", f.getName());
            o.put("size", f.length());
            o.put("time", f.lastModified());
            o.put("usb", Boolean.TRUE.equals(onUsb.get(f)));
            list.put(o);
        }
        JSObject r = new JSObject();
        r.put("list", list);
        call.resolve(r);
    }

    /** { path } → { json } (only files in the backup folders). */
    @PluginMethod
    public void backupRead(PluginCall call) {
        String path = call.getString("path", "");
        try {
            java.io.File f = new java.io.File(path).getCanonicalFile();
            boolean ok = false;
            for (java.io.File dir : backupDirs()) if (f.getParentFile() != null && f.getParentFile().equals(dir.getCanonicalFile())) ok = true;
            if (!ok || f.length() > 5 * 1024 * 1024) { call.reject("Not a backup"); return; }
            byte[] b = new byte[(int) f.length()];
            try (java.io.FileInputStream in = new java.io.FileInputStream(f)) { int n = 0; while (n < b.length) { int k = in.read(b, n, b.length - n); if (k < 0) break; n += k; } }
            JSObject r = new JSObject();
            r.put("json", new String(b, "UTF-8"));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Can't read the backup");
        }
    }

    @PluginMethod
    public void homeRows(PluginCall call) {
        String json = call.getString("rows", "{}");
        android.app.Activity a = getActivity();
        Context c = getContext().getApplicationContext();
        new Thread(() -> {
            try {
                org.json.JSONObject r = HomeRows.update(c, new org.json.JSONObject(json));
                org.json.JSONArray ask = r.optJSONArray("ask");
                if (ask != null && ask.length() > 0 && a != null) a.runOnUiThread(() -> {
                    for (int i = 0; i < ask.length(); i++) {
                        Intent in = new Intent(androidx.tvprovider.media.tv.TvContractCompat.ACTION_REQUEST_CHANNEL_BROWSABLE)
                                .putExtra(androidx.tvprovider.media.tv.TvContractCompat.EXTRA_CHANNEL_ID, ask.optLong(i));
                        // For a result: the launcher checks which app is asking.
                        try { a.startActivityForResult(in, 7301 + i); } catch (Exception ignored) {}
                    }
                });
                call.resolve(JSObject.fromJSONObject(r));
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        }).start();
    }

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

    // ---------- start with the TV (hotel version) ----------

    /** { allowed }: Android 10+ opens an app from the background only with "Display over other apps". */
    @PluginMethod
    public void autostartStatus(PluginCall call) {
        JSObject o = new JSObject();
        o.put("allowed", android.os.Build.VERSION.SDK_INT < 29 || android.provider.Settings.canDrawOverlays(getContext()));
        // The hotel switch "Open the app when the TV starts" (read by hotel/BootReceiver); on by default.
        o.put("on", getContext().getSharedPreferences("hotel", Context.MODE_PRIVATE).getBoolean("autostart", true));
        call.resolve(o);
    }

    /** { on }: the hotel switch "Open the app when the TV starts". */
    @PluginMethod
    public void autostartSet(PluginCall call) {
        getContext().getSharedPreferences("hotel", Context.MODE_PRIVATE).edit().putBoolean("autostart", call.getBoolean("on", true)).apply();
        autostartStatus(call);
    }

    /**
     * Opens the "Display over other apps" switch. TVs differ: this app's own page, the list of
     * apps, or Android TV's settings screen. → { screen: "app" | "list" | "tv" | "none" }; "none"
     * when the TV has no such screen (then only home-screen mode or adb can make the app start).
     */
    @PluginMethod
    public void autostartSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            String act = android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION;
            Intent[] tries = {
                new Intent(act, Uri.parse("package:" + getContext().getPackageName())),
                new Intent(act),
                new Intent().setClassName("com.android.tv.settings", "com.android.tv.settings.device.apps.specialaccess.SystemAlertActivity"),
            };
            String[] names = { "app", "list", "tv" };
            JSObject out = new JSObject();
            out.put("screen", "none");
            for (int i = 0; i < tries.length; i++) {
                if (tries[i].resolveActivity(getContext().getPackageManager()) == null) continue;
                try { getActivity().startActivity(tries[i]); out.put("screen", names[i]); break; } catch (Exception ignored) { }
            }
            call.resolve(out);
        });
    }

    /**
     * Many TVs (TCL, Xiaomi, Hisense, Skyworth…) have their own "Auto-start" permission on top of
     * Android's: apps aren't told the TV started until it's allowed. Opens that screen: known
     * makers' auto-start managers, then any system screen whose name says auto-start, then this
     * app's info page (where such TVs usually show the switch). → { screen, name }.
     */
    @PluginMethod
    public void autostartVendor(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            android.content.pm.PackageManager pm = getContext().getPackageManager();
            java.util.List<Intent> tries = new java.util.ArrayList<>();
            String[][] known = {
                { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
                { "com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity" },
                { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
                { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
                { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
                { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
                { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
                { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity" },
                { "com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity" },
            };
            for (String[] k : known) tries.add(new Intent().setClassName(k[0], k[1]));
            // Any other system screen named like an auto-start manager (TV makers name them freely).
            java.util.regex.Pattern named = java.util.regex.Pattern.compile("(?i)(auto.?start|auto.?boot|auto.?launch|self.?start|boot.?start|start.?up.?(app|manage)|bootup)");
            try {
                for (android.content.pm.ApplicationInfo app : pm.getInstalledApplications(0)) {
                    if ((app.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) == 0) continue;
                    android.content.pm.PackageInfo pi;
                    try { pi = pm.getPackageInfo(app.packageName, android.content.pm.PackageManager.GET_ACTIVITIES); } catch (Exception e) { continue; }
                    if (pi.activities == null) continue;
                    for (android.content.pm.ActivityInfo ai : pi.activities)
                        if (ai.exported && named.matcher(ai.name).find()) tries.add(new Intent().setClassName(ai.packageName, ai.name));
                }
            } catch (Exception ignored) { }
            JSObject out = new JSObject();
            for (Intent t : tries) {
                // Only screens that really exist on this TV.
                try { pm.getActivityInfo(t.getComponent(), 0); } catch (Exception e) { continue; }
                try {
                    getActivity().startActivity(t.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    out.put("screen", "autostart");
                    out.put("name", t.getComponent() == null ? "" : t.getComponent().flattenToShortString());
                    call.resolve(out);
                    return;
                } catch (Exception ignored) { }
            }
            try {
                getActivity().startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
                out.put("screen", "app-info");
            } catch (Exception e) { out.put("screen", "none"); }
            call.resolve(out);
        });
    }

    // ---------- home-screen mode (hotel version) ----------
    // The hotel manifest has a disabled "home screen" entry (activity-alias .hotel.HotelHome).
    // Turned on and chosen as the TV's home app, the TV opens InkonabTV Hotel at every start and
    // on the Home button, with no "Display over other apps" needed.

    private android.content.ComponentName homeAlias() {
        return new android.content.ComponentName(getContext().getPackageName(), "tv.inkonab.app.hotel.HotelHome");
    }

    private JSObject homeJson() {
        JSObject o = new JSObject();
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        boolean exists = true;
        try { pm.getActivityInfo(homeAlias(), android.content.pm.PackageManager.MATCH_DISABLED_COMPONENTS); } catch (Exception e) { exists = false; }
        o.put("available", exists);
        o.put("enabled", exists && pm.getComponentEnabledSetting(homeAlias()) == android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED);
        android.content.pm.ResolveInfo r = pm.resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
        o.put("isHome", r != null && r.activityInfo != null && getContext().getPackageName().equals(r.activityInfo.packageName));
        return o;
    }

    @PluginMethod
    public void homeStatus(PluginCall call) { call.resolve(homeJson()); }

    /** { on }: on = offer InkonabTV Hotel as the home app (Android asks which one to use); off = remove it. */
    @PluginMethod
    public void homeSet(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        getActivity().runOnUiThread(() -> {
            android.content.pm.PackageManager pm = getContext().getPackageManager();
            try {
                pm.setComponentEnabledSetting(homeAlias(), on ? android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    : android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED, android.content.pm.PackageManager.DONT_KILL_APP);
            } catch (Exception e) { call.reject("Home-screen mode isn't available"); return; }
            JSObject o = homeJson();
            if (on && !o.getBool("isHome")) {
                // Press Home for the staff: a TV that lets apps be its home screen asks which one
                // to use (choose InkonabTV Hotel → Always); one that keeps its own launcher opens it.
                try {
                    getActivity().startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    o.put("asked", "home");
                } catch (Exception ignored) { }
            }
            call.resolve(o);
        });
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

    /**
     * { url } → { ok, status, text }: reads a playlist (M3U) natively, for sites that send no CORS
     * headers (the WebView refuses to read those). Follows redirects, also between http and https.
     */
    @PluginMethod
    public void fetchText(PluginCall call) {
        String link = call.getString("url", "");
        new Thread(() -> {
            JSObject out = new JSObject();
            java.net.HttpURLConnection conn = null;
            try {
                String at = link;
                for (int hops = 0; hops < 6; hops++) {
                    conn = (java.net.HttpURLConnection) new java.net.URL(at).openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setUseCaches(false);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("User-Agent", "InkonabTV");
                    int code = conn.getResponseCode();
                    if (code < 300 || code >= 400 || conn.getHeaderField("Location") == null) break;
                    at = new java.net.URL(new java.net.URL(at), conn.getHeaderField("Location")).toString();
                    conn.disconnect();
                }
                int code = conn.getResponseCode();
                out.put("status", code);
                if (code != 200) throw new Exception("Playlist " + code);
                java.io.ByteArrayOutputStream body = new java.io.ByteArrayOutputStream();
                try (java.io.InputStream in = conn.getInputStream()) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        body.write(buf, 0, n);
                        if (body.size() > 64 * 1024 * 1024) throw new Exception("Playlist too big");
                    }
                }
                out.put("ok", true);
                out.put("text", body.toString("UTF-8"));
            } catch (Exception e) {
                out.put("ok", false);
                out.put("text", e.getMessage() == null ? e.toString() : e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
            call.resolve(out);
        }).start();
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
            String done = d.getStringExtra("done"); // episodes that finished in the player
            if (done != null) try { out.put("done", new JSArray(done)); } catch (Exception ignored) { }
            try {
                out.put("history", new JSArray(d.getStringExtra("history")));
                out.put("fav", new JSObject(d.getStringExtra("fav")));
                if (d.getStringExtra("remindOpen") != null) out.put("remindOpen", d.getStringExtra("remindOpen"));
            } catch (Exception ignored) {
            }
        }
        call.resolve(out);
    }
}
