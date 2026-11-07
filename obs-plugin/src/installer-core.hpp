// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <vector>
#include <string>
#include <stdexcept>
#include <functional>
#include <algorithm>
#include <atomic>

namespace playback_installer {
#ifndef PLAYBACK_OBS33
#define PLAYBACK_OBS33 0
#endif
inline constexpr bool obs33=PLAYBACK_OBS33!=0;
namespace fs=std::filesystem;
inline fs::path browserFolder(const fs::path &root){return root/(obs33?L"core/obs-browser":L"obs-plugins/64bit");}
struct Payload { fs::path relative; const unsigned char *bytes; size_t size; };
inline std::vector<unsigned char> read(const fs::path &path) {
  std::ifstream file(path,std::ios::binary);
  if (!file) throw std::runtime_error("Could not read a plugin file.");
  return {std::istreambuf_iterator<char>(file),std::istreambuf_iterator<char>()};
}
inline bool versionMatches(const fs::path &path, int major, int minor, int patch) {
  DWORD unused=0, size=GetFileVersionInfoSizeW(path.c_str(),&unused);
  if (!size) return false;
  std::vector<unsigned char> data(size);
  if (!GetFileVersionInfoW(path.c_str(),0,size,data.data())) return false;
  VS_FIXEDFILEINFO *info=nullptr; UINT length=0;
  return VerQueryValueW(data.data(),L"\\",reinterpret_cast<void **>(&info),&length) &&
    length>=sizeof(*info) && HIWORD(info->dwFileVersionMS)==major &&
    LOWORD(info->dwFileVersionMS)==minor && HIWORD(info->dwFileVersionLS)==patch;
}
inline void validate(const fs::path &root) {
  if (!root.is_absolute()) throw std::runtime_error("Choose the full OBS installation folder.");
  const auto obsExe=root/L"bin/64bit/obs64.exe";
  if (!fs::is_regular_file(obsExe) ||
      !fs::is_regular_file(root/L"bin/64bit/libobs-winrt.dll"))
    throw std::runtime_error("Choose the OBS installation folder containing bin and obs-plugins.");
  const bool supportedObs=obs33
    ? versionMatches(obsExe,33,0,0) || versionMatches(obsExe,33,0,1)
    : versionMatches(obsExe,32,2,2);
  if (!supportedObs || !versionMatches(root/L"bin/64bit/Qt6Core.dll",6,11,1))
    throw std::runtime_error(obs33?"This installer requires OBS 33.0.0 or 33.0.1 with Qt 6.11.1. Use the matching OBS plugin installer. Nothing was changed.":"This installer requires OBS 32.2.2 with Qt 6.11.1. Use the matching OBS plugin installer. Nothing was changed.");
  if(!fs::is_regular_file(browserFolder(root)/L"obs-browser.dll"))
    throw std::runtime_error("The matching OBS browser module is missing. Reinstall the complete supported OBS build; do not replace individual Chromium DLLs. Nothing was changed.");
  if (!versionMatches(browserFolder(root)/L"libcef.dll",obs33?150:127,obs33?0:145,obs33?20:7))
    throw std::runtime_error(obs33?"OBS browser runtime is missing or incompatible. This build requires CEF 150.0.20. Nothing was changed.":"OBS browser runtime is missing or incompatible. This build requires CEF 127.145.7. Nothing was changed.");
}
inline fs::path install(const fs::path &root, const std::vector<Payload> &payloads,
                        const std::function<void(size_t)> &afterCommit={}) {
  static std::atomic<unsigned> sequence{0};
  const std::wstring stamp=std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64())+L"-"+std::to_wstring(++sequence);
  const fs::path backup=root/L"data/obs-plugins/fplayback-youtube/backups"/stamp;
  struct File {fs::path target,temp,backup; bool existed=false,committed=false;};
  std::vector<File> files;
  try {
    for (const auto &payload:payloads) {
      if (payload.relative.is_absolute() || payload.relative.empty()) throw std::runtime_error("Invalid installer payload.");
      for (const auto &part:payload.relative) if (part==L"..") throw std::runtime_error("Invalid installer payload.");
      File file{root/payload.relative,root/payload.relative,backup/payload.relative};
      file.temp+=L".new-"+stamp;
      fs::create_directories(file.target.parent_path());
      file.existed=fs::exists(file.target);
      files.push_back(file);
      if (file.existed) {
        fs::create_directories(file.backup.parent_path());
        if (!CopyFileW(file.target.c_str(),file.backup.c_str(),TRUE))
          throw std::runtime_error("Could not back up the existing plugin. Close OBS and try again.");
      }
      {
        std::ofstream output(file.temp,std::ios::binary|std::ios::trunc);
        output.write(reinterpret_cast<const char *>(payload.bytes),payload.size);
        output.close();
        if (!output) throw std::runtime_error("Could not write the plugin. Check folder permissions and free space.");
      }
      const auto actual=read(file.temp);
      if (actual.size()!=payload.size || !std::equal(actual.begin(),actual.end(),payload.bytes))
        throw std::runtime_error("Plugin verification failed. The installed plugin was not replaced.");
    }
    size_t count=0;
    for (auto &file:files) {
      if (!MoveFileExW(file.temp.c_str(),file.target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))
        throw std::runtime_error("Could not replace the plugin. Close OBS and try again.");
      file.committed=true;
      if (afterCommit) afterCommit(++count);
    }
    return backup;
  } catch (...) {
    bool restored=true;
    for (auto it=files.rbegin();it!=files.rend();++it) {
      DeleteFileW(it->temp.c_str());
      if (!it->committed) continue;
      if (it->existed) restored=CopyFileW(it->backup.c_str(),it->target.c_str(),FALSE) && restored;
      else restored=DeleteFileW(it->target.c_str()) && restored;
    }
    if (!restored) throw std::runtime_error("Installation failed and automatic restoration was incomplete. Previous files are in data/obs-plugins/fplayback-youtube/backups inside OBS.");
    throw;
  }
}
}
