package com.pipboy3000.launcher.telephony.call

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.VideoProfile

/**
 * Central, thread-safe state holder for the launcher's default-phone feature.
 *
 * The orchestrator sets [emitter] (which runs a JS snippet on the WebView, on the
 * UI thread). [PipInCallService] feeds the active [Call] and audio state here.
 *
 * Every method is fully defensive and must never crash the InCallService.
 */
object CallStore {

    /**
     * Orchestrator-supplied sink that runs a JS snippet on the WebView (UI thread).
     * Used to notify the web layer about call state changes.
     */
    @Volatile
    var emitter: ((String) -> Unit)? = null

    @Volatile
    private var service: PipInCallService? = null

    @Volatile
    private var call: Call? = null

    @Volatile
    private var muted: Boolean = false

    @Volatile
    private var speaker: Boolean = false

    /** ms when the call became ACTIVE; 0 if not yet active. */
    @Volatile
    private var startTime: Long = 0L

    /** Callback installed on the active [Call]; pushes updates to the web layer. */
    private val callback = object : Call.Callback() {
        override fun onStateChanged(c: Call, state: Int) {
            try {
                if (state == Call.STATE_ACTIVE && startTime == 0L) {
                    startTime = System.currentTimeMillis()
                }
            } catch (e: Throwable) {
                // swallow
            }
            emit()
        }

        override fun onDetailsChanged(c: Call, details: Call.Details) {
            emit()
        }
    }

    /** Run the standard call-updated event on the WebView via [emitter]. Never throws. */
    fun emit() {
        try {
            emitter?.invoke("window.dispatchEvent(new CustomEvent('pipboy:call'));")
        } catch (e: Throwable) {
            // swallow
        }
    }

    // ---- Internal hooks used by the service ----

    fun attachService(s: PipInCallService) {
        service = s
    }

    fun detachService(s: PipInCallService) {
        if (service === s) service = null
    }

    /**
     * Set (or clear) the active call. Registers/unregisters the [callback] and
     * resets locally-tracked state when the call is cleared.
     */
    fun setCall(call: Call?) {
        try {
            val previous = this.call
            if (previous != null && previous !== call) {
                try {
                    previous.unregisterCallback(callback)
                } catch (e: Throwable) {
                    // swallow
                }
            }
            this.call = call
            if (call != null) {
                try {
                    call.registerCallback(callback)
                } catch (e: Throwable) {
                    // swallow
                }
                try {
                    if (call.state == Call.STATE_ACTIVE && startTime == 0L) {
                        startTime = System.currentTimeMillis()
                    }
                } catch (e: Throwable) {
                    // swallow
                }
            } else {
                startTime = 0L
                muted = false
                speaker = false
            }
        } catch (e: Throwable) {
            // swallow
        }
    }

    /** Update locally-tracked mute/route from a system [CallAudioState]. */
    fun updateAudioState(state: CallAudioState?) {
        try {
            if (state == null) return
            muted = state.isMuted
            speaker = (state.route and CallAudioState.ROUTE_SPEAKER) != 0
        } catch (e: Throwable) {
            // swallow
        }
    }

    // ---- Snapshot ----

    /**
     * JSON snapshot of the current call for the web UI. Defensive; never throws.
     * Shape:
     * {"state","number","name","incoming","muted","speaker","startTime"}
     * or {"state":"IDLE"} when there is no call.
     */
    fun snapshotJson(): String {
        return try {
            val c = call ?: return "{\"state\":\"IDLE\"}"

            val state = stateName(c.state)
            val incoming = isIncoming(c)
            val number = numberOf(c)
            val name = nameOf(number)

            val sb = StringBuilder()
            sb.append("{")
            sb.append("\"state\":\"").append(state).append("\",")
            sb.append("\"number\":\"").append(escape(number)).append("\",")
            sb.append("\"name\":\"").append(escape(name)).append("\",")
            sb.append("\"incoming\":").append(if (incoming) "true" else "false").append(",")
            sb.append("\"muted\":").append(if (muted) "true" else "false").append(",")
            sb.append("\"speaker\":").append(if (speaker) "true" else "false").append(",")
            sb.append("\"startTime\":").append(startTime)
            sb.append("}")
            sb.toString()
        } catch (e: Throwable) {
            "{\"state\":\"IDLE\"}"
        }
    }

