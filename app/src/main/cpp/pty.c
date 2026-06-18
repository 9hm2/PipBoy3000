/*
 * Minimal pseudo-terminal (PTY) bridge for the Pip-Boy terminal.
 *
 * This is an original, self-contained implementation of the standard POSIX
 * "spawn a shell on a PTY" technique (forkpty + execvp). The Java/Kotlin side
 * reads/writes the returned master fd and feeds the bytes to xterm.js, which
 * does the actual VT/ANSI terminal emulation.
 */
#include <jni.h>
#include <pty.h>
#include <unistd.h>
#include <termios.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <signal.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>

/* Spawn `cmd` (argv) on a fresh PTY. Returns the master fd, or -1 on error.
 * The child's pid is written to processId[0]. */
JNIEXPORT jint JNICALL
Java_com_pipboy3000_launcher_bridge_PtyBridge_createSubprocess(
        JNIEnv *env, jclass clazz,
        jstring cmd, jstring cwd,
        jobjectArray args, jobjectArray envVars,
        jintArray processId, jint rows, jint columns) {
    (void) clazz;

    const char *cmd_c = (*env)->GetStringUTFChars(env, cmd, NULL);
    const char *cwd_c = cwd ? (*env)->GetStringUTFChars(env, cwd, NULL) : NULL;

    /* Build argv. */
    jsize argc = args ? (*env)->GetArrayLength(env, args) : 0;
    char **argv = (char **) malloc((argc + 2) * sizeof(char *));
    argv[0] = strdup(cmd_c);
    for (jsize i = 0; i < argc; i++) {
        jstring s = (jstring) (*env)->GetObjectArrayElement(env, args, i);
        const char *sc = (*env)->GetStringUTFChars(env, s, NULL);
        argv[i + 1] = strdup(sc);
        (*env)->ReleaseStringUTFChars(env, s, sc);
        (*env)->DeleteLocalRef(env, s);
    }
    argv[argc + 1] = NULL;

    /* Build envp. */
    jsize envc = envVars ? (*env)->GetArrayLength(env, envVars) : 0;
    char **envp = (char **) malloc((envc + 1) * sizeof(char *));
    for (jsize i = 0; i < envc; i++) {
        jstring s = (jstring) (*env)->GetObjectArrayElement(env, envVars, i);
        const char *sc = (*env)->GetStringUTFChars(env, s, NULL);
        envp[i] = strdup(sc);
        (*env)->ReleaseStringUTFChars(env, s, sc);
        (*env)->DeleteLocalRef(env, s);
    }
    envp[envc] = NULL;

    struct winsize ws;
    ws.ws_row = (unsigned short) (rows > 0 ? rows : 24);
    ws.ws_col = (unsigned short) (columns > 0 ? columns : 80);
    ws.ws_xpixel = 0;
    ws.ws_ypixel = 0;

    int master = -1;
    pid_t pid = forkpty(&master, NULL, NULL, &ws);
    if (pid < 0) {
        master = -1;
        goto cleanup;
    }

    if (pid == 0) {
        /* Child: become the shell. */
        if (cwd_c != NULL) {
            if (chdir(cwd_c) != 0) { /* ignore — fall back to default cwd */ }
        }
        /* Apply the supplied environment. */
        clearenv();
        for (jsize i = 0; i < envc; i++) {
            putenv(envp[i]); /* envp[i] is heap-allocated; lives until exec */
        }
        execvp(argv[0], argv);
        _exit(127); /* exec failed */
    }

    /* Parent. */
    if (processId != NULL) {
        jint pidValue = (jint) pid;
        (*env)->SetIntArrayRegion(env, processId, 0, 1, &pidValue);
    }

cleanup:
    (*env)->ReleaseStringUTFChars(env, cmd, cmd_c);
    if (cwd_c) (*env)->ReleaseStringUTFChars(env, cwd, cwd_c);
    /* Parent frees its copies; child already exec'd or exited. */
    for (jsize i = 0; i < argc + 1 && argv[i]; i++) free(argv[i]);
    free(argv);
    for (jsize i = 0; i < envc; i++) free(envp[i]);
    free(envp);
    return master;
}

JNIEXPORT void JNICALL
Java_com_pipboy3000_launcher_bridge_PtyBridge_setPtyWindowSize(
        JNIEnv *env, jclass clazz, jint fd, jint rows, jint columns) {
    (void) env; (void) clazz;
    struct winsize ws;
    ws.ws_row = (unsigned short) (rows > 0 ? rows : 24);
    ws.ws_col = (unsigned short) (columns > 0 ? columns : 80);
    ws.ws_xpixel = 0;
    ws.ws_ypixel = 0;
    ioctl(fd, TIOCSWINSZ, &ws);
}

/* Block until the child exits; return its exit status (or 1 on error). */
JNIEXPORT jint JNICALL
Java_com_pipboy3000_launcher_bridge_PtyBridge_waitFor(
        JNIEnv *env, jclass clazz, jint pid) {
    (void) env; (void) clazz;
    int status = 0;
    while (waitpid(pid, &status, 0) < 0) {
        /* retry on EINTR */
    }
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
    return 1;
}

/* Best-effort terminate the child process group, then close the fd. */
JNIEXPORT void JNICALL
Java_com_pipboy3000_launcher_bridge_PtyBridge_terminate(
        JNIEnv *env, jclass clazz, jint pid) {
    (void) env; (void) clazz;
    if (pid > 0) {
        kill(pid, SIGHUP);
        kill(pid, SIGTERM);
    }
}

JNIEXPORT void JNICALL
Java_com_pipboy3000_launcher_bridge_PtyBridge_closeFd(
        JNIEnv *env, jclass clazz, jint fd) {
    (void) env; (void) clazz;
    if (fd >= 0) close(fd);
}
