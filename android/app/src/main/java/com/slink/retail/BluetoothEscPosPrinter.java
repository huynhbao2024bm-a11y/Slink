package com.slink.retail;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.json.JSONArray;
import org.json.JSONObject;

public class BluetoothEscPosPrinter {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String PREFS = "slink_bt_printer";
    private static final String KEY_ADDRESS = "address";
    private static final String KEY_NAME = "name";
    private final Context context;

    public BluetoothEscPosPrinter(Context context) {
        this.context = context.getApplicationContext();
    }

    public boolean hasConnectPermission() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        return manager != null ? manager.getAdapter() : BluetoothAdapter.getDefaultAdapter();
    }

    public JSONObject savedState() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject out = new JSONObject();
        try {
            String addr = prefs.getString(KEY_ADDRESS, "");
            String name = prefs.getString(KEY_NAME, "");
            BluetoothAdapter bt = adapter();
            out.put("supported", bt != null);
            out.put("enabled", bt != null && bt.isEnabled());
            out.put("connected", addr != null && !addr.isEmpty());
            out.put("address", addr != null ? addr : "");
            out.put("name", name != null ? name : "");
        } catch (Exception ignored) {}
        return out;
    }

    private BluetoothDevice findBondedDevice(BluetoothAdapter bt, String address) {
        if (bt == null || address == null || !BluetoothAdapter.checkBluetoothAddress(address)) return null;
        Set<BluetoothDevice> bonded = bt.getBondedDevices();
        if (bonded == null) return null;
        for (BluetoothDevice d : bonded) {
            if (address.equalsIgnoreCase(d.getAddress())) return d;
        }
        return null;
    }

    public void saveDevice(String address, String name) {
        String cleanAddr = address == null ? "" : address.trim().toUpperCase(java.util.Locale.US);
        String cleanName = name == null ? "" : name.trim();
        if (!cleanAddr.isEmpty()) {
            if (!BluetoothAdapter.checkBluetoothAddress(cleanAddr)) {
                throw new IllegalArgumentException("Địa chỉ máy in Bluetooth không hợp lệ.");
            }
            if (hasConnectPermission()) {
                BluetoothAdapter bt = adapter();
                if (bt != null && findBondedDevice(bt, cleanAddr) == null) {
                    throw new IllegalArgumentException("Máy in chưa được ghép đôi với thiết bị này.");
                }
            }
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_ADDRESS, cleanAddr)
                .putString(KEY_NAME, cleanName)
                .apply();
    }

    public JSONArray listPaired() throws Exception {
        JSONArray list = new JSONArray();
        if (!hasConnectPermission()) throw new SecurityException("Cần cấp quyền Bluetooth để xem máy in đã ghép đôi.");
        BluetoothAdapter bt = adapter();
        if (bt == null) throw new IllegalStateException("Thiết bị không hỗ trợ Bluetooth.");
        if (!bt.isEnabled()) throw new IllegalStateException("Hãy bật Bluetooth trên điện thoại trước.");
        Set<BluetoothDevice> bonded = bt.getBondedDevices();
        if (bonded != null) {
            for (BluetoothDevice device : bonded) {
                JSONObject item = new JSONObject();
                String name = device.getName();
                item.put("name", name != null && !name.isEmpty() ? name : device.getAddress());
                item.put("address", device.getAddress());
                list.put(item);
            }
        }
        return list;
    }

    public void printBase64(String requestedAddress, String base64Bytes) throws Exception {
        if (!hasConnectPermission()) throw new SecurityException("Cần cấp quyền Bluetooth để in hóa đơn.");
        BluetoothAdapter bt = adapter();
        if (bt == null) throw new IllegalStateException("Thiết bị không hỗ trợ Bluetooth.");
        if (!bt.isEnabled()) throw new IllegalStateException("Hãy bật Bluetooth trên điện thoại trước.");
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String address = (requestedAddress != null && !requestedAddress.trim().isEmpty())
                ? requestedAddress.trim().toUpperCase(java.util.Locale.US)
                : prefs.getString(KEY_ADDRESS, "");
        if (address == null || address.isEmpty()) {
            throw new IllegalStateException("Chưa chọn máy in Bluetooth. Vào Cài đặt để chọn máy in đã ghép đôi.");
        }
        if (!BluetoothAdapter.checkBluetoothAddress(address)) {
            throw new IllegalArgumentException("Địa chỉ máy in Bluetooth không hợp lệ.");
        }
        BluetoothDevice device = findBondedDevice(bt, address);
        if (device == null) {
            throw new IllegalStateException("Máy in Bluetooth chưa được ghép đôi. Hãy ghép đôi trong Cài đặt Bluetooth trước.");
        }
        byte[] raw = Base64.decode(base64Bytes, Base64.DEFAULT);
        if (raw == null || raw.length == 0 || raw.length > 262144) {
            throw new IllegalArgumentException("Dữ liệu in không hợp lệ.");
        }
        BluetoothSocket socket = null;
        ExecutorService connectExec = Executors.newSingleThreadExecutor();
        try {
            final BluetoothSocket s = device.createRfcommSocketToServiceRecord(SPP_UUID);
            socket = s;
            Future<?> connFuture = connectExec.submit(() -> {
                s.connect();
                return null;
            });
            try {
                connFuture.get(8, TimeUnit.SECONDS);
            } catch (TimeoutException timeout) {
                connFuture.cancel(true);
                try { s.close(); } catch (IOException ignored) {}
                throw new IOException("Kết nối máy in Bluetooth quá thời gian (8 giây). Kiểm tra nguồn máy in.");
            } catch (Exception connectErr) {
                connFuture.cancel(true);
                throw new IOException(connectErr.getMessage() != null ? connectErr.getMessage() : "Không kết nối được máy in.");
            }
            OutputStream out = socket.getOutputStream();
            int offset = 0;
            while (offset < raw.length) {
                int chunk = Math.min(512, raw.length - offset);
                out.write(raw, offset, chunk);
                offset += chunk;
            }
            out.flush();
            try { Thread.sleep(180); } catch (InterruptedException ignored) {}
        } catch (IOException error) {
            throw new IOException("Không kết nối được máy in Bluetooth (" + address + "). Kiểm tra máy in đã bật và nằm trong phạm vi.");
        } finally {
            connectExec.shutdownNow();
            if (socket != null) {
                try { socket.close(); } catch (IOException ignored) {}
            }
        }
    }
}