    /**
     * Whether the call is incoming. callDirection is API29+; on older platforms
     * we treat a RINGING state as the incoming indicator.
     */
    private fun isIncoming(c: Call): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                c.details?.callDirection == Call.Details.DIRECTION_INCOMING
            } else {
                c.state == Call.STATE_RINGING
            }
        } catch (e: Throwable) {
            false
        }
    }

    private fun stateName(state: Int): String {
        return when (state) {
            Call.STATE_DIALING -> "DIALING"
            Call.STATE_RINGING -> "RINGING"
            Call.STATE_ACTIVE -> "ACTIVE"
            Call.STATE_HOLDING -> "HOLDING"
            Call.STATE_CONNECTING -> "CONNECTING"
            Call.STATE_DISCONNECTED -> "DISCONNECTED"
            Call.STATE_DISCONNECTING -> "DISCONNECTED"
            else -> "IDLE"
        }
    }

    /** Extract the dialed/remote number from a call's handle. */
    private fun numberOf(c: Call): String {
        return try {
            val handle: Uri? = c.details?.handle
            val raw = handle?.schemeSpecificPart ?: ""
            if (raw.isNotEmpty()) raw else (handle?.toString() ?: "")
        } catch (e: Throwable) {
            ""
        }
    }

    /** Resolve a contact display name via PhoneLookup if READ_CONTACTS is granted. */
    private fun nameOf(number: String): String {
        if (number.isEmpty()) return ""
        val ctx: Context = service ?: return ""
        return try {
            if (ctx.checkSelfPermission(Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                return ""
            }
            val lookupUri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(number)
            )
            ctx.contentResolver.query(
                lookupUri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null, null, null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(ContactsContract.PhoneLookup.DISPLAY_NAME)
                    if (idx >= 0) return cursor.getString(idx) ?: ""
                }
            }
            ""
        } catch (e: Throwable) {
            ""
        }
    }

    private fun escape(s: String): String {
        val sb = StringBuilder(s.length + 8)
        for (ch in s) {
            when (ch) {
                '\\' -> sb.append("\\\\")
                '"' -> sb.append("\\\"")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (ch < ' ') sb.append("\\u").append(String.format("%04x", ch.code)) else sb.append(ch)
            }
        }
        return sb.toString()
    }

    // ---- Control methods (all defensive, return success) ----

    fun answer(): Boolean {
        return try {
            call?.answer(VideoProfile.STATE_AUDIO_ONLY)
            true
        } catch (e: Throwable) {
            false
        }
    }

    fun hangup(): Boolean {
        return try {
            call?.disconnect()
            true
        } catch (e: Throwable) {
            false
        }
    }

    fun reject(): Boolean {
        return try {
            call?.reject(false, null)
            true
        } catch (e: Throwable) {
            false
        }
    }

    fun setMuted(on: Boolean): Boolean {
        return try {
            service?.setMuted(on) ?: return false
            muted = on
            emit()
            true
        } catch (e: Throwable) {
            false
        }
    }

    fun setSpeaker(on: Boolean): Boolean {
        return try {
            val route = if (on) CallAudioState.ROUTE_SPEAKER else CallAudioState.ROUTE_EARPIECE
            service?.setAudioRoute(route) ?: return false
            speaker = on
            emit()
            true
        } catch (e: Throwable) {
            false
        }
    }

    fun setHold(on: Boolean): Boolean {
        return try {
            val c = call ?: return false
            if (on) c.hold() else c.unhold()
            true
        } catch (e: Throwable) {
            false
        }
    }

    fun sendDtmf(digit: String): Boolean {
        return try {
            val c = call ?: return false
            if (digit.isEmpty()) return false
            val ch = digit[0]
            c.playDtmfTone(ch)
            c.stopDtmfTone()
            true
        } catch (e: Throwable) {
            false
        }
    }
}
