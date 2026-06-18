package com.pipboy3000.launcher

import android.Manifest
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import com.pipboy3000.launcher.bridge.LauncherBridge
import com.pipboy3000.launcher.bridge.NotificationStore

/**
 * Host shell for the Pip-Boy 3000 launcher.
 *
 * Responsibilities:
 *  - Hosts a full-screen WebView that renders the bundled Pip-Boy web UI.
 *  - Serves the bundled web assets over a safe https origin via WebViewAssetLoader.
 *  - Constructs + registers the native bridge (Agent B) as "AndroidBridge".
 *  - Handles runtime permissions, edge-to-edge layout, and launcher lifecycle.
 *
 * The web UI is the single source of truth for presentation; this class only
 * wires plumbing and pokes the web app with a "pipboy:refresh" DOM event whenever
 * native-visible state may have changed (page load, resume, HOME re-press, perms).
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    /** Pip-Boy background green-black; matches the web UI so there's no white flash. */
    private val pipBoyBg = 0xFF0B1410.toInt()

    /** Origin our asset loader serves from. Anything else stays out / is treated as external. */
    private val appOrigin = "https://appassets.androidplatform.net"
    private val indexUrl = "$appOrigin/assets/index.html"

    /**
     * Core permissions the DATA/STAT tabs rely on. We never auto-spam these on launch;
     * the web UI triggers the request through AndroidBridge.requestPermissions().
     */
    private val corePermissions = arrayOf(
        Manifest.permission.READ_CALL_LOG,
        Manifest.permission.READ_CONTACTS,
        Manifest.permission.READ_SMS,
        Manifest.permission.CALL_PHONE,
        Manifest.permission.READ_PHONE_STATE,
    )

    /**
     * Registered at field-init time (required by the Activity Result API contract —
     * must be created before the activity is STARTED). On any result we just nudge the
     * web app to re-query getPermissions()/data; we don't care which were granted here.
     */
    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            dispatchRefresh()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // --- Edge-to-edge full-screen launcher. Draw under the system bars; the web
        // UI subtracts the navigation-bar inset via CSS env(safe-area-inset-*).
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        webView = createWebView()
        setContentView(webView)

        // Hide the top notification/status bar for a clean terminal surface; keep the
        // navigation bar (the layout accounts for it). A swipe reveals bars transiently.
        applyImmersive()

        // Construct + register the bridge BEFORE loadUrl so the JS interface exists
        // by the time the page's scripts run. The lambda is the web-triggered
        // permission entry point.
        webView.addJavascriptInterface(
            LauncherBridge(
                this,
                { requestCorePermissions() },
                { js -> runOnUiThread { if (::webView.isInitialized) webView.evaluateJavascript(js, null) } },
            ),
            "AndroidBridge",
        )

        webView.loadUrl(indexUrl)

        // Launcher back behaviour: never drop the user to a black screen. Walk the
        // WebView history if possible; otherwise consume the press (stay on launcher).
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                }
                // else: no-op. As HOME, there's nowhere to "back out" to.
            }
        })
    }

    private fun createWebView(): WebView {
        // Serve bundled assets over https://appassets.androidplatform.net/assets/.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // WebView subclass that advertises the Pip-Boy palette to a co-operating
        // keyboard (pcKeyboard) via EditorInfo.extras, so the IME recolours to
        // match the launcher whenever it opens over one of our input fields.
        val web = object : WebView(this) {
            override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
                val ic = super.onCreateInputConnection(outAttrs)
                try {
                    val extras = outAttrs.extras ?: android.os.Bundle().also { outAttrs.extras = it }
                    // ARGB ints; pcKeyboard derives a full theme from bg + fg.
                    extras.putInt("com.pckeyboard.ime.theme.BACKGROUND", 0xFF0B1410.toInt())
                    extras.putInt("com.pckeyboard.ime.theme.FOREGROUND", 0xFF33FF66.toInt())
                } catch (e: Exception) {
                    // best-effort — keyboard theming is optional
                }
                return ic
            }
        }
        return web.apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(pipBoyBg)

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                // Assets come exclusively through the asset loader; deny raw file/content access.
                allowFileAccess = false
                allowContentAccess = false
                cacheMode = WebSettings.LOAD_DEFAULT
                mediaPlaybackRequiresUserGesture = false
                // Keep the terminal layout exact regardless of system font scaling.
                textZoom = 100
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
            }

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? {
                    // Delegate every request to the asset loader; it returns null for
                    // anything outside /assets/, letting the WebView handle it normally.
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    // Keep navigation pinned to our own origin. Block anything else
                    // (the UI should route external intents through the bridge, not links).
                    return request.url.toString().startsWith(appOrigin).not()
                }

                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    dispatchRefresh()
                }
            }
        }.also {
            // WebView contents debugging only in debuggable builds.
            if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                WebView.setWebContentsDebuggingEnabled(true)
            }
        }
    }

    /** Hide the status bar (notification bar); keep the nav bar. Bars show on swipe. */
    private fun applyImmersive() {
        try {
            val controller = WindowInsetsControllerCompat(window, webView)
            controller.hide(WindowInsetsCompat.Type.statusBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } catch (e: Exception) {
            // swallow — immersive is best-effort
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // The system can restore the status bar after dialogs/permission prompts; re-hide.
        if (hasFocus) applyImmersive()
    }

    /** Passed to LauncherBridge; the web UI calls this via AndroidBridge.requestPermissions(). */
    private fun requestCorePermissions() {
        permissionLauncher.launch(corePermissions)
    }

    /**
     * Tell the web app that native-visible state may have changed so it re-queries
     * permissions/data/battery/clock. Safe to call before the page is fully ready —
     * the listener simply may not exist yet (onPageFinished covers the initial load).
     */
    private fun dispatchRefresh() {
        if (::webView.isInitialized) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new Event('pipboy:refresh'));",
                null,
            )
        }
    }

    override fun onResume() {
        super.onResume()
        // Battery / clock / app list may have changed while we were away.
        dispatchRefresh()
        // Only show in-launcher notification popups while we are foreground.
        NotificationStore.setPostedListener { json ->
            runOnUiThread { dispatchNotify(json) }
        }
    }

    override fun onPause() {
        super.onPause()
        // Stop receiving popup pushes when we're not the foreground app.
        NotificationStore.setPostedListener(null)
    }

    /** Push a freshly posted notification (JSON object) to the web UI as a popup. */
    private fun dispatchNotify(json: String) {
        if (::webView.isInitialized) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('pipboy:notify',{detail:$json}));",
                null,
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTask: pressing HOME while already here re-delivers the intent.
        // At minimum refresh; the web UI may reset to its main tab on this event.
        setIntent(intent)
        dispatchRefresh()
    }

    override fun onDestroy() {
        // Detach from the view tree before destroying to avoid leaks / crashes.
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.removeAllViews()
        webView.destroy()
        super.onDestroy()
    }
}
