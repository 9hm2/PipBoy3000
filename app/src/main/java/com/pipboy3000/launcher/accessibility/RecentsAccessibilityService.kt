package com.pipboy3000.launcher.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import com.pipboy3000.launcher.MainActivity

/**
 * Experimental Recents redirect. With "filter key events" granted, this catches
 * the hardware/soft Recents key (KEYCODE_APP_SWITCH) and, instead of letting the
 * system overview open, brings our launcher forward showing the in-app RECENT
 * apps view — so the user stays in the Pip-Boy theme.
 *
 * Limitation: only key-based Recents (e.g. 3-button navigation) delivers a key
 * event here; pure gesture navigation does not, so it can't be intercepted.
 */
class RecentsAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* not used */ }

    override fun onInterrupt() { /* no-op */ }

    override fun onKeyEvent(event: KeyEvent?): Boolean {
        try {
            if (event != null && event.keyCode == KeyEvent.KEYCODE_APP_SWITCH) {
                // Act on key-up; consume both down and up so the system overview
                // never opens.
                if (event.action == KeyEvent.ACTION_UP) {
                    val intent = Intent(this, MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        .putExtra("pipboy.open", "recents")
                    startActivity(intent)
                }
                return true
            }
        } catch (e: Throwable) {
            // never let the service crash the system
        }
        return super.onKeyEvent(event)
    }
}
