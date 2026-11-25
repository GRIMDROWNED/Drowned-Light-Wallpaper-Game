package com.grimdrowned.drownedwallpaper;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Update check against GitHub releases. Every Android build on main is published as release "android-N"
 * (N = the build number, which is also this app's versionCode), and the repo's "latest" release is always the
 * newest Android one. When the game opens, this asks GitHub which release is latest; if it is newer, it offers
 * the update and opens the APK link in the browser, which downloads it and hands it to Android's installer.
 * The app deliberately does NOT install the APK itself: that needs the REQUEST_INSTALL_PACKAGES permission,
 * and Play Protect flags an app signed with the public debug key that can install apps as possibly harmful.
 */
final class Updater {
    static final String REPO = "https://github.com/GRIMDROWNED/Drowned-Light-Wallpaper-Game/releases/";
    static final String APK = REPO + "latest/download/drowned-light-wallpaper.apk";
    static final long ASK_EVERY = 6L * 60 * 60 * 1000; // "Later" keeps quiet for 6 hours
    static final Handler ui = new Handler(Looper.getMainLooper());
    static boolean busy;

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
                .setMessage("Version " + latest + " of Drowned Light is out (you have " + build(a) + "). Tap Update to download it, then open the download to install. Your saves stay.")
                .setPositiveButton("Update", (d, w) -> {
                    try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(APK))); }
                    catch (Exception e) { Toast.makeText(a, "Couldn't open the browser.", Toast.LENGTH_LONG).show(); }
                })
                .setNegativeButton("Later", (d, w) -> prefs(a).edit().putLong("later", System.currentTimeMillis()).apply())
                .setCancelable(false)
                .show();
    }
}
