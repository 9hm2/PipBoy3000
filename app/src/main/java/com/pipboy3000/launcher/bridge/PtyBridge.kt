package com.pipboy3000.launcher.bridge

/**
 * JNI surface for the native PTY (libpippty). Spawns a shell on a real
 * pseudo-terminal and hands back the master fd; xterm.js on the web side does
 * the terminal emulation over the bytes that flow through it.
 */
object PtyBridge {

    /** True if the native library loaded; terminal features no-op otherwise. */
    @Volatile
    var available: Boolean = false
        private set

    init {
        available = try {
            System.loadLibrary("pippty")
            true
        } catch (e: Throwable) {
            false
        }
    }

    /** Fork a shell on a PTY. Returns the master fd (or -1); fills processId[0]. */
    external fun createSubprocess(
        cmd: String,
        cwd: String,
        args: Array<String>,
        envVars: Array<String>,
        processId: IntArray,
        rows: Int,
        columns: Int,
    ): Int

    external fun setPtyWindowSize(fd: Int, rows: Int, columns: Int)

    external fun waitFor(pid: Int): Int

    external fun terminate(pid: Int)

    external fun closeFd(fd: Int)
}
