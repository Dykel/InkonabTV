package tv.inkonab.app.vpn;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.LocalServerSocket;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.util.Log;

import java.io.File;
import java.io.FileDescriptor;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

import tv.inkonab.app.MainActivity;

/**
 * App-only VPN: runs the OpenVPN 2 engine (libovpnexec.so, built from OpenVPN for Android)
 * and answers its Android management requests — protect the server socket, then build the
 * tun device with VpnService.Builder. Only this app's traffic goes through the tunnel
 * (addAllowedApplication), the rest of the device is untouched.
 *
 * Start with ACTION_CONNECT + EXTRA_CONFIG / EXTRA_NAME, stop with ACTION_STOP.
 * State is reported to {@link VpnManager}.
 */
public class InkonabVpnService extends VpnService {
    static final String ACTION_CONNECT = "tv.inkonab.vpn.CONNECT";
    static final String ACTION_STOP = "tv.inkonab.vpn.STOP";
    static final String EXTRA_CONFIG = "config";
    static final String EXTRA_NAME = "name";
    private static final String TAG = "InkonabVPN";
    private static final String CHANNEL = "vpn";

    private Process process;
    private Thread mgmtThread;
    private LocalServerSocket server;
    private LocalSocket mgmt;
    private ParcelFileDescriptor tun;
    private volatile boolean stopping;
    private int session;
    private int failedSession = -1;   // report each attempt's failure once (EXITING and the process exit both arrive)

