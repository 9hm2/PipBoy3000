package com.pipboy3000.launcher.telephony.call

import android.content.Intent
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService
import com.pipboy3000.launcher.MainActivity

/**
 * Default-phone-app InCallService. Bridges the system telecom stack to [CallStore],
 * which in turn pushes call state to the web in-call screen.
 *
 * The orchestrator declares this in the manifest with BIND_INCALL_SERVICE,
 * IN_CALL_SERVICE_UI=true, IN_CALL_SERVICE_RINGING=true and the
 * android.telecom.InCallService intent-filter.
 *
 * Every override is fully defensive and must never crash.
 */
class PipInCallService : InCallService() {

    override fun onCallAdded(call: Call) {
        try {
            CallStore.attachService(this)
            CallStore.setCall(call)
            CallStore.emit()
            bringLauncherToFront()
        } catch (e: Throwable) {
            // swallow
        }
    }

    override fun onCallRemoved(call: Call) {
        try {
            // Promote the next live call if one exists, otherwise clear.
            val next = calls.firstOrNull { it !== call && !isFinished(it) }
            CallStore.setCall(next)
            CallStore.emit()
        } catch (e: Throwable) {
            // swallow
        }
    }

    override fun onCallAudioStateChanged(audioState: CallAudioState?) {
        try {
            CallStore.updateAudioState(audioState)
            CallStore.emit()
        } catch (e: Throwable) {
            // swallow
        }
    }

    override fun onDestroy() {
        try {
            CallStore.detachService(this)
        } catch (e: Throwable) {
            // swallow
        }
        super.onDestroy()
    }

    private fun isFinished(c: Call): Boolean {
        return try {
            val s = c.state
            s == Call.STATE_DISCONNECTED || s == Call.STATE_DISCONNECTING
        } catch (e: Throwable) {
            true
        }
    }

    /** Bring the launcher (and thus the web in-call screen) to the foreground. */
    private fun bringLauncherToFront() {
        try {
            val intent = Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        } catch (e: Throwable) {
            // swallow
        }
    }
}
