// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <cstdint>

enum class StreamRestartAction { None, Stop, Start };
enum class StreamRestartPhase { Idle, Stopping, Waiting, Starting, Failed };
struct StreamRestart {
  static constexpr int64_t interval= (47LL*60+55)*60*1000;
  static constexpr int64_t gap=120000;
  int64_t startedAt=-1, phaseAt=0;
  bool hasStarted=false;
  StreamRestartPhase phase=StreamRestartPhase::Idle;
  void cancel() {phase=StreamRestartPhase::Idle;phaseAt=0;}
  void started(int64_t now) {cancel();startedAt=now;hasStarted=true;}
  void stopping() {if(phase!=StreamRestartPhase::Stopping){cancel();startedAt=-1;hasStarted=false;}}
  void stopped(int64_t now) {
    startedAt=-1;hasStarted=false;
    if(phase==StreamRestartPhase::Stopping){phase=StreamRestartPhase::Waiting;phaseAt=now;}
    else if(phase!=StreamRestartPhase::Waiting && phase!=StreamRestartPhase::Failed)cancel();
  }
  StreamRestartAction tick(int64_t now,bool enabled,bool twitch,bool active,bool ready) {
    if(!enabled||!twitch){cancel();return StreamRestartAction::None;}
    if(phase==StreamRestartPhase::Failed)return StreamRestartAction::None;
    if(phase==StreamRestartPhase::Stopping || phase==StreamRestartPhase::Starting){
      if(now-phaseAt>=30000)phase=StreamRestartPhase::Failed;
      return StreamRestartAction::None;
    }
    if(phase==StreamRestartPhase::Waiting){
      if(active){started(now);return StreamRestartAction::None;}
      if(!ready && now-phaseAt>=gap+300000){phase=StreamRestartPhase::Failed;return StreamRestartAction::None;}
      if(ready && now-phaseAt>=gap){phase=StreamRestartPhase::Starting;phaseAt=now;return StreamRestartAction::Start;}
      return StreamRestartAction::None;
    }
    if(active && ready && hasStarted && now-startedAt>=interval){
      phase=StreamRestartPhase::Stopping;phaseAt=now;return StreamRestartAction::Stop;
    }
    return StreamRestartAction::None;
  }
};
