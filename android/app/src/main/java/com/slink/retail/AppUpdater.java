package com.slink.retail;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** Downloads signed updates; installation is always initiated by the user. */
final class AppUpdater {
    private static final long MAX_APK = 64L * 1024 * 1024;
    private final Activity activity;
    private final Runnable changed;
    private final File directory;
    private static final AtomicBoolean busy = new AtomicBoolean();
    private volatile String status = "idle";
    private volatile JSONObject ready;

    AppUpdater(Activity activity, Runnable changed) {
        this.activity = activity; this.changed = changed;
        directory = new File(activity.getCacheDir(), "updates");
        try {
            JSONObject saved = new JSONObject(readSmall(new FileInputStream(new File(directory, "ready.json")), 16384));
            validatePackage(new File(directory, "ready.apk"), saved);
            ready = saved; status = "ready";
        } catch (Exception ignored) { /* Cache can be evicted or an update already installed. */ }
    }

    JSONObject state() {
        JSONObject result = new JSONObject();
        try {
            result.put("status", status).put("versionName", BuildConfig.VERSION_NAME);
            if (ready != null) result.put("nextVersion", ready.getString("versionName"));
        } catch (Exception ignored) { }
        return result;
    }

    void check(boolean manual) {
        long last = activity.getPreferences(0).getLong("update-check", 0);
        if ((!manual && System.currentTimeMillis() - last < 6 * 60 * 60 * 1000L) || !busy.compareAndSet(false, true)) return;
        new Thread(() -> {
            try {
                status = "checking"; notifyChanged();
                JSONObject manifest;
                HttpURLConnection connection = connect(new URL(BuildConfig.UPDATE_MANIFEST));
                try {
                    if (connection.getResponseCode() == 404) { status = ready == null ? "unpublished" : "ready"; return; }
                    if (connection.getResponseCode() != 200) throw new IOException();
                    manifest = new JSONObject(readSmall(connection.getInputStream(), 16384));
                } finally { connection.disconnect(); }
                validateManifest(manifest);
                if (manifest.getLong("versionCode") <= BuildConfig.VERSION_CODE) {
                    ready = null; status = "current"; return;
                }
                if (ready != null && ready.getLong("versionCode") == manifest.getLong("versionCode")) { status = "ready"; return; }
                status = "downloading"; notifyChanged();
                if (!directory.exists() && !directory.mkdirs()) throw new IOException();
                File partial = new File(directory, "download.part");
                HttpURLConnection download = connect(new URL(manifest.getString("url")));
                try {
                    if (download.getResponseCode() != 200) throw new IOException();
                    try (InputStream input = download.getInputStream(); OutputStream output = new FileOutputStream(partial)) {
                        byte[] buffer = new byte[32768]; long total = 0; int count;
                        while ((count = input.read(buffer)) != -1) {
                            total += count;
                            if (total > manifest.getLong("sizeBytes") || total > MAX_APK) throw new IOException();
                            output.write(buffer, 0, count);
                        }
                    }
                } finally { download.disconnect(); }
                validatePackage(partial, manifest);
                File destination = new File(directory, "ready.apk");
                java.nio.file.Files.move(partial.toPath(), destination.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                try (OutputStream output = new FileOutputStream(new File(directory, "ready.json"))) {
                    output.write(manifest.toString().getBytes(StandardCharsets.UTF_8));
                }
                ready = manifest; status = "ready";
            } catch (Exception error) { status = ready == null ? "unavailable" : "ready"; }
            finally {
                activity.getPreferences(0).edit().putLong("update-check", System.currentTimeMillis()).apply();
                busy.set(false); notifyChanged();
            }
        }, "Slink-app-update").start();
    }

    private void notifyChanged() { activity.runOnUiThread(() -> { if (!activity.isDestroyed()) changed.run(); }); }

    void install() throws Exception {
        JSONObject candidate = ready;
        if (candidate == null || busy.get()) throw new IOException("Chưa có bản cập nhật sẵn sàng.");
        File apk = new File(directory, "ready.apk");
        validatePackage(apk, candidate);
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
            return;
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", apk);
        Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        activity.startActivity(install);
    }

    private static void validateManifest(JSONObject manifest) throws Exception {
        if (manifest.getInt("schemaVersion") != 1 || !"com.slink.retail".equals(manifest.getString("packageName")) ||
            manifest.getLong("versionCode") < 1 || manifest.getString("versionName").length() > 40 ||
            !manifest.getString("sha256").matches("[a-f0-9]{64}") || manifest.getLong("sizeBytes") < 1 ||
            manifest.getLong("sizeBytes") > MAX_APK) throw new IOException();
        URL url = new URL(manifest.getString("url"));
        if (!"https".equals(url.getProtocol()) || !"github.com".equals(url.getHost()) || url.getUserInfo() != null ||
            url.getPort() != -1 || !url.getPath().startsWith("/huynhbao2024bm-a11y/Slink/releases/download/")) throw new IOException();
    }

    private void validatePackage(File apk, JSONObject manifest) throws Exception {
        validateManifest(manifest);
        if (apk.length() != manifest.getLong("sizeBytes")) throw new IOException();
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(apk)) {
            byte[] buffer = new byte[32768]; int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format("%02x", value & 255));
        if (!hex.toString().equals(manifest.getString("sha256"))) throw new IOException();
        PackageManager manager = activity.getPackageManager();
        PackageInfo next = manager.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
        PackageInfo installed = manager.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
        if (next == null || !activity.getPackageName().equals(next.packageName) ||
            next.getLongVersionCode() != manifest.getLong("versionCode") || next.getLongVersionCode() <= installed.getLongVersionCode() ||
            next.signingInfo == null || installed.signingInfo == null) throw new IOException();
        Signature[] trusted = installed.signingInfo.getApkContentsSigners(), received = next.signingInfo.getApkContentsSigners();
        if (trusted.length != received.length) throw new IOException();
        for (int i = 0; i < trusted.length; i++) if (!Arrays.equals(trusted[i].toByteArray(), received[i].toByteArray())) throw new IOException();
    }

    private static HttpURLConnection connect(URL original) throws Exception {
        URL url = original;
        for (int redirect = 0; redirect < 6; redirect++) {
            if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null || url.getPort() != -1 ||
                !Arrays.asList("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com").contains(url.getHost())) throw new IOException();
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "Slink-Android/" + BuildConfig.VERSION_NAME);
            connection.setRequestProperty("Cache-Control", "no-cache");
            int code = connection.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String location = connection.getHeaderField("Location"); connection.disconnect();
                if (location == null) throw new IOException();
                url = new URL(url, location);
            } else return connection;
        }
        throw new IOException();
    }

    private static String readSmall(InputStream stream, int limit) throws IOException {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > limit) throw new IOException();
                output.write(buffer, 0, count);
            }
            return output.toString("UTF-8");
        }
    }
}
