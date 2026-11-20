package com.grimdrowned.drownedwallpaper;

import android.app.Activity;
import android.app.WallpaperInfo;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebView;

/**
 * The one app: tapping the icon the first time opens Android's "Set wallpaper" preview, and when that closes
 * (or straight away, once Drowned Light is already the wallpaper) the full game opens to play: upright the
 * knight fights on its own, turned sideways you take control.
 */
public class GameActivity extends Activity {
    static final int PICK = 1;
    WebView web;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (b == null && !isOurWallpaper()) {
            try {
                Intent i = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                i.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, new ComponentName(this, DrownedWallpaper.class));
                startActivityForResult(i, PICK);
            } catch (Exception e) { /* no live wallpaper picker on this phone: just play */ }
        }
        web = DrownedWallpaper.makeWebView(this, "index.html");
        setContentView(web);
        immersive();
    }

    boolean isOurWallpaper() {
        WallpaperInfo info = WallpaperManager.getInstance(this).getWallpaperInfo();
        return info != null && info.getComponent().getClassName().equals(DrownedWallpaper.class.getName());
    }

    void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) { c.hide(WindowInsets.Type.systemBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) immersive(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
