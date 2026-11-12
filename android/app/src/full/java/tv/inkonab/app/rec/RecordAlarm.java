package tv.inkonab.app.rec;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** A scheduled recording is due (or the TV box restarted): start the recorder. */
public class RecordAlarm extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())) { Recorder.reschedule(c); return; }
        RecordService.start(c);
    }
}
