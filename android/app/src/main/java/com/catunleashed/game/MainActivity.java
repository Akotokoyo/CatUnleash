package com.catunleashed.game;

import android.os.Process;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Home / recent apps → kill processo (audio, WebView, tutto). */
    @Override
    public void onStop() {
        super.onStop();
        finishAndRemoveTask();
        Process.killProcess(Process.myPid());
        System.exit(0);
    }
}
