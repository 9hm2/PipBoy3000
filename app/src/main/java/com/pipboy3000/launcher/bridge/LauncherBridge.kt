package com.pipboy3000.launcher.bridge

import android.app.ActivityManager
import android.app.AppOpsManager
import android.app.role.RoleManager
import android.app.usage.UsageStatsManager
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.Process
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.os.StatFs
import android.app.SearchManager
import android.provider.AlarmClock
import android.provider.CallLog
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.telephony.TelephonyManager
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
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

    /** Map BatteryManager.BATTERY_HEALTH_* to a stable string. */
    private fun batteryHealthName(health: Int): String = when (health) {
        BatteryManager.BATTERY_HEALTH_GOOD -> "GOOD"
        BatteryManager.BATTERY_HEALTH_OVERHEAT -> "OVERHEAT"
        BatteryManager.BATTERY_HEALTH_DEAD -> "DEAD"
        BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "OVER_VOLTAGE"
        BatteryManager.BATTERY_HEALTH_COLD -> "COLD"
        else -> "UNKNOWN"
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
    // SMS
    // ---------------------------------------------------------------------

    /**
     * JSON array of recent SMS, newest first, up to [limit] (clamped 1..500).
     * Each: {"address","name","body","date":Long,"type":"INBOX"|"SENT"|...,"read":Bool}.
     * The contact name is resolved (cached) when READ_CONTACTS is also granted.
     * Requires READ_SMS; returns "[]" if denied or on error.
     */
    @JavascriptInterface
    fun getSms(limit: Int): String {
        if (!hasPermission(android.Manifest.permission.READ_SMS)) return "[]"
        val clamped = limit.coerceIn(1, 500)
        return try {
            val arr = JSONArray()
            val nameCache = HashMap<String, String>()
            val projection = arrayOf(
                android.provider.Telephony.Sms.ADDRESS,
                android.provider.Telephony.Sms.BODY,
                android.provider.Telephony.Sms.DATE,
                android.provider.Telephony.Sms.TYPE,
                android.provider.Telephony.Sms.READ,
            )
            activity.contentResolver.query(
                android.provider.Telephony.Sms.CONTENT_URI,
                projection,
                null,
                null,
                android.provider.Telephony.Sms.DATE + " DESC",
            )?.use { c ->
                val addrIdx = c.getColumnIndex(android.provider.Telephony.Sms.ADDRESS)
                val bodyIdx = c.getColumnIndex(android.provider.Telephony.Sms.BODY)
                val dateIdx = c.getColumnIndex(android.provider.Telephony.Sms.DATE)
                val typeIdx = c.getColumnIndex(android.provider.Telephony.Sms.TYPE)
                val readIdx = c.getColumnIndex(android.provider.Telephony.Sms.READ)
                var count = 0
                while (c.moveToNext() && count < clamped) {
                    val address = if (addrIdx >= 0) c.getString(addrIdx) ?: "" else ""
                    val body = if (bodyIdx >= 0) c.getString(bodyIdx) ?: "" else ""
                    val date = if (dateIdx >= 0) c.getLong(dateIdx) else 0L
                    val type = if (typeIdx >= 0) c.getInt(typeIdx) else -1
                    val read = if (readIdx >= 0) c.getInt(readIdx) != 0 else true
                    arr.put(
                        JSONObject()
                            .put("address", address)
                            .put("name", lookupContactName(address, nameCache))
                            .put("body", body)
                            .put("date", date)
                            .put("type", smsTypeName(type))
                            .put("read", read)
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

    private fun smsTypeName(type: Int): String = when (type) {
        android.provider.Telephony.Sms.MESSAGE_TYPE_INBOX -> "INBOX"
        android.provider.Telephony.Sms.MESSAGE_TYPE_SENT -> "SENT"
        android.provider.Telephony.Sms.MESSAGE_TYPE_DRAFT -> "DRAFT"
        android.provider.Telephony.Sms.MESSAGE_TYPE_OUTBOX -> "OUTBOX"
        android.provider.Telephony.Sms.MESSAGE_TYPE_FAILED -> "FAILED"
        android.provider.Telephony.Sms.MESSAGE_TYPE_QUEUED -> "QUEUED"
        else -> "UNKNOWN"
    }

    /** Resolve a contact display name for a phone number (cached); "" if unknown. */
    private fun lookupContactName(number: String, cache: HashMap<String, String>): String {
        if (number.isEmpty()) return ""
        cache[number]?.let { return it }
        if (!hasPermission(android.Manifest.permission.READ_CONTACTS)) {
            cache[number] = ""
            return ""
        }
        var name = ""
        try {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(number),
            )
            activity.contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null,
                null,
                null,
            )?.use { c ->
                if (c.moveToFirst()) name = c.getString(0) ?: ""
            }
        } catch (e: Exception) {
            name = ""
        }
        cache[number] = name
        return name
    }

    /** Open the messaging app composed to [address]. Never requires permission. */
    @JavascriptInterface
    fun openSms(address: String): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(address)))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    // ---------------------------------------------------------------------
    // Network throughput (for the live speed indicator)
    // ---------------------------------------------------------------------

    /**
     * Cumulative byte counters since boot, for computing live up/down speed.
     * The web UI samples this on an interval and divides the delta by elapsed time.
     * {"rxBytes","txBytes","mobileRxBytes","mobileTxBytes","timestamp"} — never throws.
     */
    @JavascriptInterface
    fun getTraffic(): String {
        return try {
            fun safe(v: Long): Long = if (v < 0) 0L else v   // UNSUPPORTED == -1
            JSONObject()
                .put("rxBytes", safe(android.net.TrafficStats.getTotalRxBytes()))
                .put("txBytes", safe(android.net.TrafficStats.getTotalTxBytes()))
                .put("mobileRxBytes", safe(android.net.TrafficStats.getMobileRxBytes()))
                .put("mobileTxBytes", safe(android.net.TrafficStats.getMobileTxBytes()))
                .put("timestamp", SystemClock.elapsedRealtime())
                .toString()
        } catch (e: Exception) {
            "{}"
        }
    }

    // ---------------------------------------------------------------------
    // Terminal
    // ---------------------------------------------------------------------

    /**
     * Run a shell command (`sh -c <cmd>`) for the built-in terminal and return
     * its result as JSON: {"cmd","stdout","stderr","exit","truncated"}.
     * Non-root — many commands are permission-limited; that's expected. Output
     * is capped and the process is killed after a timeout so the UI can't hang.
     * This runs on the JS binder thread (not the UI thread), so blocking is fine.
     */
    @JavascriptInterface
    fun runCommand(cmd: String): String {
        val maxBytes = 64 * 1024
        val timeoutMs = 8000L
        return try {
            val process = ProcessBuilder("sh", "-c", cmd).redirectErrorStream(false).start()
            val out = StringBuilder()
            val err = StringBuilder()
            val tOut = Thread { drain(process.inputStream, out, maxBytes) }
            val tErr = Thread { drain(process.errorStream, err, maxBytes) }
            tOut.start(); tErr.start()
            val finished = process.waitFor(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS)
            if (!finished) {
                process.destroy()
            }
            tOut.join(500); tErr.join(500)
            val exit = if (finished) process.exitValue() else -1
            val truncated = out.length >= maxBytes || err.length >= maxBytes
            JSONObject()
                .put("cmd", cmd)
                .put("stdout", out.toString())
                .put("stderr", if (!finished) (err.toString() + "\n[timed out]") else err.toString())
                .put("exit", exit)
                .put("truncated", truncated)
                .toString()
        } catch (e: Exception) {
            JSONObject()
                .put("cmd", cmd)
                .put("stdout", "")
                .put("stderr", (e.message ?: "error"))
                .put("exit", -1)
                .put("truncated", false)
                .toString()
        }
    }

    /** Read a stream into [sink] up to [maxBytes] characters. */
    private fun drain(stream: java.io.InputStream, sink: StringBuilder, maxBytes: Int) {
        try {
            val reader = stream.bufferedReader()
            val buf = CharArray(4096)
            while (true) {
                val n = reader.read(buf)
                if (n < 0) break
                if (sink.length < maxBytes) {
                    sink.append(buf, 0, minOf(n, maxBytes - sink.length))
                }
            }
        } catch (e: Exception) {
            // swallow — partial output is fine
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
            var batteryTemp = 0.0          // °C
            var batteryVoltage = 0         // mV
            var batteryHealth = "UNKNOWN"
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
                    // Temperature reported in tenths of a degree Celsius.
                    val tempTenths = batteryStatus.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
                    if (tempTenths != Int.MIN_VALUE) batteryTemp = tempTenths / 10.0
                    val voltage = batteryStatus.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)
                    if (voltage >= 0) batteryVoltage = voltage
                    batteryHealth = batteryHealthName(
                        batteryStatus.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)
                    )
                }
            } catch (e: Exception) { /* leave defaults */ }
            obj.put("batteryPct", batteryPct)
            obj.put("charging", charging)
            obj.put("batteryTemp", batteryTemp)
            obj.put("batteryVoltage", batteryVoltage)
            obj.put("batteryHealth", batteryHealth)

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
            obj.put("securityPatch", Build.VERSION.SECURITY_PATCH ?: "")
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
                .put("sms", hasPermission(android.Manifest.permission.READ_SMS))
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
    // Apps / management
    // ---------------------------------------------------------------------

    /**
     * Start the system uninstall flow for [packageName]. Uses ACTION_DELETE
     * (not ACTION_UNINSTALL_PACKAGE). Returns true if the intent was started.
     */
    @JavascriptInterface
    fun uninstallApp(packageName: String): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Launch a common app by logical category/intent (camera, browser, phone,
     * messages, email, clock, calculator, calendar, contacts, settings).
     * Tries the primary intent then a sensible fallback; returns false if
     * nothing resolves.
     */
    @JavascriptInterface
    fun launchAppShortcut(which: String): Boolean {
        return try {
            val key = which.lowercase(Locale.US)
            // Ordered list of candidate intents; first that resolves & starts wins.
            val candidates: List<Intent> = when (key) {
                "camera" -> listOf(
                    Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA),
                    categoryMain("android.intent.category.APP_CAMERA")
                )
                "browser" -> listOf(
                    Intent(Intent.ACTION_VIEW, Uri.parse("http://")),
                    categoryMain(Intent.CATEGORY_APP_BROWSER)
                )
                "phone", "dialer" -> listOf(
                    Intent(Intent.ACTION_DIAL)
                )
                "messages", "sms" -> listOf(
                    categoryMain(Intent.CATEGORY_APP_MESSAGING)
                )
                "email" -> listOf(
                    categoryMain(Intent.CATEGORY_APP_EMAIL)
                )
                "clock" -> listOf(
                    Intent(AlarmClock.ACTION_SHOW_ALARMS),
                    categoryMain("android.intent.category.APP_CLOCK")
                )
                "calculator" -> listOf(
                    categoryMain(Intent.CATEGORY_APP_CALCULATOR)
                )
                "calendar" -> listOf(
                    categoryMain(Intent.CATEGORY_APP_CALENDAR)
                )
                "contacts" -> listOf(
                    Intent(Intent.ACTION_VIEW, ContactsContract.Contacts.CONTENT_URI)
                )
                "settings" -> listOf(
                    Intent(Settings.ACTION_SETTINGS)
                )
                else -> emptyList()
            }
            val pm = activity.packageManager
            for (intent in candidates) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                @Suppress("DEPRECATION")
                if (intent.resolveActivity(pm) != null) {
                    return try {
                        activity.startActivity(intent)
                        true
                    } catch (e: Exception) {
                        false
                    }
                }
            }
            false
        } catch (e: Exception) {
            false
        }
    }

    /** Build a CATEGORY_APP_* main-selector intent for [category]. */
    private fun categoryMain(category: String): Intent =
        Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, category)

    // ---------------------------------------------------------------------
    // Usage stats
    // ---------------------------------------------------------------------

    /** True if this app holds the special "usage access" permission. */
    @JavascriptInterface
    fun hasUsageAccess(): Boolean {
        return try {
            val appOps = activity.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    activity.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    activity.packageName
                )
            }
            mode == AppOpsManager.MODE_ALLOWED
        } catch (e: Exception) {
            false
        }
    }

    /** Open the system "Usage access" settings screen. */
    @JavascriptInterface
    fun openUsageAccessSettings(): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * JSON array of recently-used, currently-launchable apps over the last ~7
     * days, sorted by last-used DESC and capped at [limit] (1..100). Requires
     * usage access; returns "[]" otherwise. Each entry:
     * {"packageName","label","lastUsed":Long,"totalTimeMs":Long}.
     */
    @JavascriptInterface
    fun getUsageStats(limit: Int): String {
        if (!hasUsageAccess()) return "[]"
        val clamped = limit.coerceIn(1, 100)
        return try {
            val usm = activity.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val end = System.currentTimeMillis()
            val start = end - 7L * 24 * 60 * 60 * 1000   // last 7 days
            val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_BEST, start, end)
                ?: return "[]"

            // Aggregate by package: max(lastTimeUsed), sum(totalTimeInForeground).
            data class Agg(var lastUsed: Long, var totalTime: Long)
            val agg = HashMap<String, Agg>()
            for (s in stats) {
                val pkg = s.packageName ?: continue
                val a = agg[pkg]
                if (a == null) {
                    agg[pkg] = Agg(s.lastTimeUsed, s.totalTimeInForeground)
                } else {
                    if (s.lastTimeUsed > a.lastUsed) a.lastUsed = s.lastTimeUsed
                    a.totalTime += s.totalTimeInForeground
                }
            }

            val pm = activity.packageManager
            data class Entry(val pkg: String, val label: String, val lastUsed: Long, val totalTime: Long)
            val entries = ArrayList<Entry>()
            for ((pkg, a) in agg) {
                if (pkg == activity.packageName) continue          // exclude ourselves
                // Keep only currently-launchable packages.
                pm.getLaunchIntentForPackage(pkg) ?: continue
                val label = try {
                    pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
                } catch (e: Exception) {
                    pkg
                }
                entries.add(Entry(pkg, label, a.lastUsed, a.totalTime))
            }

            entries.sortByDescending { it.lastUsed }

            val arr = JSONArray()
            for (e in entries.take(clamped)) {
                arr.put(
                    JSONObject()
                        .put("packageName", e.pkg)
                        .put("label", e.label)
                        .put("lastUsed", e.lastUsed)
                        .put("totalTimeMs", e.totalTime)
                )
            }
            arr.toString()
        } catch (e: SecurityException) {
            "[]"
        } catch (e: Exception) {
            "[]"
        }
    }

    // ---------------------------------------------------------------------
    // Network / radios
    // ---------------------------------------------------------------------

    /**
     * JSON of radio / connectivity state. Never reads the Wi-Fi SSID (avoids
     * location permission). Each field is best-effort with safe defaults.
     */
    @JavascriptInterface
    fun getNetworkInfo(): String {
        return try {
            val obj = JSONObject()

            // --- Wi-Fi enabled + signal level ---
            var wifiEnabled = false
            var wifiSignalLevel = -1
            try {
                val wifi = activity.applicationContext
                    .getSystemService(Context.WIFI_SERVICE) as? WifiManager
                if (wifi != null) {
                    wifiEnabled = wifi.isWifiEnabled
                    val rssi = try { wifi.connectionInfo?.rssi } catch (e: Exception) { null }
                    if (rssi != null) {
                        wifiSignalLevel = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            wifi.calculateSignalLevel(rssi)
                        } else {
                            @Suppress("DEPRECATION")
                            WifiManager.calculateSignalLevel(rssi, 5)
                        }.coerceIn(0, 4)
                    }
                }
            } catch (e: Exception) { /* leave defaults */ }
            obj.put("wifiEnabled", wifiEnabled)
            obj.put("wifiSignalLevel", wifiSignalLevel)

            // --- Mobile data network type (needs READ_PHONE_STATE) ---
            var mobileNetworkType = "UNKNOWN"
            try {
                val tm = activity.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                if (tm != null && hasPermission(android.Manifest.permission.READ_PHONE_STATE)) {
                    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        tm.dataNetworkType
                    } else {
                        @Suppress("DEPRECATION")
                        tm.networkType
                    }
                    mobileNetworkType = mobileNetworkTypeName(type)
                }
            } catch (e: SecurityException) {
                mobileNetworkType = "UNKNOWN"
            } catch (e: Exception) {
                mobileNetworkType = "UNKNOWN"
            }
            obj.put("mobileNetworkType", mobileNetworkType)

            // --- Airplane mode ---
            var airplaneMode = false
            try {
                airplaneMode = Settings.Global.getInt(
                    activity.contentResolver,
                    Settings.Global.AIRPLANE_MODE_ON,
                    0
                ) != 0
            } catch (e: Exception) { /* leave default */ }
            obj.put("airplaneMode", airplaneMode)

            // --- Bluetooth ---
            var bluetoothEnabled = false
            try {
                val bm = activity.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                bluetoothEnabled = bm?.adapter?.isEnabled == true
            } catch (e: Exception) { /* leave default */ }
            obj.put("bluetoothEnabled", bluetoothEnabled)

            // --- Active network has INTERNET ---
            var dataConnected = false
            try {
                val cm = activity.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                if (cm != null) {
                    val network = cm.activeNetwork
                    val caps = if (network != null) cm.getNetworkCapabilities(network) else null
                    dataConnected = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
                }
            } catch (e: Exception) { /* leave default */ }
            obj.put("dataConnected", dataConnected)

            obj.toString()
        } catch (e: Exception) {
            "{}"
        }
    }

    /** Map TelephonyManager network-type constants to a friendly string. */
    private fun mobileNetworkTypeName(type: Int): String = when (type) {
        TelephonyManager.NETWORK_TYPE_GPRS,
        TelephonyManager.NETWORK_TYPE_EDGE,
        TelephonyManager.NETWORK_TYPE_CDMA,
        TelephonyManager.NETWORK_TYPE_1xRTT,
        TelephonyManager.NETWORK_TYPE_IDEN,
        TelephonyManager.NETWORK_TYPE_GSM -> "2G"
        TelephonyManager.NETWORK_TYPE_UMTS,
        TelephonyManager.NETWORK_TYPE_EVDO_0,
        TelephonyManager.NETWORK_TYPE_EVDO_A,
        TelephonyManager.NETWORK_TYPE_HSDPA,
        TelephonyManager.NETWORK_TYPE_HSUPA,
        TelephonyManager.NETWORK_TYPE_HSPA,
        TelephonyManager.NETWORK_TYPE_EVDO_B,
        TelephonyManager.NETWORK_TYPE_EHRPD,
        TelephonyManager.NETWORK_TYPE_HSPAP,
        TelephonyManager.NETWORK_TYPE_TD_SCDMA -> "3G"
        TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
        TelephonyManager.NETWORK_TYPE_NR -> "5G"
        TelephonyManager.NETWORK_TYPE_UNKNOWN -> "NONE"
        else -> "UNKNOWN"
    }

    // ---------------------------------------------------------------------
    // Audio
    // ---------------------------------------------------------------------

    /** JSON of ringer mode and per-stream current/max volumes. */
    @JavascriptInterface
    fun getAudioInfo(): String {
        return try {
            val am = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val ringerMode = when (am.ringerMode) {
                AudioManager.RINGER_MODE_NORMAL -> "NORMAL"
                AudioManager.RINGER_MODE_VIBRATE -> "VIBRATE"
                AudioManager.RINGER_MODE_SILENT -> "SILENT"
                else -> "NORMAL"
            }
            fun stream(type: Int): JSONObject = JSONObject()
                .put("cur", try { am.getStreamVolume(type) } catch (e: Exception) { 0 })
                .put("max", try { am.getStreamMaxVolume(type) } catch (e: Exception) { 0 })

            JSONObject()
                .put("ringerMode", ringerMode)
                .put("media", stream(AudioManager.STREAM_MUSIC))
                .put("ring", stream(AudioManager.STREAM_RING))
                .put("alarm", stream(AudioManager.STREAM_ALARM))
                .put("notification", stream(AudioManager.STREAM_NOTIFICATION))
                .toString()
        } catch (e: Exception) {
            "{}"
        }
    }

    // ---------------------------------------------------------------------
    // Display
    // ---------------------------------------------------------------------

    /** JSON {"brightness":0..100,"autoBrightness":Bool}. Defensive defaults. */
    @JavascriptInterface
    fun getDisplayInfo(): String {
        return try {
            val resolver = activity.contentResolver
            var brightness = 0
            try {
                val raw = Settings.System.getInt(resolver, Settings.System.SCREEN_BRIGHTNESS, 0)
                brightness = (raw.coerceIn(0, 255) * 100 / 255)
            } catch (e: Exception) { /* leave default */ }
            var autoBrightness = false
            try {
                val mode = Settings.System.getInt(
                    resolver,
                    Settings.System.SCREEN_BRIGHTNESS_MODE,
                    Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
                )
                autoBrightness = mode == Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC
            } catch (e: Exception) { /* leave default */ }
            JSONObject()
                .put("brightness", brightness)
                .put("autoBrightness", autoBrightness)
                .toString()
        } catch (e: Exception) {
            JSONObject().put("brightness", 0).put("autoBrightness", false).toString()
        }
    }

    // ---------------------------------------------------------------------
    // Quick-settings panels
    // ---------------------------------------------------------------------

    /**
     * Open a Settings.Panel slide-up (API 29+) for internet/wifi/volume/nfc.
     * On older platforms or failure, falls back to openSettings(which).
     */
    @JavascriptInterface
    fun openSettingsPanel(which: String): Boolean {
        val key = which.lowercase(Locale.US)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val action = when (key) {
                "internet" -> Settings.Panel.ACTION_INTERNET_CONNECTIVITY
                "wifi" -> Settings.Panel.ACTION_WIFI
                "volume" -> Settings.Panel.ACTION_VOLUME
                "nfc" -> Settings.Panel.ACTION_NFC
                else -> null
            }
            if (action != null) {
                try {
                    val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    activity.startActivity(intent)
                    return true
                } catch (e: Exception) {
                    // fall through to legacy settings
                }
            }
        }
        // Fallback: reasonable full-screen Settings equivalent.
        val fallbackKey = when (key) {
            "internet", "wifi" -> "wifi"
            "volume" -> "sound"
            else -> "settings"
        }
        return openSettings(fallbackKey)
    }

    // ---------------------------------------------------------------------
    // Default launcher
    // ---------------------------------------------------------------------

    /** True if this app is the current HOME (launcher) app. */
    @JavascriptInterface
    fun isDefaultLauncher(): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            @Suppress("DEPRECATION")
            val resolve = activity.packageManager.resolveActivity(
                intent,
                PackageManager.MATCH_DEFAULT_ONLY
            )
            resolve?.activityInfo?.packageName == activity.packageName
        } catch (e: Exception) {
            false
        }
    }

    /** Request to become the default launcher (RoleManager on API 29+). */
    @JavascriptInterface
    fun requestDefaultLauncher(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val rm = activity.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) {
                    val intent = rm.createRequestRoleIntent(RoleManager.ROLE_HOME)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    activity.startActivity(intent)
                    return true
                }
            } catch (e: Exception) {
                // fall through to settings
            }
        }
        // Fallback: open Home settings, then generic Settings.
        if (startSettings(Settings.ACTION_HOME_SETTINGS)) return true
        return startSettings(Settings.ACTION_SETTINGS)
    }

    // ---------------------------------------------------------------------
    // Search / URLs
    // ---------------------------------------------------------------------

    /** Run a web search for [query]; fall back to a Google search URL. */
    @JavascriptInterface
    fun webSearch(query: String): Boolean {
        return try {
            val pm = activity.packageManager
            val search = Intent(Intent.ACTION_WEB_SEARCH)
                .putExtra(SearchManager.QUERY, query)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            @Suppress("DEPRECATION")
            if (search.resolveActivity(pm) != null) {
                activity.startActivity(search)
                return true
            }
            val encoded = URLEncoder.encode(query, "UTF-8")
            val view = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://www.google.com/search?q=$encoded")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(view)
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Open [url] in a browser; prepend https:// if it has no scheme. */
    @JavascriptInterface
    fun openUrl(url: String): Boolean {
        return try {
            val normalized = if (url.contains("://")) url else "https://$url"
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(normalized))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    // ---------------------------------------------------------------------
    // Notifications (delegated to NotificationStore in this package)
    // ---------------------------------------------------------------------

    /** JSON array snapshot of active notifications. */
    @JavascriptInterface
    fun getNotifications(): String = try {
        NotificationStore.snapshotJson()
    } catch (e: Exception) {
        "[]"
    }

    /** Dismiss a notification by key. */
    @JavascriptInterface
    fun dismissNotification(key: String): Boolean = try {
        NotificationStore.dismiss(key)
    } catch (e: Exception) {
        false
    }

    /** Open (fire the content intent of) a notification by key. */
    @JavascriptInterface
    fun openNotification(key: String): Boolean = try {
        NotificationStore.open(key)
    } catch (e: Exception) {
        false
    }

    /** True if our notification listener is enabled in Secure settings. */
    @JavascriptInterface
    fun isNotificationAccessGranted(): Boolean {
        return try {
            val flat = Settings.Secure.getString(
                activity.contentResolver,
                "enabled_notification_listeners"
            )
            flat != null && flat.contains(activity.packageName)
        } catch (e: Exception) {
            false
        }
    }

    /** Open the system "Notification access" settings screen. */
    @JavascriptInterface
    fun openNotificationAccessSettings(): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    // ---------------------------------------------------------------------
    // Combined access state
    // ---------------------------------------------------------------------

    /** JSON of the three special-access toggles the UI needs to surface. */
    @JavascriptInterface
    fun getAccessState(): String {
        return try {
            JSONObject()
                .put("defaultLauncher", isDefaultLauncher())
                .put("usageAccess", hasUsageAccess())
                .put("notificationAccess", isNotificationAccessGranted())
                .toString()
        } catch (e: Exception) {
            "{}"
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
