package com.grimdrowned.drownedwallpaper;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

/** Tapping the app icon: show the wallpaper running full screen, with the system's "Set wallpaper" screen one tap away. */
public class SetWallpaperActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        try {
            Intent i = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
            i.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, new ComponentName(this, DrownedWallpaper.class));
            startActivity(i);
            finish();
        } catch (Exception e) { // no live wallpaper picker on this phone: at least show it playing
            WebView web = DrownedWallpaper.makeWebView(this);
            setContentView(web);
        }
    }
}
