package com.slink.retail;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 1;
    private static final int SAVE_FILE = 2;
    private static final int CAMERA_PERMISSION = 3;
    private static final int PHOTO_PERMISSION = 4;
    private static final int BLUETOOTH_PERMISSION = 5;
    private static final Set<String> WEB_FILES = new HashSet<>(Arrays.asList(
            "index.html", "styles.css", "workspace.css", "app.js", "offline-store.js",
            "offline-ledger.js", "purchase-units.js", "money-inputs.js", "offline-sync.js",
            "offline-conflict-ui.js", "supplier-returns-ui.js", "barcode-tools.js",
            "banks-vn.js", "vietqr-tools.js", "escpos-printer.js", "integrations-ui.js",
            "finance-vouchers-ui.js", "legal-content.js", "sync-bus.js", "pos-hardware.js",
            "receipt-image.js", "client/core.js", "client/charts.js", "client/shell.js",
            "client/dashboard.js", "client/pos.js", "client/products.js", "client/orders.js",
            "client/inventory.js", "client/customers.js", "client/finance.js", "client/reports.js",
            "client/staff.js", "client/settings.js", "client/actions.js",
            "register-sw.js", "sw.js", "manifest.webmanifest",
            "assets/slink-icon.svg", "assets/slink-icon-180.png", "assets/slink-icon-192.png",
            "assets/slink-icon-512.png", "assets/slink-icon-maskable-512.png"));
    private WebView web;
    private WebView printWebView;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String pendingSpeechText = null;
    private ValueCallback<Uri[]> fileCallback;
    private Uri capturedPhoto;
    private PermissionRequest cameraRequest;
    private WebChromeClient.FileChooserParams pendingChooser;
    private JSONObject pendingSave;
    private JavaScriptReplyProxy saveReply;
    private JSONObject pendingBtRequest;
    private JavaScriptReplyProxy btReply;
    private final java.util.concurrent.ExecutorService btExecutor = java.util.concurrent.Executors.newSingleThreadExecutor();
    private AppUpdater updater;
    private BluetoothEscPosPrinter btPrinter;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(0xffffffff);
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets padding = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(padding.left, padding.top, padding.right, padding.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        web = new WebView(this);
        frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .setDomain(Uri.parse(BuildConfig.APP_ORIGIN).getHost())
                .addPathHandler("/", this::localResponse)
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return isAppOrigin(request.getUrl()) ? assets.shouldInterceptRequest(request.getUrl()) : null;
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (isAppOrigin(request.getUrl())) return false;
                if (request.hasGesture() && request.isForMainFrame()) openExternal(request.getUrl());
                return true;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return isAppOrigin(request.getUrl()) ? assets.shouldInterceptRequest(request.getUrl()) : null;
                }
            });
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "SlinkAndroid", Collections.singleton(BuildConfig.APP_ORIGIN),
                    (view, message, origin, mainFrame, reply) -> {
                        if (!mainFrame || !isAppOrigin(origin)) return;
                        JSONObject payload = null;
                        try { payload = new JSONObject(message.getData()); handleMessage(payload, reply); }
                        catch (Exception error) {
                            if (payload != null) {
                                String id = payload.optString("id");
                                if (pendingSave != null && pendingSave.optString("id").equals(id)) {
                                    pendingSave = null; saveReply = null;
                                }
                                answer(reply, id, "error");
                            }
                            Toast.makeText(this, "Chưa thực hiện được. Hãy thử lại.", Toast.LENGTH_SHORT).show();
                        }
                    });
        }
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                pendingChooser = params;
                boolean image = Arrays.stream(params.getAcceptTypes()).anyMatch(type -> type.startsWith("image/"));
                if (image && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] { Manifest.permission.CAMERA }, PHOTO_PERMISSION);
                    return true;
                }
                launchFileChooser();
                return true;
            }
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (!isAppOrigin(request.getOrigin()) ||
                        !Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.deny(); return;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                } else {
                    if (cameraRequest != null) cameraRequest.deny();
                    cameraRequest = request;
                    requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_PERMISSION);
                }
            }
            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (cameraRequest == request) cameraRequest = null;
            }
        });
        updater = new AppUpdater(this, this::sendUpdateState);
        btPrinter = new BluetoothEscPosPrinter(this);
        updater.check(false);
        Uri incoming = getIntent().getData();
        Uri initial = incoming != null && isAppOrigin(incoming) ? incoming : Uri.parse(BuildConfig.APP_ORIGIN + "/");
        web.loadUrl(initial.buildUpon().appendQueryParameter("appVersion", String.valueOf(BuildConfig.VERSION_CODE)).build().toString());
    }

    private void launchFileChooser() {
        WebChromeClient.FileChooserParams params = pendingChooser;
        pendingChooser = null;
        if (params == null || fileCallback == null) return;
        capturedPhoto = null;
        Intent picker = params.createIntent();
        boolean image = Arrays.stream(params.getAcceptTypes()).anyMatch(type -> type.startsWith("image/"));
        Intent chooser = Intent.createChooser(picker, image ? "Chọn ảnh sản phẩm" : "Chọn tệp");
        if (image && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            try {
                File directory = new File(getCacheDir(), "photos");
                if (!directory.exists() && !directory.mkdirs()) throw new IOException();
                File photo = File.createTempFile("product-", ".jpg", directory);
                capturedPhoto = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", photo);
                Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                capture.putExtra(MediaStore.EXTRA_OUTPUT, capturedPhoto);
                capture.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { capture });
            } catch (IOException ignored) { capturedPhoto = null; }
        }
        try { startActivityForResult(chooser, PICK_FILE); }
        catch (ActivityNotFoundException error) { fileCallback.onReceiveValue(null); fileCallback = null; }
    }

    private boolean isAppOrigin(Uri uri) {
        Uri expected = Uri.parse(BuildConfig.APP_ORIGIN);
        return "https".equals(uri.getScheme()) && expected.getHost().equals(uri.getHost()) &&
                uri.getPort() == expected.getPort();
    }

    private WebResourceResponse localResponse(String path) {
        if (path.isEmpty() || path.equals("invite") || path.equals("verify")) path = "index.html";
        if (!WEB_FILES.contains(path)) return null;
        String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" :
                path.endsWith(".js") ? "application/javascript" : path.endsWith(".png") ? "image/png" :
                path.endsWith(".svg") ? "image/svg+xml" : "application/manifest+json";
        try {
            HashMap<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("X-Content-Type-Options", "nosniff");
            headers.put("Service-Worker-Allowed", "/");
            headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'");
            return new WebResourceResponse(mime, mime.startsWith("image/") ? null : "UTF-8", 200, "OK", headers,
                    getAssets().open("web/" + path));
        } catch (IOException error) { return null; }
    }

    private void openExternal(Uri uri) {
        if (!Arrays.asList("https", "mailto", "tel").contains(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException error) { Toast.makeText(this, "Chưa có ứng dụng để mở liên kết này.", Toast.LENGTH_SHORT).show(); }
    }

    private void answer(JavaScriptReplyProxy reply, String id, String status) {
        try { reply.postMessage(new JSONObject().put("id", id).put("status", status).toString()); }
        catch (Exception ignored) { /* The originating page may already have closed. */ }
    }

    private void handleMessage(JSONObject data, JavaScriptReplyProxy reply) throws Exception {
        String id = data.getString("id");
        if (data.toString().length() > 16000000) { answer(reply, id, "error"); return; }
        if (data.optString("type").equals("appUpdate")) {
            String action = data.optString("action");
            if (action.equals("check")) updater.check(true);
            if (action.equals("install")) { updater.install(); answer(reply, id, "opened"); return; }
            reply.postMessage(new JSONObject().put("id", id).put("update", updater.state()).toString());
        } else if (data.optString("type").equals("share")) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, data.optString("title"));
            send.putExtra(Intent.EXTRA_TEXT, data.optString("text"));
            startActivity(Intent.createChooser(send, "Gửi biên nhận"));
            answer(reply, id, "opened");
        } else if (data.optString("type").equals("save")) {
            if (pendingSave != null) { answer(reply, id, "busy"); return; }
            pendingSave = data;
            saveReply = reply;
            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            save.addCategory(Intent.CATEGORY_OPENABLE);
            save.setType(data.optString("mime", "text/plain").split(";")[0]);
            save.putExtra(Intent.EXTRA_TITLE, data.optString("name", "slink.txt").replaceAll("[\\\\/\\p{Cntrl}]", "-"));
            try { startActivityForResult(save, SAVE_FILE); }
            catch (ActivityNotFoundException error) { answer(reply, id, "error"); pendingSave = null; saveReply = null; }
        } else if (data.optString("type").equals("btPrinter")) {
            handleBtPrinterMessage(data, reply);
        } else if (data.optString("type").equals("printHtml")) {
            handlePrintHtmlMessage(data, reply);
        } else if (data.optString("type").equals("speak")) {
            handleSpeakMessage(data, reply);
        } else if (data.optString("type").equals("screenBrightness")) {
            handleScreenBrightnessMessage(data, reply);
        } else if (data.optString("type").equals("shareImage")) {
            handleShareImageMessage(data, reply);
        } else answer(reply, id, "error");
    }

    private void handleSpeakMessage(JSONObject data, JavaScriptReplyProxy reply) {
        final String id = data.optString("id");
        final String rawText = data.optString("text", "").trim();
        final boolean chime = data.optBoolean("chime", true);
        if (rawText.isEmpty() || rawText.length() > 400) {
            try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", "Nội dung đọc không hợp lệ.").toString()); }
            catch (Exception ignored) {}
            return;
        }
        runOnUiThread(() -> {
            if (chime) {
                try {
                    ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 85);
                    tg.startTone(ToneGenerator.TONE_PROP_ACK, 180);
                } catch (Exception ignored) {}
            }
            try {
                if (tts == null) {
                    pendingSpeechText = rawText;
                    tts = new TextToSpeech(getApplicationContext(), status -> {
                        if (status == TextToSpeech.SUCCESS && tts != null) {
                            int langRes = tts.setLanguage(new Locale("vi", "VN"));
                            if (langRes != TextToSpeech.LANG_MISSING_DATA && langRes != TextToSpeech.LANG_NOT_SUPPORTED) {
                                ttsReady = true;
                                String toSpeak = pendingSpeechText;
                                pendingSpeechText = null;
                                if (toSpeak != null && !toSpeak.isEmpty()) {
                                    tts.speak(toSpeak, TextToSpeech.QUEUE_FLUSH, null, "slink_tts_" + System.currentTimeMillis());
                                }
                            }
                        }
                    });
                    reply.postMessage(new JSONObject().put("id", id).put("status", "ok").toString());
                    return;
                }
                if (ttsReady) {
                    tts.speak(rawText, TextToSpeech.QUEUE_FLUSH, null, "slink_tts_" + System.currentTimeMillis());
                    reply.postMessage(new JSONObject().put("id", id).put("status", "ok").toString());
                } else {
                    pendingSpeechText = rawText;
                    reply.postMessage(new JSONObject().put("id", id).put("status", "ok").toString());
                }
            } catch (Exception error) {
                try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", "Không phát được giọng đọc.").toString()); }
                catch (Exception ignored) {}
            }
        });
    }

    private void handleScreenBrightnessMessage(JSONObject data, JavaScriptReplyProxy reply) {
        final String id = data.optString("id");
        final double rawLevel = data.optDouble("level", -1.0);
        final float level = (Double.isNaN(rawLevel) || rawLevel < 0.0)
                ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                : (float) Math.max(0.0, Math.min(1.0, rawLevel));
        runOnUiThread(() -> {
            try {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.screenBrightness = level;
                getWindow().setAttributes(lp);
                if (level >= 0.8f) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
                reply.postMessage(new JSONObject().put("id", id).put("status", "ok").put("level", level).toString());
            } catch (Exception error) {
                try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", "Không chỉnh được độ sáng.").toString()); }
                catch (Exception ignored) {}
            }
        });
    }

    private void handleShareImageMessage(JSONObject data, JavaScriptReplyProxy reply) {
        final String id = data.optString("id");
        final String dataUrl = data.optString("dataUrl", "");
        final String rawName = data.optString("filename", "slink-receipt.png").replaceAll("[^A-Za-z0-9._-]", "-");
        final String cleanName = (rawName.endsWith(".png") ? rawName : (rawName + ".png"));
        final String title = data.optString("title", "Biên nhận Slink");
        final String text = data.optString("text", "");
        int commaIdx = dataUrl.indexOf(',');
        String b64 = commaIdx >= 0 ? dataUrl.substring(commaIdx + 1) : dataUrl;
        if (b64.isEmpty() || b64.length() > 7000000) {
            try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", "Ảnh chia sẻ không hợp lệ.").toString()); }
            catch (Exception ignored) {}
            return;
        }
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            if (bytes == null || bytes.length < 8 || bytes.length > 5242880
                    || (bytes[0] & 0xFF) != 0x89 || bytes[1] != 0x50 || bytes[2] != 0x4E || bytes[3] != 0x47) {
                reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", "Định dạng ảnh PNG không hợp lệ.").toString());
                return;
            }
            File shareDir = new File(getCacheDir(), "shares");
            if (!shareDir.exists()) shareDir.mkdirs();
            File[] existing = shareDir.listFiles();
            if (existing != null && existing.length > 10) {
                for (File old : existing) { try { old.delete(); } catch (Exception ignored) {} }
            }
            File outFile = new File(shareDir, cleanName);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(bytes);
                fos.flush();
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", outFile);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            if (!title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
            if (!text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, title.isEmpty() ? "Chia sẻ biên nhận" : title));
            reply.postMessage(new JSONObject().put("id", id).put("status", "ok").toString());
        } catch (Exception error) {
            try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", "Không chia sẻ được ảnh.").toString()); }
            catch (Exception ignored) {}
        }
    }

    private void handlePrintHtmlMessage(JSONObject data, JavaScriptReplyProxy reply) {
        String id = data.optString("id");
        String rawJob = data.optString("jobName", "Slink").replaceAll("[\\r\\n\\p{Cntrl}]", " ").trim();
        final String jobName = rawJob.isEmpty() ? "Slink" : rawJob.substring(0, Math.min(rawJob.length(), 80));
        final String html = data.optString("html", "");
        if (html.isEmpty() || html.length() > 4000000) {
            try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", "Nội dung in không hợp lệ.").toString()); }
            catch (Exception ignored) {}
            return;
        }
        runOnUiThread(() -> {
            try {
                if (printWebView != null) {
                    printWebView.destroy();
                    printWebView = null;
                }
                WebView pw = new WebView(MainActivity.this);
                WebSettings ps = pw.getSettings();
                ps.setJavaScriptEnabled(false);
                ps.setAllowFileAccess(false);
                ps.setAllowContentAccess(false);
                ps.setBlockNetworkLoads(true);
                pw.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        try {
                            PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                            if (pm == null) {
                                reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", "Thiết bị không hỗ trợ dịch vụ in.").toString());
                                return;
                            }
                            PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                            pm.print(jobName, adapter, new PrintAttributes.Builder().build());
                            reply.postMessage(new JSONObject().put("id", id).put("status", "ok").toString());
                        } catch (Exception error) {
                            try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", error.getMessage() != null ? error.getMessage() : "Không mở được hộp thoại in.").toString()); }
                            catch (Exception ignored) {}
                        }
                    }
                });
                printWebView = pw;
                pw.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            } catch (Exception error) {
                try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", error.getMessage() != null ? error.getMessage() : "Không khởi tạo được trình in.").toString()); }
                catch (Exception ignored) {}
            }
        });
    }

    private void handleBtPrinterMessage(JSONObject data, JavaScriptReplyProxy reply) {
        String id = data.optString("id");
        String action = data.optString("action");
        if ("state".equals(action)) {
            try { reply.postMessage(new JSONObject().put("id", id).put("status", "ok").put("printer", btPrinter.savedState()).toString()); }
            catch (Exception ignored) {}
            return;
        }
        if ("select".equals(action)) {
            try {
                btPrinter.saveDevice(data.optString("address"), data.optString("name"));
                reply.postMessage(new JSONObject().put("id", id).put("status", "ok").put("printer", btPrinter.savedState()).toString());
            } catch (Exception error) {
                try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", error.getMessage() != null ? error.getMessage() : "Không lưu được máy in.").toString()); }
                catch (Exception ignored) {}
            }
            return;
        }
        if (!btPrinter.hasConnectPermission() && android.os.Build.VERSION.SDK_INT >= 31) {
            if (pendingBtRequest != null) {
                try { reply.postMessage(new JSONObject().put("id", id).put("status", "error").put("message", "Đang chờ xác nhận quyền Bluetooth.").toString()); }
                catch (Exception ignored) {}
                return;
            }
            pendingBtRequest = data;
            btReply = reply;
            requestPermissions(new String[] { Manifest.permission.BLUETOOTH_CONNECT }, BLUETOOTH_PERMISSION);
            return;
        }
        executeBtPrinterAction(data, reply);
    }

    private void executeBtPrinterAction(JSONObject data, JavaScriptReplyProxy reply) {
        String id = data.optString("id");
        String action = data.optString("action");
        btExecutor.execute(() -> {
            JSONObject response = new JSONObject();
            try {
                response.put("id", id);
                if ("list".equals(action)) {
                    response.put("status", "ok");
                    response.put("devices", btPrinter.listPaired());
                    response.put("printer", btPrinter.savedState());
                } else if ("print".equals(action)) {
                    btPrinter.printBase64(data.optString("address"), data.optString("base64"));
                    response.put("status", "ok");
                } else {
                    response.put("status", "error");
                    response.put("message", "Thao tác máy in không hợp lệ.");
                }
            } catch (Exception error) {
                try {
                    response.put("status", "error");
                    response.put("message", error.getMessage() != null ? error.getMessage() : "Lỗi máy in Bluetooth.");
                } catch (Exception ignored) {}
            }
            final String out = response.toString();
            runOnUiThread(() -> {
                try { reply.postMessage(out); } catch (Exception ignored) {}
            });
        });
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && fileCallback != null) {
            Uri[] selected = result == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(result, data) : null;
            if (result == RESULT_OK && selected == null && capturedPhoto != null) selected = new Uri[] { capturedPhoto };
            fileCallback.onReceiveValue(selected);
            fileCallback = null; capturedPhoto = null;
        }
        if (request == SAVE_FILE && pendingSave != null) {
            final JSONObject payload = pendingSave;
            final JavaScriptReplyProxy reply = saveReply;
            pendingSave = null; saveReply = null;
            final Uri target = data == null ? null : data.getData();
            if (result != RESULT_OK || target == null) { answer(reply, payload.optString("id"), "canceled"); return; }
            new Thread(() -> {
                String status = "saved";
                try (OutputStream stream = getContentResolver().openOutputStream(target, "wt")) {
                    if (stream == null) throw new IOException();
                    stream.write(payload.optString("content").getBytes(StandardCharsets.UTF_8));
                } catch (IOException | SecurityException error) { status = "error"; }
                final String outcome = status;
                runOnUiThread(() -> answer(reply, payload.optString("id"), outcome));
            }).start();
        }
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request == PHOTO_PERMISSION) launchFileChooser();
        if (request == CAMERA_PERMISSION && cameraRequest != null) {
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) cameraRequest.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            else cameraRequest.deny();
            cameraRequest = null;
        }
        if (request == BLUETOOTH_PERMISSION && pendingBtRequest != null) {
            JSONObject req = pendingBtRequest;
            JavaScriptReplyProxy rep = btReply;
            pendingBtRequest = null;
            btReply = null;
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) {
                executeBtPrinterAction(req, rep);
            } else {
                try {
                    rep.postMessage(new JSONObject().put("id", req.optString("id")).put("status", "error").put("message", "Bạn đã từ chối quyền Bluetooth.").toString());
                } catch (Exception ignored) {}
            }
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.SlinkHandleBack ? window.SlinkHandleBack() : false", result -> {
            if (!"true".equals(result)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); web.onPause(); }
    @Override
    protected void onResume() { super.onResume(); if (web != null) web.onResume(); if (updater != null) updater.check(false); }

    private void sendUpdateState() {
        if (web != null && updater != null) web.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('slink-app-update',{detail:" + updater.state().toString() + "}))", null);
    }
    @Override
    protected void onDestroy() {
        btExecutor.shutdownNow();
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Exception ignored) {}
            tts = null;
        }
        if (printWebView != null) { printWebView.destroy(); printWebView = null; }
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (cameraRequest != null) cameraRequest.deny();
        web.destroy();
        super.onDestroy();
    }
}
