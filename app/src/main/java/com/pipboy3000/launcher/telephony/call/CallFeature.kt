package com.pipboy3000.launcher.telephony.call

import android.Manifest
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.TelecomManager

/**
 * Central, thread-safe entry point for the launcher's default-dialer feature:
 * checking/requesting the default-dialer role and placing outgoing calls.
 *
 * Every method is fully defensive and must never crash a caller.
 */
object CallFeature {

    /** True if this app is currently the system default dialer. */
    fun isDefaultDialer(ctx: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = ctx.getSystemService(RoleManager::class.java)
                roleManager?.isRoleHeld(RoleManager.ROLE_DIALER) == true
            } else {
                val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
                @Suppress("DEPRECATION")
                tm?.defaultDialerPackage == ctx.packageName
            }
        } catch (e: Throwable) {
            false
        }
    }

    /**
     * Build the intent that asks the user to make this app the default dialer.
     * Returns null when no mechanism is available. The Activity launches it.
     */
    fun requestDefaultDialerIntent(ctx: Context): Intent? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = ctx.getSystemService(RoleManager::class.java)
                roleManager?.createRequestRoleIntent(RoleManager.ROLE_DIALER)
            } else {
                @Suppress("DEPRECATION")
                Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
                    .putExtra(
                        TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME,
                        ctx.packageName
                    )
            }
        } catch (e: Throwable) {
            null
        }
    }

    /**
     * Place an outgoing call to [number]. Prefers the telecom API when we are the
     * default dialer and hold CALL_PHONE; otherwise falls back to ACTION_CALL
     * (if CALL_PHONE granted) or ACTION_DIAL. Returns true when started/placed.
     */
    fun placeCall(ctx: Context, number: String): Boolean {
        return try {
            if (number.isEmpty()) return false
            val uri = Uri.fromParts("tel", number, null)
            val callPhoneGranted = ctx.checkSelfPermission(Manifest.permission.CALL_PHONE) ==
                PackageManager.PERMISSION_GRANTED

            if (isDefaultDialer(ctx) && callPhoneGranted) {
                val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
                if (tm != null) {
                    tm.placeCall(uri, Bundle())
                    return true
                }
            }

            val action = if (callPhoneGranted) Intent.ACTION_CALL else Intent.ACTION_DIAL
            val intent = Intent(action, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            true
        } catch (e: Throwable) {
            false
        }
    }
}
