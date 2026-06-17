package com.pipboy3000.launcher.bridge

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.os.StatFs
import android.provider.CallLog
import android.provider.ContactsContract
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Native bridge exposed to the Pip-Boy web UI as `window.AndroidBridge`.
 *
 * Registered by the host as:
 *   webView.addJavascriptInterface(bridge, "AndroidBridge")
 *
 * Every public method here is annotated @JavascriptInterface and is fully
 * defensive: it catches SecurityException (missing runtime permission) and any
 * other Exception and returns a safe empty value ("[]" / "{}" / false / Unit).
 * Nothing ever throws across the JS bridge.
 */
class LauncherBridge(
    private val activity: android.app.Activity,
    private val requestPermissions: () -> Unit,
) {

    // ---------------------------------------------------------------------
    // Apps
    // ---------------------------------------------------------------------

    /**
     * JSON array of launchable apps, alphabetical by label (case-insensitive).
     * Each entry: {"label", "packageName", "versionName"}. Our own package is
     * excluded.
     */
    @JavascriptInterface
    fun getApps(): String {
        return try {
            val pm = activity.packageManager
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            @Suppress("DEPRECATION")
            val resolveInfos = pm.queryIntentActivities(intent, 0)

            data class AppEntry(val label: String, val packageName: String, val versionName: String)

            val seen = HashSet<String>()
            val apps = ArrayList<AppEntry>()
            for (ri in resolveInfos) {
                val pkg = ri.activityInfo?.packageName ?: continue
                if (pkg == activity.packageName) continue   // exclude ourselves
                if (!seen.add(pkg)) continue                // de-dupe by package
                val label = ri.loadLabel(pm)?.toString() ?: pkg
                val versionName = try {
                    @Suppress("DEPRECATION")
                    pm.getPackageInfo(pkg, 0).versionName ?: ""
                } catch (e: Exception) {
                    ""
                }
                apps.add(AppEntry(label, pkg, versionName))
            }

            apps.sortWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.label })

            val arr = JSONArray()
            for (a in apps) {
                arr.put(
                    JSONObject()
                        .put("label", a.label)
                        .put("packageName", a.packageName)
                        .put("versionName", a.versionName)
                )
            }
            arr.toString()
        } catch (e: Exception) {
            "[]"
        }
    }

    /** Launch an app by package name. Returns true on success. */
    @JavascriptInterface
    fun launchApp(packageName: String): Boolean {
        return try {
            val intent = activity.packageManager.getLaunchIntentForPackage(packageName)
                ?: return false
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Open the system "App info" page for the given package. */
    @JavascriptInterface
    fun openAppInfo(packageName: String): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:$packageName"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    // ---------------------------------------------------------------------
    // Call log
    // ---------------------------------------------------------------------

    /**
     * JSON array of recent calls, newest first, up to [limit] (clamped 1..500).
     * Requires READ_CALL_LOG; returns "[]" if denied or on error.
     */
    @JavascriptInterface
    fun getCallLog(limit: Int): String {
        if (!hasPermission(android.Manifest.permission.READ_CALL_LOG)) return "[]"
        val clamped = limit.coerceIn(1, 500)
        return try {
            val arr = JSONArray()
            val projection = arrayOf(
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.NUMBER,
                CallLog.Calls.TYPE,
                CallLog.Calls.DATE,
                CallLog.Calls.DURATION,
            )
            activity.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                null,
                null,
                CallLog.Calls.DATE + " DESC",
            )?.use { c ->
                val nameIdx = c.getColumnIndex(CallLog.Calls.CACHED_NAME)
                val numberIdx = c.getColumnIndex(CallLog.Calls.NUMBER)
                val typeIdx = c.getColumnIndex(CallLog.Calls.TYPE)
                val dateIdx = c.getColumnIndex(CallLog.Calls.DATE)
                val durationIdx = c.getColumnIndex(CallLog.Calls.DURATION)
                var count = 0
                while (c.moveToNext() && count < clamped) {
                    val name = if (nameIdx >= 0) c.getString(nameIdx) ?: "" else ""
                    val number = if (numberIdx >= 0) c.getString(numberIdx) ?: "" else ""
                    val type = if (typeIdx >= 0) c.getInt(typeIdx) else -1
                    val date = if (dateIdx >= 0) c.getLong(dateIdx) else 0L
                    val duration = if (durationIdx >= 0) c.getLong(durationIdx) else 0L
                    arr.put(
                        JSONObject()
                            .put("name", name)
                            .put("number", number)
                            .put("type", callTypeName(type))
                            .put("date", date)
                            .put("duration", duration)
                    )
                    count++
                }
            }
            arr.toString()
        } catch (e: SecurityException) {
            "[]"
        } catch (e: Exception) {
            "[]"
        }
    }

    private fun callTypeName(type: Int): String = when (type) {
        CallLog.Calls.INCOMING_TYPE -> "INCOMING"
        CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
        CallLog.Calls.MISSED_TYPE -> "MISSED"
        CallLog.Calls.REJECTED_TYPE -> "REJECTED"
        CallLog.Calls.BLOCKED_TYPE -> "BLOCKED"
        CallLog.Calls.VOICEMAIL_TYPE -> "VOICEMAIL"
        else -> "UNKNOWN"
    }

    // ---------------------------------------------------------------------
    // Contacts
    // ---------------------------------------------------------------------

    /**
     * JSON array of {"name","number"}, distinct by name+number, sorted by
     * display name. Requires READ_CONTACTS; returns "[]" if denied.
     */
    @JavascriptInterface
    fun getContacts(): String {
        if (!hasPermission(android.Manifest.permission.READ_CONTACTS)) return "[]"
        return try {
            data class Contact(val name: String, val number: String)

            val projection = arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
            )
            val seen = HashSet<String>()
            val contacts = ArrayList<Contact>()
            activity.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC",
            )?.use { c ->
                val nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val numberIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                while (c.moveToNext()) {
                    val name = if (nameIdx >= 0) c.getString(nameIdx) ?: "" else ""
                    val number = if (numberIdx >= 0) c.getString(numberIdx) ?: "" else ""
                    if (number.isEmpty()) continue
                    val key = "$name|$number"
                    if (!seen.add(key)) continue   // distinct by name+number
                    contacts.add(Contact(name, number))
                }
            }

            contacts.sortWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })

            val arr = JSONArray()
            for (ct in contacts) {
                arr.put(JSONObject().put("name", ct.name).put("number", ct.number))
            }
            arr.toString()
        } catch (e: SecurityException) {
            "[]"
        } catch (e: Exception) {
            "[]"
        }
    }

    // ---------------------------------------------------------------------
    // Dialer / calls
    // ---------------------------------------------------------------------

    /** Open the dialer pre-filled with the number. Never requires permission. */
    @JavascriptInterface
    fun dial(number: String) {
        try {
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number)))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
        } catch (e: Exception) {
            // swallow
        }
    }

    /** Place a call if CALL_PHONE is granted, otherwise fall back to dial(). */
    @JavascriptInterface
    fun call(number: String) {
        try {
            if (hasPermission(android.Manifest.permission.CALL_PHONE)) {
                val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(number)))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(intent)
            } else {
                dial(number)
            }
        } catch (e: SecurityException) {
            dial(number)
        } catch (e: Exception) {
            // swallow
        }
    }

    // ---------------------------------------------------------------------
    // Device stats
    // ---------------------------------------------------------------------

    /** JSON object of battery / storage / RAM / build / time readouts. */
    @JavascriptInterface
    fun getDeviceStats(): String {
        return try {
            val obj = JSONObject()

            // --- Battery ---
            var batteryPct = 0
            var charging = false
            try {
                val batteryStatus = activity.registerReceiver(
                    null,
                    IntentFilter(Intent.ACTION_BATTERY_CHANGED)
                )
                if (batteryStatus != null) {
                    val level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                    val scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                    if (level >= 0 && scale > 0) {
                        batteryPct = level * 100 / scale
                    }
                    val status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                    charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                        status == BatteryManager.BATTERY_STATUS_FULL
                }
            } catch (e: Exception) { /* leave defaults */ }
            obj.put("batteryPct", batteryPct)
            obj.put("charging", charging)

            // --- Storage (data partition) ---
            var storageTotal = 0L
            var storageUsed = 0L
            try {
                val stat = StatFs(Environment.getDataDirectory().path)
                val blockSize = stat.blockSizeLong
                val total = stat.blockCountLong * blockSize
                val available = stat.availableBlocksLong * blockSize
                storageTotal = total
                storageUsed = total - available
            } catch (e: Exception) { /* leave defaults */ }
            obj.put("storageUsedBytes", storageUsed)
            obj.put("storageTotalBytes", storageTotal)

            // --- RAM ---
            var ramTotal = 0L
            var ramUsed = 0L
            try {
                val am = activity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                val mi = ActivityManager.MemoryInfo()
                am.getMemoryInfo(mi)
                ramTotal = mi.totalMem
                ramUsed = mi.totalMem - mi.availMem
            } catch (e: Exception) { /* leave defaults */ }
            obj.put("ramUsedBytes", ramUsed)
            obj.put("ramTotalBytes", ramTotal)

            // --- Build / OS ---
            obj.put("model", Build.MODEL ?: "")
            obj.put("manufacturer", Build.MANUFACTURER ?: "")
            obj.put("androidVersion", Build.VERSION.RELEASE ?: "")
            obj.put("sdkInt", Build.VERSION.SDK_INT)
            obj.put("uptimeMillis", SystemClock.elapsedRealtime())

            // --- Time / date (locale-independent) ---
            val now = Date()
            val timeFmt = SimpleDateFormat("HH:mm", Locale.US)
            val dateFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            obj.put("time", timeFmt.format(now))
            obj.put("date", dateFmt.format(now))
            obj.put("timestamp", now.time)

            obj.toString()
        } catch (e: Exception) {
            "{}"
        }
    }

    // ---------------------------------------------------------------------
    // Permissions
    // ---------------------------------------------------------------------

    /** JSON {"callLog","contacts","phone"} of currently granted permissions. */
    @JavascriptInterface
    fun getPermissions(): String {
        return try {
            JSONObject()
                .put("callLog", hasPermission(android.Manifest.permission.READ_CALL_LOG))
                .put("contacts", hasPermission(android.Manifest.permission.READ_CONTACTS))
                .put("phone", hasPermission(android.Manifest.permission.CALL_PHONE))
                .toString()
        } catch (e: Exception) {
            "{}"
        }
    }

    /** Ask the host to launch the runtime permission flow (on the UI thread). */
    @JavascriptInterface
    fun requestPermissions() {
        try {
            activity.runOnUiThread { requestPermissions.invoke() }
        } catch (e: Exception) {
            // swallow
        }
    }

    // ---------------------------------------------------------------------
    // Settings shortcuts
    // ---------------------------------------------------------------------

    /** Open a system Settings screen by keyword. Returns true if it started. */
    @JavascriptInterface
    fun openSettings(which: String): Boolean {
        return try {
            val action = when (which.lowercase(Locale.US)) {
                "wifi" -> Settings.ACTION_WIFI_SETTINGS
                "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
                "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
                "display" -> Settings.ACTION_DISPLAY_SETTINGS
                "sound" -> Settings.ACTION_SOUND_SETTINGS
                "date" -> Settings.ACTION_DATE_SETTINGS
                "battery" -> Settings.ACTION_BATTERY_SAVER_SETTINGS
                "storage" -> Settings.ACTION_INTERNAL_STORAGE_SETTINGS
                "apps" -> Settings.ACTION_APPLICATION_SETTINGS
                "settings" -> Settings.ACTION_SETTINGS
                else -> Settings.ACTION_SETTINGS
            }
            if (startSettings(action)) return true
            // Fallbacks for screens that may be unavailable on some devices.
            when (which.lowercase(Locale.US)) {
                "battery", "storage" -> startSettings(Settings.ACTION_SETTINGS)
                else -> false
            }
        } catch (e: Exception) {
            false
        }
    }

    /** Try to start a Settings activity by action; true on success. */
    private fun startSettings(action: String): Boolean {
        return try {
            val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    // ---------------------------------------------------------------------
    // Flashlight
    // ---------------------------------------------------------------------

    /** Toggle the torch on the first flash-capable camera. */
    @JavascriptInterface
    fun setFlashlight(on: Boolean): Boolean {
        return try {
            val cm = activity.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            for (id in cm.cameraIdList) {
                val chars = cm.getCameraCharacteristics(id)
                val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                if (hasFlash) {
                    cm.setTorchMode(id, on)
                    return true
                }
            }
            false
        } catch (e: Exception) {
            false
        }
    }

    // ---------------------------------------------------------------------
    // Vibrate
    // ---------------------------------------------------------------------

    /** Vibrate for [ms] milliseconds. Guards against missing hardware. */
    @JavascriptInterface
    fun vibrate(ms: Int) {
        try {
            val duration = ms.toLong().coerceAtLeast(1L)
            val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (vibrator == null || !vibrator.hasVibrator()) return
            val effect = VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE)
            vibrator.vibrate(effect)
        } catch (e: Exception) {
            // swallow
        }
    }

    // ---------------------------------------------------------------------
    // Toast
    // ---------------------------------------------------------------------

    /** Show a short toast on the UI thread. */
    @JavascriptInterface
    fun toast(msg: String) {
        try {
            activity.runOnUiThread {
                Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            // swallow
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /** True if [permission] is currently granted to this app. */
    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(activity, permission) ==
            PackageManager.PERMISSION_GRANTED
    }
}
