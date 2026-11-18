package com.grimdrowned.drownedwallpaper;

import android.app.Presentation;
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

        @Override public void onCreate(SurfaceHolder holder) {
            super.onCreate(holder);
            setTouchEventsEnabled(false);
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
            if (visible) { web.onResume(); web.resumeTimers(); } else { web.onPause(); web.pauseTimers(); }
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
