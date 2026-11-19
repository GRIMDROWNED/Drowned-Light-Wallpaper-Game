package com.grimdrowned.drownedwallpaper;

import android.app.Presentation;
import android.app.WallpaperManager;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;

/**
 * Drowned Light live wallpaper. The game's wallpaper page runs in a WebView shown on a private virtual display
 * whose surface IS the wallpaper's surface, so the page draws straight onto the home screen with the GPU.
 * The page's files come from the APK's assets (app/build.gradle copies them in), served under a made-up https
 * host so their ?v= cache-busting queries and same-origin rules behave as on the website.
 */
public class DrownedWallpaper extends WallpaperService {
    static final String HOST = "https://drowned.local/";

    @Override public Engine onCreateEngine() { return new WebEngine(); }

    /** Serves https://drowned.local/<path>?... from assets/www/<path>. */
    static WebResourceResponse serve(Context ctx, String url) {
        if (!url.startsWith(HOST)) return null;
        String path = url.substring(HOST.length());
        int q = path.indexOf('?'); if (q >= 0) path = path.substring(0, q);
        int h = path.indexOf('#'); if (h >= 0) path = path.substring(0, h);
        if (path.isEmpty()) path = "wallpaper.html";
        try {
            InputStream in = ctx.getAssets().open("www/" + path);
            return new WebResourceResponse(mime(path), mime(path).startsWith("text") || path.endsWith(".js") ? "utf-8" : null, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }
    static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    static WebView makeWebView(Context ctx, String page) {
        WebView web = new WebView(ctx);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setBackgroundColor(0xFF0A1420);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return serve(view.getContext(), req.getUrl().toString());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) { return true; }
        });
        web.loadUrl(HOST + page);
        return web;
    }

    class WebEngine extends Engine {
        VirtualDisplay display;
        Presentation presentation;
        WebView web;

        // Double-tap on empty home-screen space opens the game.
        // Home screens report taps on empty space as COMMAND_TAP; some also pass the raw touches.
        GestureDetector gestures;
        long lastTap, lastOpen;

        @Override public void onCreate(SurfaceHolder holder) {
            super.onCreate(holder);
            setTouchEventsEnabled(true);
            gestures = new GestureDetector(DrownedWallpaper.this, new GestureDetector.SimpleOnGestureListener() {
                @Override public boolean onDoubleTap(MotionEvent e) { openGame(); return true; }
            });
        }

        @Override public void onTouchEvent(MotionEvent e) { if (gestures != null) gestures.onTouchEvent(e); }

        @Override public Bundle onCommand(String action, int x, int y, int z, Bundle extras, boolean resultRequested) {
            if (WallpaperManager.COMMAND_TAP.equals(action)) {
                long now = SystemClock.uptimeMillis();
                if (now - lastTap < 450) { lastTap = 0; openGame(); } else lastTap = now;
            }
            return null;
        }

        void openGame() {
            long now = SystemClock.uptimeMillis();
            if (isPreview() || now - lastOpen < 1500) return;
            lastOpen = now;
            Intent i = new Intent(DrownedWallpaper.this, GameActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            try { startActivity(i); } catch (Exception ignored) { /* the system refused: the icon still works */ }
        }

        @Override public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height);
            if (display != null && web != null) { // same surface, new size: resize the display, keep the fight going
                display.resize(width, height, getResources().getDisplayMetrics().densityDpi);
                display.setSurface(holder.getSurface());
                return;
            }
            DisplayManager dm = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
            display = dm.createVirtualDisplay("drowned-light-wallpaper", width, height,
                    getResources().getDisplayMetrics().densityDpi, holder.getSurface(), 0);
            presentation = new Presentation(DrownedWallpaper.this, display.getDisplay());
            web = makeWebView(presentation.getContext(), "wallpaper.html");
            presentation.setContentView(web);
            presentation.show();
        }

        @Override public void onVisibilityChanged(boolean visible) {
            if (web == null) return;
            // onPause/onResume act on this WebView only (pauseTimers would also freeze the game window, same process)
            if (visible) web.onResume(); else web.onPause();
        }

        @Override public void onSurfaceDestroyed(SurfaceHolder holder) {
            release();
            super.onSurfaceDestroyed(holder);
        }

        @Override public void onDestroy() { release(); super.onDestroy(); }

        void release() {
            if (presentation != null) { presentation.dismiss(); presentation = null; }
            if (web != null) { web.destroy(); web = null; }
            if (display != null) { display.release(); display = null; }
        }
    }
}
