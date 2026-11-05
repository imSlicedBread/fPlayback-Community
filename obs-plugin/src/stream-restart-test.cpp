// SPDX-License-Identifier: GPL-2.0-or-later
#include "stream-restart.hpp"
#include <cstdlib>
#include <initializer_list>
static void check(bool ok){if(!ok)std::abort();}
int main(){
  using A=StreamRestartAction;using P=StreamRestartPhase;
  const auto due=StreamRestart::interval;
  StreamRestart p;p.started(0);
  check(p.tick(due,false,true,true,true)==A::None);
  check(p.tick(due,true,false,true,true)==A::None);
  check(p.tick(due,true,true,false,true)==A::None);
  check(p.tick(due,true,true,true,false)==A::None);
  check(p.tick(due-1,true,true,true,true)==A::None);
  check(p.tick(due,true,true,true,true)==A::Stop);
  p.stopping();check(p.phase==P::Stopping);
  check(p.tick(due+1,true,true,true,true)==A::None);
  p.stopped(due+1000);
  check(p.tick(due+120999,true,true,false,true)==A::None);
  check(p.tick(due+121000,true,true,false,false)==A::None);
  check(p.tick(due+121000,true,true,false,true)==A::Start);
  check(p.tick(due+121001,true,true,false,true)==A::None);
  p.started(due+122000);check(p.phase==P::Idle);
  check(p.tick(due+122001,true,true,true,true)==A::None);
  // Manual stop never starts a broadcast.
  p.stopping();p.stopped(due+123000);
  check(p.tick(due*3,true,true,false,true)==A::None);
  // Disable or service switch cancels pending reconnect.
  for(bool disable:{false,true}){
    p.started(0);check(p.tick(due,true,true,true,true)==A::Stop);p.stopped(due);
    p.tick(due+1,!disable,disable,false,true);
    check(p.tick(due*2,true,true,false,true)==A::None);
  }
  // A failed stop or start is bounded and requires manual attention.
  p.started(0);p.tick(due,true,true,true,true);
  p.tick(due+30000,true,true,true,true);check(p.phase==P::Failed);
  check(p.tick(due*4,true,true,true,true)==A::None);
  p.cancel();p.started(0);p.tick(due,true,true,true,true);p.stopped(due);
  check(p.tick(due+120000,true,true,false,true)==A::Start);
  p.tick(due+150000,true,true,false,true);check(p.phase==P::Failed);
  // Long uptimes use a monotonic 64-bit timebase.
  const int64_t later=365LL*24*60*60*1000;p.started(later);
  check(p.tick(later+due,true,true,true,true)==A::Stop);
  p.started(-due);check(p.tick(0,true,true,true,true)==A::Stop);
  p.stopped(0);p.tick(StreamRestart::gap+300000,true,true,false,false);
  check(p.phase==P::Failed);
}
