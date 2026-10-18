package com.zhenli.export;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Android Storage Access Framework (ACTION_CREATE_DOCUMENT) PDF Save As picker.
 * Never requires broad storage permissions or exposes PDFs through public URLs.
 * Source must be an app-owned cache file; destination is chosen by the user.
 */
@CapacitorPlugin(name = "AnnualReturnSaver")
public class AnnualReturnSaver extends Plugin {
    private File validateSource(PluginCall call) throws Exception {
        String value = call.getString("path", "");
        if (value.startsWith("file://")) value = Uri.parse(value).getPath();
        if (value.isEmpty()) throw new IllegalArgumentException("PDF source file is missing.");
        File file = new File(value).getCanonicalFile();
        File cache = getContext().getCacheDir().getCanonicalFile();
        if (!file.toPath().startsWith(cache.toPath()) || !file.isFile() || file.length() == 0) {
            throw new IllegalArgumentException("PDF source is missing or outside the app's temporary storage.");
        }
        if (file.length() > 60L * 1024L * 1024L) {
            throw new IllegalArgumentException("PDF is too large to export (60 MB maximum).");
        }
        return file;
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        try {
            validateSource(call);
            String name = call.getString("filename", "Annual Return Review.pdf");
            name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
            if (name.length() > 150) name = name.substring(0, 150);
            if (name.isEmpty()) name = "Annual Return Review.pdf";
            if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/pdf");
            intent.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(call, intent, "handleSaveResult");
        } catch (Exception e) {
            call.reject("Unable to open Android Save As picker: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void handleSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK ||
            result.getData() == null || result.getData().getData() == null) {
            call.reject("SAVE_CANCELLED");
            return;
        }
        Uri destination = result.getData().getData();
        try {
            File source = validateSource(call);
            try (InputStream in = new FileInputStream(source);
                 OutputStream out = getContext().getContentResolver().openOutputStream(destination, "wt")) {
                if (out == null) throw new IllegalStateException("Cannot open selected destination for writing.");
                byte[] buffer = new byte[32768];
                int size;
                while ((size = in.read(buffer)) != -1) out.write(buffer, 0, size);
                out.flush();
            }
            JSObject response = new JSObject();
            response.put("saved", true);
            response.put("uri", destination.toString());
            response.put("filename", call.getString("filename", "Annual Return Review.pdf"));
            call.resolve(response);
        } catch (Exception e) {
            call.reject("Android could not write the selected PDF: " + e.getMessage());
        }
    }
}
