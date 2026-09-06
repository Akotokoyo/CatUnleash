// Background kill: MainActivity.onStop (finishAndRemoveTask + killProcess).
// App.exitApp() da solo non basta su Android (processo/audio restano vivi).

import "./style.css";
import { bootstrap } from "./game/bootstrap";

void bootstrap();
