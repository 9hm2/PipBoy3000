package com.pipboy3000.launcher.bridge

import android.content.Context
import android.os.ParcelFileDescriptor
import android.system.Os
import android.util.Base64
import java.io.FileDescriptor

/**
 * A single live shell session running on a native PTY. Raw bytes from the
 * shell are base64-encoded and pushed to the web UI (where xterm.js renders
 * them); input bytes from xterm.js flow back the other way.
 *
 * One session per launcher instance is enough for the TERM tab.
 */
class TerminalSession(
    private val context: Context,
    /** Runs a snippet of JS on the WebView (must marshal to the UI thread). */
    private val emit: (String) -> Unit,
) {

    private var fd = -1
    private var pid = -1
    private var pfd: ParcelFileDescriptor? = null
    private var fdObj: FileDescriptor? = null

    @Volatile
    private var running = false

    fun isRunning(): Boolean = running

    /** Start the shell on a PTY sized [cols] x [rows]. Returns true on success. */
    @Synchronized
    fun start(cols: Int, rows: Int): Boolean {
        if (running) {
            resize(cols, rows)
            return true
        }
        if (!PtyBridge.available) return false
        return try {
            val home = context.filesDir.absolutePath
            val tmp = context.cacheDir.absolutePath
            val env = arrayOf(
                "TERM=xterm-256color",
                "HOME=$home",
                "PATH=/system/bin:/system/xbin:/vendor/bin",
                "LANG=en_US.UTF-8",
                "TMPDIR=$tmp",
                "PS1=pip-boy:$ ",
            )
            val pidArr = IntArray(1)
            fd = PtyBridge.createSubprocess(
                "/system/bin/sh",
                home,
                arrayOf("-sh"),
                env,
                pidArr,
                rows.coerceAtLeast(1),
                cols.coerceAtLeast(1),
            )
            if (fd < 0) return false
            pid = pidArr[0]
            pfd = ParcelFileDescriptor.adoptFd(fd)
            fdObj = pfd?.fileDescriptor
            running = true

            Thread({ readLoop() }, "pip-term-read").apply { isDaemon = true; start() }
            Thread({
                val code = try { PtyBridge.waitFor(pid) } catch (e: Throwable) { 1 }
                running = false
                emit("window.dispatchEvent(new CustomEvent('pipboy:term:exit',{detail:$code}));")
            }, "pip-term-wait").apply { isDaemon = true; start() }
            true
        } catch (e: Throwable) {
            running = false
            false
        }
    }

    private fun readLoop() {
        val buf = ByteArray(8192)
        try {
            while (running) {
                val fdo = fdObj ?: break
                val n = Os.read(fdo, buf, 0, buf.size)
                if (n <= 0) break
                val b64 = Base64.encodeToString(buf, 0, n, Base64.NO_WRAP)
                emit("window.dispatchEvent(new CustomEvent('pipboy:term',{detail:'$b64'}));")
            }
        } catch (e: Throwable) {
            // pipe closed / process gone
        } finally {
            running = false
        }
    }

    /** Write base64-encoded UTF-8 input bytes (from xterm.js onData) to the shell. */
    fun write(b64: String) {
        try {
            val fdo = fdObj ?: return
            val bytes = Base64.decode(b64, Base64.NO_WRAP or Base64.DEFAULT)
            var off = 0
            while (off < bytes.size) {
                val w = Os.write(fdo, bytes, off, bytes.size - off)
                if (w <= 0) break
                off += w
            }
        } catch (e: Throwable) {
            // swallow
        }
    }

    fun resize(cols: Int, rows: Int) {
        try {
            if (fd >= 0) PtyBridge.setPtyWindowSize(fd, rows.coerceAtLeast(1), cols.coerceAtLeast(1))
        } catch (e: Throwable) {
            // swallow
        }
    }

    @Synchronized
    fun stop() {
        running = false
        try { if (pid > 0) PtyBridge.terminate(pid) } catch (e: Throwable) { }
        try { pfd?.close() } catch (e: Throwable) { }
        pfd = null
        fdObj = null
        fd = -1
        pid = -1
    }
}
