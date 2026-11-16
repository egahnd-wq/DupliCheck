package com.hendrand.duplicheck;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new VcfSaverInterface(), "AndroidVCFSaver");
        }
    }

    private class VcfSaverInterface {
        @JavascriptInterface
        public boolean saveVcf(String filename, String content) {
            String safeName = (filename != null && !filename.trim().isEmpty())
                ? filename.replaceAll("[^a-zA-Z0-9._-]", "_")
                : "kontak-rapi.vcf";
            byte[] bytes = content != null ? content.getBytes(StandardCharsets.UTF_8) : new byte[0];

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, "text/vcard");
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri != null) {
                        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                            if (out != null) {
                                out.write(bytes);
                                out.flush();
                            }
                        }
                    }
                } else {
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!downloadsDir.exists()) {
                        downloadsDir.mkdirs();
                    }
                    File outFile = new File(downloadsDir, safeName);
                    try (FileOutputStream out = new FileOutputStream(outFile)) {
                        out.write(bytes);
                        out.flush();
                    }
                }

                runOnUiThread(() ->
                    Toast.makeText(
                        MainActivity.this,
                        "Disimpan ke Downloads/" + safeName,
                        Toast.LENGTH_LONG
                    ).show()
                );
                return true;
            } catch (Exception e) {
                runOnUiThread(() ->
                    Toast.makeText(
                        MainActivity.this,
                        "Gagal menyimpan file VCF: " + e.getMessage(),
                        Toast.LENGTH_LONG
                    ).show()
                );
                return false;
            }
        }
    }
}
