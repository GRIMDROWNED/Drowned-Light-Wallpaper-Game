package com.grimdrowned.drownedwallpaper;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Self-update from GitHub releases, like the Windows app. Every Android build on main is published as release
 * "android-N" (N = the build number, which is also this app's versionCode), and the repo's "latest" release is
 * always the newest Android one. When the game opens, this asks GitHub which release is latest; if it is newer,
 * it offers to update, downloads the APK and hands it to Android's own installer. Android always asks before an
 * app installs anything: the first time it asks to allow "install unknown apps" for Drowned Light, and on
 * Android 12+ later updates go through without the extra Install tap.
 */
final class Updater {
    static final String REPO = "https://github.com/GRIMDROWNED/Drowned-Light-Wallpaper-Game/releases/";
    static final String APK = REPO + "latest/download/drowned-light-wallpaper.apk";
    static final String DONE = "com.grimdrowned.drownedwallpaper.UPDATE_DONE";
    static final long ASK_EVERY = 6L * 60 * 60 * 1000; // "Later" keeps quiet for 6 hours
    static final Handler ui = new Handler(Looper.getMainLooper());

    static boolean busy;
    static AlertDialog box; // the "Updating" box, closed when Android reports back
    static int waitingFor; // the build to fetch once "install unknown apps" is allowed

    /** This app's build number. */
    static int build(Context ctx) {
        try {
            PackageInfo p = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) p.getLongVersionCode() : p.versionCode;
        } catch (Exception e) { return 0; }
    }

    static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences("updater", Context.MODE_PRIVATE); }

    /** Called when the game opens: looks for a newer release in the background and offers it. */
    static void check(Activity a) {
        if (busy) return;
        if (System.currentTimeMillis() - prefs(a).getLong("later", 0) < ASK_EVERY) return;
        busy = true;
        new Thread(() -> {
            int latest = 0;
            try { latest = latest(); } catch (Exception ignored) { /* offline: try next time */ }
            final int got = latest;
            ui.post(() -> {
                busy = false;
                if (got > build(a) && !a.isFinishing()) offer(a, got);
            });
        }, "update-check").start();
    }

    /** The newest release's build number, read from where GitHub's "latest" link points (releases/tag/android-N). */
    static int latest() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(REPO + "latest").openConnection();
        c.setInstanceFollowRedirects(false);
        c.setRequestMethod("HEAD");
        c.setConnectTimeout(10000);
        c.setReadTimeout(10000);
        c.setRequestProperty("User-Agent", "DrownedLight-android");
        String to = c.getHeaderField("Location");
        c.disconnect();
        Matcher m = Pattern.compile("android-(\\d+)").matcher(to == null ? "" : to);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    static void offer(Activity a, int latest) {
        new AlertDialog.Builder(a)
                .setTitle("Update ready")
                .setMessage("Version " + latest + " of Drowned Light is out (you have " + build(a) + "). Update now? Your saves stay.")
                .setPositiveButton("Update", (d, w) -> start(a, latest))
                .setNegativeButton("Later", (d, w) -> prefs(a).edit().putLong("later", System.currentTimeMillis()).apply())
                .setCancelable(false)
                .show();
    }

    /** Asks for "install unknown apps" first if Android needs it, then downloads. */
    static void start(Activity a, int latest) {
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            waitingFor = latest;
            new AlertDialog.Builder(a)
                    .setTitle("One-time permission")
                    .setMessage("Android needs you to allow Drowned Light to install its own updates. On the next screen, turn on \"Allow from this source\", then come back.")
                    .setPositiveButton("Open settings", (d, w) -> {
                        try { a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName()))); }
                        catch (Exception e) { waitingFor = 0; toast(a, "Couldn't open the settings screen."); }
                    })
                    .setNegativeButton("Later", (d, w) -> waitingFor = 0)
                    .show();
            return;
        }
        download(a, latest);
    }

    /** Called from GameActivity.onResume: carries on once the player has allowed installs. */
    static void resumed(Activity a) {
        if (waitingFor == 0) return;
        int latest = waitingFor;
        waitingFor = 0;
        if (Build.VERSION.SDK_INT < 26 || a.getPackageManager().canRequestPackageInstalls()) download(a, latest);
        else toast(a, "Update skipped: installing wasn't allowed. It will ask again next time.");
    }

    static void download(Activity a, int latest) {
        if (busy) return;
        busy = true;
        box = new AlertDialog.Builder(a).setTitle("Updating").setMessage("Downloading version " + latest + "...").setCancelable(false).show();
        Context app = a.getApplicationContext();
        new Thread(() -> {
            String err = null;
            try { install(app); }
            catch (Exception e) { err = "The update couldn't download. Check your connection and open the game again to retry."; }
            final String fail = err;
            ui.post(() -> {
                busy = false;
                if (fail != null) { closeBox(); toast(app, fail); }
            });
        }, "update-download").start();
    }

    /** Streams the APK straight into an Android install session and commits it. */
    static void install(Context app) throws Exception {
        PackageInstaller pi = app.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(app.getPackageName());
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = pi.createSession(params);
        PackageInstaller.Session s = pi.openSession(id);
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(APK).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "DrownedLight-android");
            long size = c.getContentLengthLong(), done = 0;
            try (InputStream in = c.getInputStream(); OutputStream out = s.openWrite("app.apk", 0, size > 0 ? size : -1)) {
                byte[] buf = new byte[65536];
                int n, shown = -1;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    int pct = size > 0 ? (int) (done * 100 / size) : -1;
                    if (pct != shown) { shown = pct; ui.post(() -> { try { if (box != null) box.setMessage("Downloading... " + pct + "%"); } catch (Exception ignored) { } }); }
                }
                s.fsync(out);
            } finally { c.disconnect(); }
            if (done < 1_000_000 || (size > 0 && done != size)) throw new Exception("cut-off download");
            ui.post(() -> { try { if (box != null) box.setMessage("Installing... the game closes when it's done. Tap the Drowned Light icon to play the new version."); } catch (Exception ignored) { } });
            Intent i = new Intent(DONE).setPackage(app.getPackageName()).setClass(app, Done.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            s.commit(PendingIntent.getBroadcast(app, id, i, flags).getIntentSender());
        } catch (Exception e) { s.abandon(); throw e; }
        finally { s.close(); }
    }

    static void closeBox() {
        try { if (box != null) box.dismiss(); } catch (Exception ignored) { }
        box = null;
    }

    static void toast(Context ctx, String msg) { Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show(); }

    /** Android reports back here: either it needs the player's OK (show its install screen) or it finished. */
    public static class Done extends BroadcastReceiver {
        @Override public void onReceive(Context ctx, Intent intent) {
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    try { ctx.startActivity(confirm); } catch (Exception e) { toast(ctx, "Couldn't show the install screen."); }
                }
            } else if (status != PackageInstaller.STATUS_SUCCESS) {
                ui.post(Updater::closeBox);
                String why = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                toast(ctx, "Update not installed" + (why != null ? ": " + why : "."));
            }
        }
    }
}