    // Tunnel settings collected from NEED-OK requests until OPENTUN.
    private String ip4; private int prefix4; private int mtu = 1500;
    private final List<String[]> routes = new ArrayList<>();
    private final List<String> dns = new ArrayList<>();
    private final ArrayDeque<FileDescriptor> fds = new ArrayDeque<>();

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopping = true;
            shutdown();
            VpnManager.get().onServiceState(VpnManager.State.DISCONNECTED, null);
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        String name = intent.getStringExtra(EXTRA_NAME);
        foreground(name == null ? "Connecting…" : "Connecting to " + name);
        stopping = false;
        shutdown();
        final int my = ++session;
        String config = intent.getStringExtra(EXTRA_CONFIG);
        new Thread(() -> run(my, config, name), "ovpn-start").start();
        return START_NOT_STICKY;
    }

    private void run(int my, String config, String name) {
        try {
            File sock = new File(getCacheDir(), "mgmtsocket");
            //noinspection ResultOfMethodCallIgnored
            sock.delete();
            LocalSocket bind = new LocalSocket();
            bind.bind(new LocalSocketAddress(sock.getAbsolutePath(), LocalSocketAddress.Namespace.FILESYSTEM));
            server = new LocalServerSocket(bind.getFileDescriptor());

            String bin = new File(getApplicationInfo().nativeLibraryDir, "libovpnexec.so").getAbsolutePath();
            ProcessBuilder pb = new ProcessBuilder(bin, "--config", "stdin");
            pb.environment().put("LD_LIBRARY_PATH", getApplicationInfo().nativeLibraryDir);
            pb.environment().put("TMPDIR", getCacheDir().getAbsolutePath());
            pb.redirectErrorStream(true);
            process = pb.start();
            try (OutputStream in = process.getOutputStream()) {
                in.write(fullConfig(config, sock.getAbsolutePath()).getBytes(StandardCharsets.UTF_8));
            }
            Process p = process;
            new Thread(() -> logOutput(p, my), "ovpn-log").start();

            mgmt = server.accept();
            mgmtThread = Thread.currentThread();
            send("version 3\n");
            readManagement(my, name);
        } catch (Exception e) {
            Log.w(TAG, "VPN failed: " + e);
            fail(my, e.getMessage());
        }
    }

    /** The server's config plus what the Android engine needs: management socket and sane timeouts. */
    private String fullConfig(String base, String socket) {
        StringBuilder c = new StringBuilder();
        c.append("management ").append(socket).append(" unix\n");
        c.append("management-client\nmanagement-query-passwords\nmanagement-hold\n");
        c.append("machine-readable-output\nifconfig-nowarn\n");
        for (String line : base.split("\r?\n")) {
            String t = line.trim();
            // Drop options the embedded engine handles itself or that block a non-interactive start.
            if (t.startsWith("auth-user-pass") || t.startsWith("up ") || t.startsWith("down ") || t.startsWith("script-security")) continue;
            c.append(line).append('\n');
        }
        // Many VPN Gate servers require their public login (vpn / vpn); OpenVPN asks for it over the
        // management socket and handle() answers. Servers that don't need it ignore it.
        c.append("auth-user-pass\nauth-retry none\n");
        // VPN Gate servers speak older TLS/ciphers; allow them, and fail fast so failover moves on.
        c.append("tls-cipher DEFAULT:@SECLEVEL=0\n");
        c.append("data-ciphers AES-128-CBC:AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305\n");
        c.append("connect-timeout 12\nconnect-retry-max 1\nserver-poll-timeout 12\n");
        c.append("ping 10\nping-restart 40\n");
        return c.toString();
    }

    private void logOutput(Process p, int my) {
        try (InputStream in = p.getInputStream()) {
            byte[] b = new byte[4096];
            for (int n; (n = in.read(b)) > 0; ) Log.d(TAG, new String(b, 0, n, StandardCharsets.UTF_8).trim());
        } catch (Exception ignored) {
        }
        try { p.waitFor(); } catch (InterruptedException ignored) { }
        fail(my, "OpenVPN exited");
    }

    private void readManagement(int my, String name) throws Exception {
        InputStream in = mgmt.getInputStream();
        byte[] buf = new byte[4096];
        StringBuilder pending = new StringBuilder();
        for (int n; (n = in.read(buf)) > 0; ) {
            FileDescriptor[] got = mgmt.getAncillaryFileDescriptors();
            if (got != null) for (FileDescriptor fd : got) fds.add(fd);
            pending.append(new String(buf, 0, n, StandardCharsets.UTF_8));
            int nl;
            while ((nl = pending.indexOf("\n")) >= 0) {
                String line = pending.substring(0, nl).trim();
                pending.delete(0, nl + 1);
                if (my != session) return;
                handle(line, name, my);
            }
        }
    }

    private synchronized void fail(int my, String why) {
        if (stopping || my != session || failedSession == my) return;
        failedSession = my;
        VpnManager.get().onServiceState(VpnManager.State.FAILED, why);
    }

    private void handle(String line, String name, int my) throws Exception {
        if (line.startsWith(">HOLD:")) {
            send("state on\n");
            send("hold release\n");
        } else if (line.startsWith(">PASSWORD:Need 'Auth'")) {
            send("username 'Auth' vpn\n");      // VPN Gate's public credentials
            send("password 'Auth' vpn\n");
        } else if (line.startsWith(">NEED-OK:")) {
            needOk(line);
        } else if (line.startsWith(">STATE:")) {
            String[] f = line.substring(7).split(",");
            String state = f.length > 1 ? f[1] : "";
            if (state.equals("CONNECTED")) {
                foreground("Connected · " + name);
                VpnManager.get().onServiceState(VpnManager.State.CONNECTED, name);
            } else if (state.equals("RECONNECTING") || state.equals("EXITING")) {
                fail(my, state);
            }
        } else if (line.startsWith(">FATAL:")) {
            fail(my, line.substring(7));
        }
    }

    private void needOk(String line) throws Exception {
        int p1 = line.indexOf('\''), p2 = line.indexOf('\'', p1 + 1);
        String need = line.substring(p1 + 1, p2);
        int m = line.indexOf("MSG:");
        String msg = m >= 0 ? line.substring(m + 4) : "";
        String status = "ok";
        switch (need) {
            case "PROTECTFD": {
                // Keep OpenVPN's own connection to the server outside the tunnel.
                FileDescriptor fd = fds.pollFirst();
                if (fd != null) {
                    ParcelFileDescriptor dup = ParcelFileDescriptor.dup(fd);
                    protect(dup.getFd());
                    dup.close();
                    Os.close(fd);
                }
                break;
            }
            case "IFCONFIG": {   // "10.211.1.10 255.255.255.0 1500 subnet"
                String[] p = msg.split(" ");
                ip4 = p[0];
                prefix4 = maskToPrefix(p[1]);
                if (p.length > 3 && p[3].equals("net30") && prefix4 > 30) prefix4 = 30;
                mtu = Integer.parseInt(p[2]);
                break;
            }
            case "IFCONFIG6":
                break; // IPv4 is enough for the app's traffic
            case "ROUTE": {      // "network netmask gateway [dev x]"
                String[] p = msg.split(" ");
                routes.add(new String[]{p[0], String.valueOf(maskToPrefix(p[1]))});
                break;
            }
            case "ROUTE6":
                break;
            case "DNSSERVER":
                dns.add(msg.trim());
                break;
            case "DNS6SERVER":
            case "DNSDOMAIN":
            case "HTTPPROXY":
                break;
            case "PERSIST_TUN_ACTION":
                status = "OPEN_BEFORE_CLOSE";
                break;
            case "OPENTUN":
                if (openTun()) return;
                status = "cancel";
                break;
            default:
                Log.w(TAG, "Unknown NEED-OK " + need);
        }
        send("needok '" + need + "' " + status + "\n");
    }

    private boolean openTun() {
        try {
            Builder b = new Builder();
            b.setSession("InkonabTV");
            b.setMtu(mtu);
            if (ip4 != null) b.addAddress(ip4, prefix4);
            // App-only tunnel: route everything this app sends, nothing from other apps.
            b.addRoute("0.0.0.0", 0);
            if (dns.isEmpty()) { dns.add("1.1.1.1"); dns.add("8.8.8.8"); }
            for (String d : dns) b.addDnsServer(d);
            b.addAllowedApplication(getPackageName());
            b.setBlocking(false);
            Intent open = new Intent(this, MainActivity.class);
            b.setConfigureIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE));
            ParcelFileDescriptor fd = b.establish();
            if (fd == null) return false;
            mgmt.setFileDescriptorsForSend(new FileDescriptor[]{fd.getFileDescriptor()});
            send("needok 'OPENTUN' ok\n");
            mgmt.setFileDescriptorsForSend(null);
            if (tun != null) tun.close();
            tun = fd;
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Could not open tun: " + e);
            return false;
        } finally {
            routes.clear();
        }
    }

    private static int maskToPrefix(String mask) {
        try {
            int bits = 0;
            for (String part : mask.split("\\.")) bits += Integer.bitCount(Integer.parseInt(part));
            return bits;
        } catch (Exception e) {
            return 24;
        }
    }

    private synchronized void send(String cmd) throws Exception {
        if (mgmt == null) return;
        OutputStream out = mgmt.getOutputStream();
        out.write(cmd.getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private void shutdown() {
        try { if (mgmt != null) { mgmt.getOutputStream().write("signal SIGTERM\n".getBytes()); } } catch (Exception ignored) { }
        try { if (mgmt != null) mgmt.close(); } catch (Exception ignored) { }
        try { if (server != null) server.close(); } catch (Exception ignored) { }
        if (process != null) process.destroy();
        try { if (tun != null) tun.close(); } catch (Exception ignored) { }
        mgmt = null; server = null; process = null; tun = null;
        ip4 = null; dns.clear(); routes.clear(); fds.clear();
    }

    private void foreground(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "VPN", NotificationManager.IMPORTANCE_LOW));
        Notification.Builder n = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        n.setSmallIcon(android.R.drawable.ic_lock_lock).setContentTitle("InkonabTV VPN").setContentText(text).setOngoing(true);
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n.build());
    }

    @Override
    public void onRevoke() {
        stopping = true;
        shutdown();
        VpnManager.get().onServiceState(VpnManager.State.DISCONNECTED, "revoked");
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopping = true;
        shutdown();
        super.onDestroy();
    }
}
